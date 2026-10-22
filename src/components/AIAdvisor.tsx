import React, { useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  Award,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  RefreshCw,
  Compass,
  Zap,
  Target,
  BarChart3,
  Archive,
  ListTodo,
  ShieldCheck,
  UserCheck,
  Clock,
  ArrowRight,
  Flame,
  Check,
  Layers,
  FileCheck2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { Task, UserProfile, AIStrategicReview, StrategicRecommendation } from '../types/task';
import { generateLocalStrategicReview, calculateDashboardStats } from '../utils/taskCalculations';

interface AIAdvisorProps {
  tasks: Task[];
  userProfile: UserProfile;
}

export const AIAdvisor: React.FC<AIAdvisorProps> = ({ tasks, userProfile }) => {
  const [review, setReview] = useState<AIStrategicReview>(() =>
    generateLocalStrategicReview(tasks)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [timeframeFilter, setTimeframeFilter] = useState<'all' | 'today' | 'this_week' | 'long_term'>('all');

  const stats = calculateDashboardStats(tasks);
  const completedTasks = tasks.filter((t) => t.status === 'completed' || t.progress === 100);
  const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.progress < 100);

  const handleRefreshAnalysis = async () => {
    setIsLoading(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch('/api/ai/evaluate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks, userProfile }),
      });

      if (res.ok) {
        const data = await res.json();
        const localFallback = generateLocalStrategicReview(tasks);

        setReview({
          score: data.score ?? localFallback.score,
          grade: data.grade ?? localFallback.grade,
          overallSummary: data.overallSummary ?? localFallback.overallSummary,
          completionRate: stats.completionRate,
          onTimeRate: data.weeklyArchiveAnalysis?.onTimeCompletionRate ?? localFallback.onTimeRate,
          averageVelocityDays: data.weeklyArchiveAnalysis?.averageLeadTimeDays ?? localFallback.averageVelocityDays,
          weeklyArchiveAnalysis: data.weeklyArchiveAnalysis || localFallback.weeklyArchiveAnalysis,
          systemPragmatism: data.systemPragmatism || localFallback.systemPragmatism,
          taskExecution: data.taskExecution || localFallback.taskExecution,
          userManagement: data.userManagement || localFallback.userManagement,
          strengths: data.strengths || localFallback.strengths,
          bottlenecks: data.bottlenecks || localFallback.bottlenecks,
          gaps: data.gaps || localFallback.gaps || [],
          recommendations: (data.recommendations || localFallback.recommendations).map((r: any, idx: number) => ({
            id: `rec-${idx}-${Date.now()}`,
            title: r.title,
            detail: r.detail,
            tag: r.tag || 'Chiến lược',
            impact: r.impact || 'medium',
            timeframe: r.timeframe || 'this_week',
          })),
          analyzedAt: new Date().toISOString(),
        });
        setFeedbackMessage('AI Cố vấn Chiến lược đã đọc xong 3 nguồn dữ liệu và cập nhật đánh giá mới nhất!');
      } else {
        throw new Error('API server unavailable');
      }
    } catch {
      // Local fallback with recalculated real-time data
      const local = generateLocalStrategicReview(tasks);
      setReview(local);
      setFeedbackMessage('Đã cập nhật phân tích chiến lược toàn diện theo thuật toán chuyên sâu.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRecommendations = review.recommendations.filter((rec) => {
    if (timeframeFilter === 'all') return true;
    return rec.timeframe === timeframeFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-violet-950 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-indigo-950/15 flex flex-col md:flex-row md:items-center justify-between gap-6 border border-indigo-900/40">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 text-violet-200 border border-violet-400/30 text-xs font-semibold backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            AI Cố Vấn Chiến Lược &amp; Quản Trị Hệ Thống
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Cố Vấn Chiến Lược &amp; Đánh Giá Toàn Diện
          </h1>
          <p className="text-violet-200/90 text-xs sm:text-sm leading-relaxed">
            Hệ thống AI tự động đọc <strong>Tổng quan số liệu</strong>, quét <strong>Nhiệm vụ đang triển khai</strong> và phân tích <strong>Lưu trữ hoàn thành hằng tuần</strong> để đưa ra đánh giá thực dụng, sức khỏe thực thi và năng lực quản lý của bạn.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleRefreshAnalysis}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white font-bold text-xs sm:text-sm shadow-lg shadow-violet-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang phân tích 3 nguồn dữ liệu...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Phân tích lại toàn diện
              </>
            )}
          </button>
        </div>
      </div>

      {feedbackMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{feedbackMessage}</span>
        </div>
      )}

      {/* 3 Nguồn Dữ Liệu Được AI Phân Tích (Data Feeds Bar) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Source 1: Tổng quan */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              1. Tổng Quan Chỉ Số
            </span>
            <div className="font-extrabold text-sm text-slate-900 truncate">
              {stats.total} việc • Tỷ lệ xong {stats.completionRate}%
            </div>
            <span className="text-[11px] text-slate-400">
              {stats.overdue} trễ hạn • {userProfile.units.length} đơn vị
            </span>
          </div>
        </div>

        {/* Source 2: Nhiệm vụ đang chạy */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ListTodo className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              2. Nhiệm Vụ Đang Chạy
            </span>
            <div className="font-extrabold text-sm text-slate-900 truncate">
              {activeTasks.length} việc mở • {review.taskExecution.urgentPendingCount} việc gấp
            </div>
            <span className="text-[11px] text-slate-400">
              {review.systemPragmatism.subtaskUtilizationRate}% có checklist subtasks
            </span>
          </div>
        </div>

        {/* Source 3: Lưu trữ hoàn thành hằng tuần */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Archive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              3. Lưu Trữ Hằng Tuần
            </span>
            <div className="font-extrabold text-sm text-slate-900 truncate">
              {review.weeklyArchiveAnalysis.thisWeekCompletedCount} xong tuần này • {completedTasks.length} lưu kho
            </div>
            <span className="text-[11px] text-slate-400">
              Đúng hạn {review.weeklyArchiveAnalysis.onTimeCompletionRate}% • {review.weeklyArchiveAnalysis.averageLeadTimeDays} ngày/việc
            </span>
          </div>
        </div>
      </div>

      {/* Tổng quan Điểm & Đánh Giá Executive */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Score Ring / Grade */}
        <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col items-center justify-center text-center space-y-4">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Chỉ Số Hiệu Suất Quản Trị
          </span>

          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="#F1F5F9"
                strokeWidth="10"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="#8B5CF6"
                strokeWidth="10"
                strokeDasharray={`${(review.score / 100) * 251.32} 251.32`}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-4xl font-black text-slate-900 tracking-tight">
                {review.score}
              </span>
              <span className="text-[11px] font-semibold text-slate-400">/ 100 Điểm</span>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-extrabold">
            <Award className="w-3.5 h-3.5" />
            Xếp loại: {review.grade}
          </div>

          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Dựa trên {stats.total} nhiệm vụ, tỷ lệ hoàn tất {stats.completionRate}%, {stats.overdue} việc trễ hạn và {review.weeklyArchiveAnalysis.thisWeekCompletedCount} việc xong trong tuần.
          </p>
        </div>

        {/* AI Executive Summary & Core Insights */}
        <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">Báo Cáo Tổng Hợp Từ Cố Vấn AI</h2>
            </div>
            <p className="text-slate-700 text-sm leading-relaxed p-4 rounded-2xl bg-slate-50 border border-slate-100 font-medium">
              &quot;{review.overallSummary}&quot;
            </p>
          </div>

          {/* Strengths & Bottlenecks Split */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Strengths */}
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ĐIỂM SÁNG NĂNG SUẤT
              </div>
              <ul className="space-y-1.5 text-xs text-emerald-900">
                {review.strengths.slice(0, 3).map((str, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="font-bold text-emerald-600">•</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Bottlenecks */}
            <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-100 space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                ĐIỂM NGHẼN &amp; RỦI RO TIẾN ĐỘ
              </div>
              <ul className="space-y-1.5 text-xs text-rose-900">
                {review.bottlenecks.slice(0, 3).map((bot, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="font-bold text-rose-600">•</span>
                    <span>{bot}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* MỤC THIẾU SÓT & ĐỀ XUẤT KHẮC PHỤC NGAY (Gaps & Deficiencies Analysis) */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Phân Tích Thiếu Sót &amp; Đề Xuất Khắc Phục Ngay
              </h2>
              <p className="text-xs text-slate-500">
                AI rà soát 3 nguồn dữ liệu (Tổng quan, Việc đang làm, Lưu trữ) để chỉ rõ thiếu sót ở mục nào và đề xuất giải pháp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 font-extrabold text-xs border border-slate-200">
              Điểm: {review.score}/100 (Khởi điểm 0/100, hoàn thành sẽ cộng thêm)
            </span>
            <span className="px-3 py-1 rounded-xl bg-amber-100 text-amber-800 font-bold text-xs">
              {review.gaps?.length || 0} điểm lưu ý
            </span>
          </div>
        </div>

        {/* Gaps List */}
        {!review.gaps || review.gaps.length === 0 ? (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Hệ thống ghi nhận không có thiếu sót nghiêm trọng nào. Mọi nhiệm vụ đều được chuẩn hóa tốt!</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {review.gaps.map((gap) => (
              <div
                key={gap.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 ${
                  gap.severity === 'critical'
                    ? 'bg-rose-50/60 border-rose-200/80'
                    : gap.severity === 'warning'
                    ? 'bg-amber-50/60 border-amber-200/80'
                    : 'bg-blue-50/60 border-blue-200/80'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                        gap.severity === 'critical'
                          ? 'bg-rose-200/80 text-rose-800'
                          : gap.severity === 'warning'
                          ? 'bg-amber-200/80 text-amber-800'
                          : 'bg-blue-200/80 text-blue-800'
                      }`}
                    >
                      {gap.severity === 'critical'
                        ? 'Cần xử lý ngay'
                        : gap.severity === 'warning'
                        ? 'Cảnh báo thiếu sót'
                        : 'Khuyến nghị chuẩn hóa'}
                    </span>

                    <span className="text-[10px] font-semibold text-slate-500 uppercase">
                      Mục: {gap.category === 'completion' ? 'Nghiệm thu' : gap.category === 'subtasks' ? 'Checklists' : gap.category === 'deadline' ? 'Thời hạn' : gap.category === 'attachments' ? 'Minh chứng' : 'Đơn vị'}
                    </span>
                  </div>

                  <h3 className="font-bold text-xs sm:text-sm text-slate-900 leading-snug">
                    {gap.title}
                  </h3>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {gap.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-start gap-1.5 text-xs text-indigo-900 font-medium">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-[11px]">
                    <strong>Đề xuất khắc phục:</strong> {gap.recommendation}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TRỤ CỘT 1: ĐÁNH GIÁ TÍNH THỰC DỤNG CỦA HỆ THỐNG TASKMASTER */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                1. Đánh Giá Tính Thực Dụng Của Hệ Thống TaskMaster
              </h2>
              <p className="text-xs text-slate-500">
                Phân tích xem quy trình quản lý có thực chiến, hữu ích hay chỉ ghi chép hình thức
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1 rounded-xl bg-blue-100 text-blue-800 font-extrabold text-xs">
              Điểm thực dụng: {review.systemPragmatism.pragmatismScore}/100
            </span>
            <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200">
              {review.systemPragmatism.pragmatismGrade}
            </span>
          </div>
        </div>

        {/* Pragmatism Assessment Statement */}
        <p className="text-xs sm:text-sm text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed font-medium">
          {review.systemPragmatism.assessmentSummary}
        </p>

        {/* Feature Utilization Breakdown Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Subtask checklist utilization */}
          <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Phân rã Subtasks</span>
              <span className="font-bold text-indigo-600">
                {review.systemPragmatism.subtaskUtilizationRate}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full"
                style={{ width: `${review.systemPragmatism.subtaskUtilizationRate}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 block">
              Chia nhỏ việc thành các bước con
            </span>
          </div>

          {/* Attachment & Link Proofs */}
          <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Tài liệu &amp; Minh chứng</span>
              <span className="font-bold text-emerald-600">
                {review.systemPragmatism.attachmentUtilizationRate}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full"
                style={{ width: `${review.systemPragmatism.attachmentUtilizationRate}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 block">
              Đính kèm tệp PDF/Word/Link
            </span>
          </div>

          {/* Explicit Unit Assignment */}
          <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Giao việc đúng đơn vị</span>
              <span className="font-bold text-violet-600">
                {review.systemPragmatism.unitAssignmentRate}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-violet-600 rounded-full"
                style={{ width: `${review.systemPragmatism.unitAssignmentRate}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 block">
              Rõ ràng cơ quan chịu trách nhiệm
            </span>
          </div>

          {/* Deadline Precision */}
          <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Kỷ luật hạn chót</span>
              <span className="font-bold text-amber-600">
                {review.systemPragmatism.deadlinePrecisionRate}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${review.systemPragmatism.deadlinePrecisionRate}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 block">
              Mốc giờ &amp; ngày tháng chính xác
            </span>
          </div>
        </div>

        {/* Practical Strengths and Practical Gaps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-2">
            <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Check className="w-4 h-4 text-blue-600" />
              Điểm Thực Chiến Phát Huy Tốt Nhất:
            </span>
            <ul className="space-y-1 text-xs text-blue-800">
              {review.systemPragmatism.practicalStrengths.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-2">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-600" />
              Cải Tiến Quy Trình Để Không Hình Thức:
            </span>
            <ul className="space-y-1 text-xs text-amber-800">
              {review.systemPragmatism.practicalGaps.map((g, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-500">•</span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* TRỤ CỘT 2: TÌNH HÌNH THỰC HIỆN NHIỆM VỤ & RỦI RO TIẾN ĐỘ */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                2. Tình Hình Thực Hiện Nhiệm Vụ &amp; Rủi Ro Tiến Độ
              </h2>
              <p className="text-xs text-slate-500">
                Đánh giá áp lực công việc đang mở, các việc khẩn và rủi ro trễ hạn
              </p>
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto ${
              review.taskExecution.healthLevel === 'healthy'
                ? 'bg-emerald-100 text-emerald-800'
                : review.taskExecution.healthLevel === 'warning'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800'
            }`}
          >
            {review.taskExecution.healthLevel === 'healthy' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            <span>{review.taskExecution.healthLabel}</span>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
          {review.taskExecution.executionSummary}
        </p>

        {/* Execution Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-100 text-center">
            <span className="text-[11px] font-bold text-rose-700 block">Việc Quá Hạn Cần Dập Lửa</span>
            <span className="text-2xl font-black text-rose-600 mt-1 block">
              {review.taskExecution.overdueCount}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100 text-center">
            <span className="text-[11px] font-bold text-amber-700 block">Việc Ưu Tiên Cao (Gấp)</span>
            <span className="text-2xl font-black text-amber-600 mt-1 block">
              {review.taskExecution.urgentPendingCount}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 text-center">
            <span className="text-[11px] font-bold text-blue-700 block">Nhiệm Vụ Đang Mở</span>
            <span className="text-2xl font-black text-blue-600 mt-1 block">
              {review.taskExecution.inProgressCount}
            </span>
          </div>
        </div>

        {/* Immediate Risks Callout */}
        {review.taskExecution.immediateRisks.length > 0 && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-1.5">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>CẢNH BÁO RỦI RO CẦN HÀNH ĐỘNG TRONG 24 - 48 GIỜ:</span>
            </div>
            <ul className="space-y-1 text-xs text-rose-900 pl-6 list-disc">
              {review.taskExecution.immediateRisks.map((risk, i) => (
                <li key={i}>{risk}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* TRỤ CỘT 3: ĐÁNH GIÁ KHẢ NĂNG QUẢN LÝ CÔNG VIỆC CỦA NGƯỜI DÙNG */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                3. Đánh Giá Khả Năng Quản Lý Công Việc Của Người Dùng
              </h2>
              <p className="text-xs text-slate-500">
                Chấm điểm năng lực điều hành và xếp cấp độ trưởng thành quản trị công việc
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3.5 py-1 rounded-xl bg-violet-100 text-violet-900 font-extrabold text-xs">
              Năng lực: {review.userManagement.capabilityScore}/100
            </span>
            <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200">
              {review.userManagement.maturityStage}
            </span>
          </div>
        </div>

        {/* 4 Core Competency Progress Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Lập Kế Hoạch &amp; Ưu Tiên Hóa</span>
              <span className="font-extrabold text-indigo-600">
                {review.userManagement.planningScore}/100
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full"
                style={{ width: `${review.userManagement.planningScore}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 block">
              Xác định mục tiêu rõ ràng và mốc thời gian khả thi
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Kỷ Luật Thực Thi &amp; Phân Rã Việc</span>
              <span className="font-extrabold text-emerald-600">
                {review.userManagement.executionDisciplineScore}/100
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full"
                style={{ width: `${review.userManagement.executionDisciplineScore}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 block">
              Theo đuổi mục tiêu và giải quyết dứt điểm từng subtask
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Kiểm Soát Hạn Chót &amp; Rủi Ro</span>
              <span className="font-extrabold text-amber-600">
                {review.userManagement.deadlineControlScore}/100
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${review.userManagement.deadlineControlScore}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 block">
              Chủ động chặn trước tình huống chậm trễ và quá tải
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Điều Phối &amp; Đa Đơn Vị</span>
              <span className="font-extrabold text-violet-600">
                {review.userManagement.crossUnitCoordinationScore}/100
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-violet-600 rounded-full"
                style={{ width: `${review.userManagement.crossUnitCoordinationScore}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 block">
              Phối hợp nhịp nhàng giữa {userProfile.units.length} đơn vị công tác
            </span>
          </div>
        </div>

        {/* Personalized Coaching Box */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 space-y-2">
          <div className="flex items-center gap-2 text-violet-900 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <span>LỜI KHUYÊN HUẤN LUYỆN CHIẾN LƯỢC DÀNH RIÊNG CHO BẠN:</span>
          </div>
          <p className="text-xs sm:text-sm text-violet-950 font-medium leading-relaxed">
            &quot;{review.userManagement.coachingGuidance}&quot;
          </p>
        </div>
      </div>

      {/* TRỤ CỘT 4: CHIẾN LƯỢC HÀNH ĐỘNG TỐI ƯU HIỆU QUẢ */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                4. Đề Xuất Chiến Lược Hành Động Tối Ưu
              </h2>
              <p className="text-xs text-slate-500">
                Kế hoạch hành động cụ thể giúp nâng cao năng suất và giải phóng áp lực
              </p>
            </div>
          </div>

          {/* Timeframe Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 self-start sm:self-auto">
            <button
              onClick={() => setTimeframeFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeframeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setTimeframeFilter('today')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeframeFilter === 'today'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setTimeframeFilter('this_week')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeframeFilter === 'this_week'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tuần này
            </button>
            <button
              onClick={() => setTimeframeFilter('long_term')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeframeFilter === 'long_term'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dài hạn
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {filteredRecommendations.map((rec) => (
            <div
              key={rec.id}
              className="p-5 rounded-2xl border border-slate-200/90 hover:border-indigo-300 hover:shadow-xs transition-all space-y-3 flex flex-col justify-between bg-white"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-extrabold uppercase">
                    {rec.tag}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {rec.timeframe && (
                      <span className="text-[10px] font-semibold text-slate-400">
                        {rec.timeframe === 'today' ? '⚡ Cần làm ngay' : rec.timeframe === 'this_week' ? '📅 Trong tuần' : '🎯 Dài hạn'}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        rec.impact === 'high'
                          ? 'bg-rose-100 text-rose-700'
                          : rec.impact === 'medium'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      Tác động {rec.impact === 'high' ? 'Cao' : rec.impact === 'medium' ? 'Trung bình' : 'Tiêu chuẩn'}
                    </span>
                  </div>
                </div>

                <h3 className="font-bold text-slate-900 text-sm">{rec.title}</h3>
                <p className="text-slate-600 text-xs mt-1.5 leading-relaxed">{rec.detail}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-indigo-600 font-semibold">
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" />
                  <span>Áp dụng chiến lược này</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
