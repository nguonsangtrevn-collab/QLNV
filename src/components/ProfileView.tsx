import React, { useState } from 'react';
import {
  User,
  Calendar,
  Building2,
  Upload,
  Link2,
  Bell,
  Volume2,
  CheckCircle2,
  ShieldAlert,
  Save,
  Plus,
  X,
  ExternalLink,
  Trash2,
  Copy,
  Check,
  HardDrive,
  MessageSquare,
  Send,
  FileText,
  Layers,
  Globe,
  Share2,
  AlertTriangle,
  Info
} from 'lucide-react';
import { UserProfile, ConnectedAppItem } from '../types/task';
import { defaultConnectedApps } from '../data/seedData';
import { playNotificationSound, sendBrowserNotification } from '../utils/audioNotification';

interface ProfileViewProps {
  profile: UserProfile;
  onUpdateProfile: (updated: UserProfile) => void;
}

const APP_PRESETS = [
  {
    key: 'gcalendar',
    name: 'Google Calendar',
    url: 'https://calendar.google.com',
    category: 'calendar' as const,
    description: 'Đồng bộ lịch công tác tuần, lịch họp chi bộ và tự động nhắc sự kiện',
    iconKey: 'calendar',
  },
  {
    key: 'gdrive',
    name: 'Google Drive & Docs',
    url: 'https://drive.google.com',
    category: 'storage' as const,
    description: 'Kho lưu trữ biên bản, nghị quyết, tài liệu minh chứng và hồ sơ nhiệm vụ',
    iconKey: 'drive',
  },
  {
    key: 'zalo',
    name: 'Zalo Chat & OA',
    url: 'https://chat.zalo.me',
    category: 'communication' as const,
    description: 'Điều phối trực tiếp các nhóm công tác, tiếp nhận phản hồi tức thời',
    iconKey: 'zalo',
  },
  {
    key: 'telegram',
    name: 'Telegram Messenger',
    url: 'https://web.telegram.org',
    category: 'communication' as const,
    description: 'Kênh nhận thông báo tự động và báo cáo tiến độ khẩn cấp',
    iconKey: 'telegram',
  },
  {
    key: 'notion',
    name: 'Notion Workspace',
    url: 'https://www.notion.so',
    category: 'document' as const,
    description: 'Cơ sở tri thức nội bộ, ghi chép sổ tay công việc và chiến lược',
    iconKey: 'notion',
  },
  {
    key: 'trello',
    name: 'Trello Board',
    url: 'https://trello.com',
    category: 'project_management' as const,
    description: 'Bảng Kanban trực quan điều phối công việc liên phòng ban',
    iconKey: 'trello',
  },
  {
    key: 'slack',
    name: 'Slack Workspace',
    url: 'https://app.slack.com',
    category: 'communication' as const,
    description: 'Không gian trao đổi nghiệp vụ và tích hợp thông báo webhook',
    iconKey: 'slack',
  },
  {
    key: 'github',
    name: 'GitHub Repository',
    url: 'https://github.com',
    category: 'project_management' as const,
    description: 'Theo dõi mã nguồn dự án, báo cáo lỗi và tiến độ kỹ thuật',
    iconKey: 'github',
  },
  {
    key: 'custom',
    name: '',
    url: '',
    category: 'other' as const,
    description: '',
    iconKey: 'custom',
  },
];

export const ProfileView: React.FC<ProfileViewProps> = ({ profile, onUpdateProfile }) => {
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [newUnitText, setNewUnitText] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Connected apps real state
  const [connectedApps, setConnectedApps] = useState<ConnectedAppItem[]>(() => {
    if (formData.connectedAppsList && formData.connectedAppsList.length > 0) {
      return formData.connectedAppsList;
    }
    return defaultConnectedApps;
  });

  // Modal & interactive states for apps
  const [isAddAppModalOpen, setIsAddAppModalOpen] = useState(false);
  const [appToDelete, setAppToDelete] = useState<ConnectedAppItem | null>(null);
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);

  // New App Form
  const [presetChoice, setPresetChoice] = useState('gcalendar');
  const [appName, setAppName] = useState('Google Calendar');
  const [appUrl, setAppUrl] = useState('https://calendar.google.com');
  const [appCategory, setAppCategory] = useState<ConnectedAppItem['category']>('calendar');
  const [appDescription, setAppDescription] = useState('Đồng bộ lịch công tác tuần và nhắc việc');
  const [appFormError, setAppFormError] = useState('');

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setFormData((prev) => ({
          ...prev,
          avatarUrl: event.target!.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddUnit = () => {
    const trimmed = newUnitText.trim();
    if (!trimmed) return;
    if (formData.units.includes(trimmed)) {
      setNewUnitText('');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      units: [...prev.units, trimmed],
    }));
    setNewUnitText('');
  };

  const handleRemoveUnit = (unitToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      units: prev.units.filter((u) => u !== unitToRemove),
    }));
  };

  const handleToggleNotification = (key: keyof UserProfile['notifications']) => {
    setFormData((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: !prev.notifications[key],
      },
    }));
  };

  const handleTestChime = () => {
    playNotificationSound('reminder');
  };

  const handleTestBrowserNotification = async () => {
    const allowed = await sendBrowserNotification('TaskMaster AI', {
      body: 'Đây là thông báo mẫu nhắc nhở nhiệm vụ ưu tiên của bạn!',
    });
    if (!allowed) {
      setStatusNotice({
        type: 'error',
        text: 'Vui lòng cấp quyền thông báo trên trình duyệt của bạn trong phần Cài đặt trang web.',
      });
      setTimeout(() => setStatusNotice(null), 5000);
    } else {
      setStatusNotice({
        type: 'success',
        text: 'Đã gửi thông báo mẫu lên màn hình trình duyệt thành công!',
      });
      setTimeout(() => setStatusNotice(null), 4000);
    }
  };

  // Connected Apps Handlers
  const handleOpenAddModal = () => {
    setPresetChoice('custom');
    setAppName('');
    setAppUrl('');
    setAppCategory('other');
    setAppDescription('');
    setAppFormError('');
    setIsAddAppModalOpen(true);
  };

  const handleSelectPreset = (key: string) => {
    setPresetChoice(key);
    const preset = APP_PRESETS.find((p) => p.key === key);
    if (preset && key !== 'custom') {
      setAppName(preset.name);
      setAppUrl(preset.url);
      setAppCategory(preset.category);
      setAppDescription(preset.description);
    } else {
      setAppName('');
      setAppUrl('');
      setAppCategory('other');
      setAppDescription('');
    }
  };

  const handleAddAppSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppFormError('');

    const trimmedName = appName.trim();
    let trimmedUrl = appUrl.trim();

    if (!trimmedName) {
      setAppFormError('Vui lòng nhập tên ứng dụng');
      return;
    }
    if (!trimmedUrl) {
      setAppFormError('Vui lòng nhập địa chỉ liên kết (URL)');
      return;
    }

    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      trimmedUrl = `https://${trimmedUrl}`;
    }

    try {
      new URL(trimmedUrl);
    } catch {
      setAppFormError('Đường link URL không hợp lệ (Ví dụ: https://calendar.google.com)');
      return;
    }

    const newApp: ConnectedAppItem = {
      id: `app-${Date.now()}`,
      name: trimmedName,
      url: trimmedUrl,
      category: appCategory,
      description: appDescription.trim() || 'Ứng dụng liên kết công việc',
      isConnected: true,
      addedAt: new Date().toISOString(),
      iconKey: presetChoice !== 'custom' ? presetChoice : 'custom',
    };

    const nextApps = [newApp, ...connectedApps];
    setConnectedApps(nextApps);
    const updatedProfile = {
      ...formData,
      connectedAppsList: nextApps,
    };
    setFormData(updatedProfile);
    onUpdateProfile(updatedProfile);
    setIsAddAppModalOpen(false);
  };

  const handleDeleteAppConfirm = (id: string) => {
    const nextApps = connectedApps.filter((a) => a.id !== id);
    setConnectedApps(nextApps);
    const updatedProfile = {
      ...formData,
      connectedAppsList: nextApps,
    };
    setFormData(updatedProfile);
    onUpdateProfile(updatedProfile);
    setAppToDelete(null);
  };

  const handleToggleAppStatus = (id: string) => {
    const nextApps = connectedApps.map((a) =>
      a.id === id ? { ...a, isConnected: !a.isConnected } : a
    );
    setConnectedApps(nextApps);
    const updatedProfile = {
      ...formData,
      connectedAppsList: nextApps,
    };
    setFormData(updatedProfile);
    onUpdateProfile(updatedProfile);
  };

  const handleCopyUrl = (id: string, url: string) => {
    try {
      navigator.clipboard.writeText(url);
      setCopiedAppId(id);
      setTimeout(() => setCopiedAppId(null), 2000);
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalProfile: UserProfile = {
      ...formData,
      connectedAppsList: connectedApps,
    };
    onUpdateProfile(finalProfile);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const renderAppIcon = (app: ConnectedAppItem) => {
    const key = app.iconKey || app.category;
    switch (key) {
      case 'calendar':
      case 'gcalendar':
        return <Calendar className="w-5 h-5 text-indigo-600" />;
      case 'storage':
      case 'drive':
      case 'gdrive':
        return <HardDrive className="w-5 h-5 text-emerald-600" />;
      case 'communication':
      case 'zalo':
        return <MessageSquare className="w-5 h-5 text-blue-600" />;
      case 'telegram':
        return <Send className="w-5 h-5 text-sky-500" />;
      case 'document':
      case 'notion':
        return <FileText className="w-5 h-5 text-stone-700" />;
      case 'project_management':
      case 'trello':
        return <Layers className="w-5 h-5 text-violet-600" />;
      case 'slack':
        return <Share2 className="w-5 h-5 text-pink-600" />;
      case 'github':
        return <Globe className="w-5 h-5 text-slate-800" />;
      default:
        return <ExternalLink className="w-5 h-5 text-indigo-600" />;
    }
  };

  const getCategoryLabel = (category: ConnectedAppItem['category']) => {
    switch (category) {
      case 'calendar':
        return 'Lịch làm việc';
      case 'storage':
        return 'Lưu trữ & Tệp';
      case 'communication':
        return 'Nhóm trao đổi & Chat';
      case 'project_management':
        return 'Quản lý dự án';
      case 'document':
        return 'Soạn thảo & Tri thức';
      default:
        return 'Tiện ích mở rộng';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-slate-950/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 rounded-2xl ring-4 ring-indigo-500/30 overflow-hidden shrink-0 shadow-lg bg-slate-800">
            <img
              src={formData.avatarUrl}
              alt={formData.displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80';
              }}
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold">{formData.displayName}</h1>
            <p className="text-xs text-indigo-200">
              {formData.units.length} Đơn vị sinh hoạt • {connectedApps.filter((a) => a.isConnected).length}/{connectedApps.length} Ứng dụng liên kết thực tế
            </p>
            <span className="inline-block px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-200 text-[11px] font-medium border border-indigo-400/20">
              Tài khoản Quản trị &amp; Điều hành
            </span>
          </div>
        </div>

        {saveSuccess && (
          <div className="bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            Đã lưu hồ sơ thành công!
          </div>
        )}

        {statusNotice && (
          <div
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
              statusNotice.type === 'success'
                ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-200'
                : 'bg-rose-500/20 border border-rose-400/40 text-rose-200'
            }`}
          >
            {statusNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
            )}
            <span>{statusNotice.text}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Thông tin cá nhân cơ bản */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <User className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Thông Tin Định Danh
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Họ và Tên Cán Bộ:
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs sm:text-sm font-medium"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Ngày Tháng Năm Sinh:
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs sm:text-sm font-medium"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Email Liên Hệ:
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs sm:text-sm font-medium"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Số Điện Thoại:
              </label>
              <input
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs sm:text-sm font-medium"
                placeholder="0912 345 678"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Thay Đổi Ảnh Đại Diện (Tải ảnh từ máy tính hoặc dán link URL):
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  value={formData.avatarUrl}
                  onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                  placeholder="https://..."
                  className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs font-mono"
                />
                <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Chọn tệp ảnh</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Ghi Chú Cá Nhân / Chức Trách Đảm Nhiệm:
              </label>
              <textarea
                rows={2}
                value={formData.bio || ''}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Ghi chú về phân công công tác hoặc nhiệm vụ chuyên trách..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs sm:text-sm"
              />
            </div>
          </div>
        </div>

        {/* 2. Đơn vị sinh hoạt */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Các Đơn Vị Đang Sinh Hoạt / Phụ Trách
            </h2>
          </div>

          <p className="text-xs text-slate-500">
            Các đơn vị này sẽ xuất hiện trong danh sách lựa chọn khi bạn tạo và phân loại nhiệm vụ.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={newUnitText}
              onChange={(e) => setNewUnitText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddUnit();
                }
              }}
              placeholder="Nhập tên đơn vị mới (Ví dụ: Ban Chấp Hành, Tổ Công Tác Số 2...)"
              className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs sm:text-sm font-medium"
            />
            <button
              type="button"
              onClick={handleAddUnit}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm
            </button>
          </div>

          <div className="pt-2">
            <span className="text-xs font-semibold text-slate-600 block mb-2">
              Danh sách đơn vị đã thiết lập:
            </span>
            <div className="flex flex-wrap gap-2">
              {formData.units.map((unit) => (
                <div
                  key={unit}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-bold border border-slate-200 transition-all group"
                >
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{unit}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveUnit(unit)}
                    className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    aria-label={`Xóa đơn vị ${unit}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. LIÊN KẾT ỨNG DỤNG KHÁC (RÕ RÀNG & LIÊN KẾT THẬT SỰ - THÊM / MỞ / XÓA) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Link2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Liên Kết Ứng Dụng Khác
                </h2>
                <p className="text-xs text-slate-500">
                  Kết nối thật sự với các công cụ làm việc bên ngoài. Nhấn để truy cập trực tiếp, thêm ứng dụng hoặc xóa liên kết.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs hover:shadow-indigo-600/20 cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm ứng dụng liên kết
            </button>
          </div>

          {/* Connected Apps Grid */}
          {connectedApps.length === 0 ? (
            <div className="text-center py-8 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-slate-500">
              <Link2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold">Chưa có ứng dụng nào được liên kết.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Nhấn &quot;Thêm ứng dụng liên kết&quot; để kết nối Google Calendar, Drive, Zalo, Notion hoặc công cụ riêng của bạn.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {connectedApps.map((app) => (
                <div
                  key={app.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    app.isConnected
                      ? 'border-slate-200/90 bg-white hover:border-indigo-300 hover:shadow-xs'
                      : 'border-slate-200 bg-slate-50/60 opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0">
                        {renderAppIcon(app)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                            {app.name}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                            {getCategoryLabel(app.category)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                          {app.description}
                        </p>
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-600 hover:text-indigo-800 hover:underline mt-1 truncate max-w-xs"
                          title={app.url}
                        >
                          <Globe className="w-3 h-3 shrink-0" />
                          <span className="truncate">{app.url.replace(/^https?:\/\//, '')}</span>
                        </a>
                      </div>
                    </div>

                    {/* Status switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleAppStatus(app.id)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 transition-colors cursor-pointer ${
                        app.isConnected
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                      title={app.isConnected ? 'Nhấn để tạm ngắt' : 'Nhấn để kích hoạt'}
                    >
                      {app.isConnected ? 'Đã liên kết' : 'Tạm dừng'}
                    </button>
                  </div>

                  {/* Actions: Open Real App, Copy Link, Delete */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Mở ứng dụng</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => handleCopyUrl(app.id, app.url)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer relative"
                        title="Sao chép địa chỉ liên kết"
                      >
                        {copiedAppId === app.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAppToDelete(app)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
                      title="Xóa liên kết ứng dụng này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Cài đặt thông báo & nhắc việc ưu tiên */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Cài Đặt Thông Báo &amp; Nhắc Việc Ưu Tiên
              </h2>
            </div>
            <button
              type="button"
              onClick={handleTestChime}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Nghe thử chuông nhắc
            </button>
          </div>

          <div className="space-y-3">
            {/* Browser Notifications */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div>
                <span className="font-bold text-xs text-slate-800 block">
                  Thông báo đẩy trên trình duyệt (Web Notifications)
                </span>
                <span className="text-[11px] text-slate-500">
                  Hiển thị banner thông báo khi sắp đến giờ hoàn thành nhiệm vụ
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestBrowserNotification}
                  className="text-[11px] font-semibold text-indigo-600 underline mr-2 cursor-pointer"
                >
                  Gửi thử
                </button>
                <input
                  type="checkbox"
                  checked={formData.notifications.browserEnabled}
                  onChange={() => handleToggleNotification('browserEnabled')}
                  className="w-4 h-4 rounded-sm text-indigo-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Sound Notifications */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div>
                <span className="font-bold text-xs text-slate-800 block">
                  Âm thanh chuông báo (Chime Sound)
                </span>
                <span className="text-[11px] text-slate-500">
                  Phát âm thanh nhẹ nhàng khi tick subtask hoặc khi có việc khẩn
                </span>
              </div>
              <input
                type="checkbox"
                checked={formData.notifications.soundEnabled}
                onChange={() => handleToggleNotification('soundEnabled')}
                className="w-4 h-4 rounded-sm text-indigo-600 cursor-pointer"
              />
            </div>

            {/* Priority task reminders */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div>
                <span className="font-bold text-xs text-slate-800 block">
                  Nhắc việc ưu tiên cao (Khẩn cấp)
                </span>
                <span className="text-[11px] text-slate-500">
                  Ưu tiên cảnh báo lặp lại đối với các nhiệm vụ gắn nhãn &quot;Cao (Gấp)&quot;
                </span>
              </div>
              <input
                type="checkbox"
                checked={formData.notifications.priorityReminders}
                onChange={() => handleToggleNotification('priorityReminders')}
                className="w-4 h-4 rounded-sm text-indigo-600 cursor-pointer"
              />
            </div>

            {/* Overdue alerts */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-rose-50/60 border border-rose-100">
              <div>
                <span className="font-bold text-xs text-rose-900 block flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  Dải cảnh báo nhiệm vụ trễ hạn (Overdue Alert Banner)
                </span>
                <span className="text-[11px] text-rose-700/80">
                  Hiển thị thanh cảnh báo đỏ cố định trên đầu trang khi có việc trễ hạn
                </span>
              </div>
              <input
                type="checkbox"
                checked={formData.notifications.overdueAlerts}
                onChange={() => handleToggleNotification('overdueAlerts')}
                className="w-4 h-4 rounded-sm text-rose-600 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 5. Quản lý lưu trữ dữ liệu thời gian thực */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Lưu Trữ Dữ Liệu Thời Gian Thực (Persistent Local DB)
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
              Tự động lưu 100%
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Hệ thống tự động lưu trữ tức thì mọi thay đổi về nhiệm vụ, subtasks, tài liệu và hồ sơ vào bộ nhớ thiết bị. Dữ liệu sẽ <strong>không bao giờ bị reset lại ban đầu</strong> khi tải lại trang hoặc mở trình duyệt mới.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                const tasks = localStorage.getItem('taskmaster_tasks') || '[]';
                const profile = localStorage.getItem('taskmaster_profile') || '{}';
                const backup = {
                  version: '1.1',
                  exportedAt: new Date().toISOString(),
                  tasks: JSON.parse(tasks),
                  profile: JSON.parse(profile),
                };
                const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `TaskMaster_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
            >
              📥 Xuất file sao lưu (JSON)
            </button>

            <label
              htmlFor="restore-file-input"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
            >
              📤 Khôi phục từ file JSON
            </label>
            <input
              type="file"
              id="restore-file-input"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                  try {
                    const parsed = JSON.parse(event.target?.result as string);
                    let restoredCount = 0;
                    if (parsed.tasks && Array.isArray(parsed.tasks)) {
                      // Save to user storage
                      try {
                        const currentUserRaw = localStorage.getItem('taskmaster_current_user');
                        if (currentUserRaw) {
                          const userObj = JSON.parse(currentUserRaw);
                          localStorage.setItem(`taskmaster_tasks_${userObj.id}`, JSON.stringify(parsed.tasks));
                        }
                      } catch {}
                      localStorage.setItem('taskmaster_tasks', JSON.stringify(parsed.tasks));
                      restoredCount = parsed.tasks.length;
                    }
                    if (parsed.profile) {
                      localStorage.setItem('taskmaster_profile', JSON.stringify(parsed.profile));
                      setFormData(parsed.profile);
                      if (parsed.profile.connectedAppsList) {
                        setConnectedApps(parsed.profile.connectedAppsList);
                      }
                      onUpdateProfile(parsed.profile);
                    }
                    setStatusNotice({
                      type: 'success',
                      text: `Khôi phục dữ liệu sao lưu thành công! Đã tải ${restoredCount} nhiệm vụ và thông tin hồ sơ.`,
                    });
                    setTimeout(() => setStatusNotice(null), 6000);
                  } catch (err) {
                    setStatusNotice({
                      type: 'error',
                      text: 'File sao lưu JSON không đúng định dạng hoặc bị lỗi.',
                    });
                    setTimeout(() => setStatusNotice(null), 5000);
                  }
                };
                reader.readAsText(file);
              }}
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-7 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95 inline-flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Lưu Thay Đổi Hồ Sơ
          </button>
        </div>
      </form>

      {/* Modal: Thêm ứng dụng liên kết mới */}
      {isAddAppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Thêm Ứng Dụng Liên Kết Mới</h3>
                  <p className="text-xs text-slate-500">Tạo lối tắt kết nối thực sự tới ứng dụng làm việc</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddAppModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAppSubmit} className="space-y-4">
              {appFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{appFormError}</span>
                </div>
              )}

              {/* Preset Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Chọn mẫu ứng dụng phổ biến:
                </label>
                <select
                  value={presetChoice}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                >
                  <option value="custom">-- Tùy chỉnh (Nhập ứng dụng khác) --</option>
                  <option value="gcalendar">Google Calendar (Lịch công tác &amp; Nhắc hẹn)</option>
                  <option value="gdrive">Google Drive &amp; Docs (Lưu trữ tài liệu nghị quyết)</option>
                  <option value="zalo">Zalo Chat &amp; OA (Điều phối nhóm)</option>
                  <option value="telegram">Telegram Messenger (Thông báo bot tự động)</option>
                  <option value="notion">Notion Workspace (Cơ sở tri thức &amp; Ghi chép)</option>
                  <option value="trello">Trello Board (Bảng Kanban tiến độ)</option>
                  <option value="slack">Slack Workspace (Trao đổi chuyên trách)</option>
                  <option value="github">GitHub Repository (Quản lý dự án kỹ thuật)</option>
                </select>
              </div>

              {/* App Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Tên ứng dụng: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Ví dụ: Google Calendar Công Việc, Zalo Nhóm 1..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  required
                />
              </div>

              {/* App URL */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Địa chỉ liên kết URL (Mở thật sự khi click): <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={appUrl}
                    onChange={(e) => setAppUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    required
                  />
                  <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Đảm bảo địa chỉ có thể truy cập được từ trình duyệt.
                </span>
              </div>

              {/* App Category */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Phân loại ứng dụng:
                </label>
                <select
                  value={appCategory}
                  onChange={(e) => setAppCategory(e.target.value as ConnectedAppItem['category'])}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                >
                  <option value="calendar">Lịch làm việc &amp; Nhắc hẹn</option>
                  <option value="storage">Lưu trữ tệp &amp; Tài liệu</option>
                  <option value="communication">Giao tiếp &amp; Nhóm Chat</option>
                  <option value="project_management">Quản lý dự án &amp; Công việc</option>
                  <option value="document">Soạn thảo &amp; Tri thức</option>
                  <option value="other">Tiện ích khác</option>
                </select>
              </div>

              {/* App Description */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mô tả mục đích liên kết:
                </label>
                <input
                  type="text"
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  placeholder="Ví dụ: Đồng bộ lịch họp định kỳ thứ hai hàng tuần"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddAppModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs hover:shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  Lưu &amp; Thêm liên kết
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Xóa liên kết ứng dụng */}
      {appToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Xóa liên kết ứng dụng?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Bạn có chắc muốn gỡ bỏ liên kết với <strong>&quot;{appToDelete.name}&quot;</strong> khỏi hồ sơ? Thao tác này sẽ cập nhật ngay vào hệ thống.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setAppToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleDeleteAppConfirm(appToDelete.id)}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs hover:shadow-rose-600/30 transition-all cursor-pointer"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
