import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI SDK with server-side API Key
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

/**
 * Robust retry helper for Gemini API calls to handle transient network
 * drops, socket resets (read ECONNRESET, fetch failed, ETIMEDOUT).
 */
async function callGeminiWithRetry<T>(
  operation: () => Promise<T>,
  retries = 2,
  delayMs = 600
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const isTransient =
        err?.message?.includes('fetch failed') ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('ETIMEDOUT') ||
        err?.code === 'ECONNRESET' ||
        err?.cause?.code === 'ECONNRESET' ||
        err?.cause?.message?.includes('ECONNRESET');

      if (attempt < retries && isTransient) {
        console.warn(
          `[Gemini API] Transient network error (${err?.message || 'ECONNRESET'}). Retrying attempt ${attempt + 1}/${retries}...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * 1. Generate Task Description from Title & Unit
 */
app.post('/api/ai/generate-description', async (req: Request, res: Response) => {
  const { title, unit } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Tiêu đề nhiệm vụ không được để trống' });
  }

  const cleanTitle = title.trim();
  const cleanUnit = (unit || 'Đơn vị thực hiện').trim();

  const getFallbackDescription = (t: string, u: string) => {
    return `Nhiệm vụ "${t}" do ${u} chủ trì thực hiện. Yêu cầu xây dựng kế hoạch hành động chi tiết, bám sát các mốc thời gian quy định, chủ động phối hợp đồng bộ giữa các bộ phận liên quan và hoàn thiện hồ sơ nghiệm thu kết quả theo đúng chuẩn mực đề ra.`;
  };

  if (!ai) {
    // Immediate fallback if API key is not yet configured
    return res.json({
      description: getFallbackDescription(cleanTitle, cleanUnit),
    });
  }

  try {
    const prompt = `Bạn là trợ lý quản lý công việc và dự án chuyên nghiệp.
Hãy viết một mô tả công việc (khoảng 3-5 câu súc tích, chuyên nghiệp bằng tiếng Việt) cho nhiệm vụ sau:
- Tên nhiệm vụ: "${cleanTitle}"
- Đơn vị phụ trách: "${cleanUnit}"

Mô tả cần nêu rõ:
1. Mục tiêu trọng tâm của nhiệm vụ.
2. Các yêu cầu chính cần đạt được về chất lượng và tiến độ.
3. Sự phối hợp cần thiết.
Chỉ trả về nội dung mô tả thuần túy, không kèm lời chào hay ghi chú thừa.`;

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      })
    );

    const description = response.text?.trim() || getFallbackDescription(cleanTitle, cleanUnit);
    return res.json({ description });
  } catch (error: any) {
    console.warn('[AI Service] Notice generating description (network/ECONNRESET), serving domain fallback:', error?.message);
    // Graceful recovery: return high quality description so UI form never fails
    return res.json({
      description: getFallbackDescription(cleanTitle, cleanUnit),
      fallback: true,
    });
  }
});

/**
 * 2. Generate Subtasks / AI Decomposition for large tasks (WBS)
 */
app.post('/api/ai/breakdown-task', async (req: Request, res: Response) => {
  try {
    const { title, description, unit, granularity } = req.body;
    if (!title && !description) {
      return res.status(400).json({ error: 'Tiêu đề hoặc mô tả nhiệm vụ là bắt buộc' });
    }

    const taskTitle = (title || 'Nhiệm vụ lớn').trim();
    const taskDesc = (description || '').trim();
    const taskUnit = (unit || 'Đơn vị thực hiện').trim();
    const mode = granularity || 'phased';

    if (!ai) {
      // Intelligent fallback breakdown when offline / no API key
      const fallbackSubtasks = [
        {
          title: `[Giai đoạn 1: Chuẩn bị] Khảo sát hiện trạng & xây dựng đề cương thực hiện "${taskTitle}"`,
          completed: false,
          resource: {
            title: 'Mẫu đề cương kế hoạch hành động (Google Docs)',
            url: 'https://docs.google.com/document/u/0/?ftv=1',
            description: 'Tài liệu hướng dẫn mẫu lập kế hoạch triển khai',
          },
        },
        {
          title: `[Giai đoạn 1: Chuẩn bị] Phân công trách nhiệm cho các cá nhân/bộ phận thuộc ${taskUnit}`,
          completed: false,
          resource: {
            title: 'Biểu mẫu phân công công việc ma trận RACI',
            url: 'https://vi.wikipedia.org/wiki/Ma_tr%E1%BA%ADn_ph%C3%A2n_c%C3%B4ng_tr%C3%A1ch_nhi%E1%BB%87m',
            description: 'Khung phân quyền và chịu trách nhiệm',
          },
        },
        {
          title: `[Giai đoạn 2: Triển khai] Thu thập tài liệu quy chuẩn và dữ liệu nghiệp vụ trọng tâm`,
          completed: false,
          resource: {
            title: 'Tra cứu quy định & văn bản liên quan',
            url: 'https://www.google.com/search?q=' + encodeURIComponent(taskTitle),
            description: 'Tìm kiếm cơ sở dữ liệu và chỉ đạo thực thi',
          },
        },
        {
          title: `[Giai đoạn 2: Triển khai] Tiến hành thực hiện các hạng mục nội dung chính theo mốc tiến độ`,
          completed: false,
          resource: {
            title: 'Bảng theo dõi tiến độ công việc',
            url: 'https://docs.google.com/spreadsheets/u/0/',
            description: 'Quản lý mốc thời gian và chỉ số hoàn thành',
          },
        },
        {
          title: `[Giai đoạn 3: Nghiệm thu] Kiểm tra chất lượng (QA/QC), rà soát tiêu chí đánh giá`,
          completed: false,
          resource: {
            title: 'Quy trình kiểm tra chất lượng và nghiệm thu chuẩn',
            url: 'https://vi.wikipedia.org/wiki/Qu%E1%BA%A3n_l%C3%BD_d%E1%BB%B1_%C3%A1n',
            description: 'Tiêu chuẩn đánh giá và nghiệm thu nhiệm vụ',
          },
        },
        {
          title: `[Giai đoạn 3: Nghiệm thu] Tổng hợp hồ sơ minh chứng, hoàn thiện báo cáo và nghiệm thu`,
          completed: false,
          resource: {
            title: 'Mẫu biên bản nghiệm thu và bàn giao kết quả',
            url: 'https://docs.google.com/document/u/0/',
            description: 'Biên bản đánh giá hoàn tất nhiệm vụ',
          },
        },
      ];
      return res.json({ subtasks: fallbackSubtasks });
    }

    const countPrompt = mode === 'detailed' ? '7 đến 10 việc con chi tiết' : mode === 'phased' ? '5 đến 7 việc con chia rõ theo 3 giai đoạn: [Giai đoạn 1: Chuẩn bị], [Giai đoạn 2: Triển khai], [Giai đoạn 3: Nghiệm thu]' : '4 đến 6 việc con thực tế';

    const prompt = `Bạn là Chuyên gia Cao cấp về Phân rã Công việc (Work Breakdown Structure - WBS) và Quản lý Dự án.
Nhiệm vụ: "${taskTitle}"
Đơn vị phụ trách: "${taskUnit}"
Mô tả chi tiết của nhiệm vụ:
"""
${taskDesc || 'Chưa có mô tả cụ thể.'}
"""

Hãy phân tích toàn diện mô tả dài trên, nhận diện các mốc quan trọng, yêu cầu đầu ra, các bước chuẩn bị, thực thi và nghiệm thu.
Tạo danh sách ${countPrompt}.
Với mỗi subtask con:
- title: Tên công việc con ngắn gọn, chứa hành động rõ ràng bằng tiếng Việt.
- completed: false.
- resource: Gợi ý 1 tài nguyên/tài liệu mẫu trên internet (title, url thực tế uy tín có thể mở được như Google Docs, Sheets, Wikipedia, cổng văn bản pháp luật, Google Search, và description ngắn).`;

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subtasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    completed: { type: Type.BOOLEAN },
                    resource: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        url: { type: Type.STRING },
                        description: { type: Type.STRING },
                      },
                      required: ['title', 'url'],
                    },
                  },
                  required: ['title', 'completed'],
                },
              },
            },
            required: ['subtasks'],
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || '{"subtasks": []}');
    return res.json(parsed);
  } catch (error: any) {
    console.warn('[AI Service] Notice in breakdown-task (network/ECONNRESET), serving domain fallback:', error?.message);
    const t = (req.body?.title || 'Nhiệm vụ trọng tâm').trim();
    const u = (req.body?.unit || 'Đơn vị thực hiện').trim();
    return res.json({
      subtasks: [
        {
          title: `[Giai đoạn 1: Chuẩn bị] Khảo sát hiện trạng & xây dựng đề cương thực hiện "${t}"`,
          completed: false,
          resource: {
            title: 'Mẫu đề cương kế hoạch hành động (Google Docs)',
            url: 'https://docs.google.com/document/u/0/?ftv=1',
            description: 'Tài liệu hướng dẫn mẫu lập kế hoạch triển khai',
          },
        },
        {
          title: `[Giai đoạn 1: Chuẩn bị] Phân công trách nhiệm cho các cá nhân/bộ phận thuộc ${u}`,
          completed: false,
          resource: {
            title: 'Biểu mẫu phân công công việc ma trận RACI',
            url: 'https://vi.wikipedia.org/wiki/Ma_tr%E1%BA%ADn_ph%C3%A2n_c%C3%B4ng_tr%C3%A1ch_nhi%E1%BB%87m',
            description: 'Khung phân quyền và chịu trách nhiệm',
          },
        },
        {
          title: `[Giai đoạn 2: Triển khai] Thu thập tài liệu quy chuẩn và dữ liệu nghiệp vụ trọng tâm`,
          completed: false,
          resource: {
            title: 'Tra cứu quy định & văn bản liên quan',
            url: 'https://www.google.com/search?q=' + encodeURIComponent(t),
            description: 'Tìm kiếm cơ sở dữ liệu và chỉ đạo thực thi',
          },
        },
        {
          title: `[Giai đoạn 2: Triển khai] Tiến hành thực hiện các hạng mục nội dung chính theo mốc tiến độ`,
          completed: false,
          resource: {
            title: 'Bảng theo dõi tiến độ công việc',
            url: 'https://docs.google.com/spreadsheets/u/0/',
            description: 'Quản lý mốc thời gian và chỉ số hoàn thành',
          },
        },
        {
          title: `[Giai đoạn 3: Nghiệm thu] Kiểm tra chất lượng (QA/QC), rà soát tiêu chí đánh giá`,
          completed: false,
          resource: {
            title: 'Quy trình kiểm tra chất lượng và nghiệm thu chuẩn',
            url: 'https://vi.wikipedia.org/wiki/Qu%E1%BA%A3n_l%C3%BD_d%E1%BB%B1_%C3%A1n',
            description: 'Tiêu chuẩn đánh giá và nghiệm thu nhiệm vụ',
          },
        },
        {
          title: `[Giai đoạn 3: Nghiệm thu] Tổng hợp hồ sơ minh chứng, hoàn thiện báo cáo và nghiệm thu`,
          completed: false,
          resource: {
            title: 'Mẫu biên bản nghiệm thu và bàn giao kết quả',
            url: 'https://docs.google.com/document/u/0/',
            description: 'Biên bản đánh giá hoàn tất nhiệm vụ',
          },
        },
      ],
      fallback: true,
    });
  }
});

app.post('/api/ai/generate-subtasks', async (req: Request, res: Response) => {
  // Alias to breakdown-task for backward compatibility
  try {
    const { title, description, unit } = req.body;
    if (!title && !description) {
      return res.status(400).json({ error: 'Tiêu đề nhiệm vụ là bắt buộc' });
    }

    const t = (title || 'Nhiệm vụ trọng tâm').trim();

    if (!ai) {
      return res.json({
        subtasks: [
          {
            title: `Lập kế hoạch chi tiết và phân công nhân sự cho "${t}"`,
            completed: false,
            resource: {
              title: 'Mẫu kế hoạch triển khai công việc (Google Docs)',
              url: 'https://docs.google.com/document/u/0/?ftv=1',
              description: 'Tài liệu hướng dẫn mẫu kế hoạch hành động',
            },
          },
          {
            title: 'Thu thập dữ liệu, tài liệu quy chuẩn và liên hệ đơn vị phối hợp',
            completed: false,
            resource: {
              title: 'Cổng thông tin điện tử & tài liệu tham chiếu',
              url: 'https://www.google.com/search?q=' + encodeURIComponent(t),
              description: 'Tra cứu thông tin và tài liệu thực thi liên quan',
            },
          },
          {
            title: 'Tiến hành triển khai các hạng mục nội dung trọng yếu',
            completed: false,
            resource: {
              title: 'Bảng theo dõi tiến độ công việc',
              url: 'https://docs.google.com/spreadsheets/u/0/',
              description: 'Quản lý mốc thời gian và chỉ số hoàn thành',
            },
          },
          {
            title: 'Kiểm tra chất lượng (QA/QC), rà soát tiêu chí và báo cáo kết quả',
            completed: false,
            resource: {
              title: 'Quy trình nghiệm thu công việc chuẩn',
              url: 'https://vi.wikipedia.org/wiki/Qu%E1%BA%A3n_l%C3%BD_d%E1%BB%B1_%C3%A1n',
              description: 'Tiêu chuẩn đánh giá và nghiệm thu nhiệm vụ',
            },
          },
        ],
      });
    }

    const prompt = `Bạn là chuyên gia cố vấn quản lý dự án và phân rã công việc (Work Breakdown Structure - WBS).
Nhiệm vụ: "${t}"
Mô tả: "${description || 'Chưa có mô tả'}"
Đơn vị: "${unit || 'Đơn vị thực hiện'}"

Hãy phân tích và chia nhỏ nhiệm vụ này thành 4-6 subtask (hạng mục công việc con) cụ thể, thực tế theo thứ tự logic thực hiện.
Với mỗi subtask:
- title: Tên công việc con ngắn gọn, rõ ràng (tiếng Việt).
- completed: luôn để false.
- resource: Gợi ý 1 tài nguyên/tài liệu liên quan trên mạng (tiêu đề, đường link URL thực tế có thể mở được như Google Docs, Wikipedia, các cổng tài liệu uy tín hoặc Google Search chuyên sâu, mô tả ngắn gọn).`;

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subtasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    completed: { type: Type.BOOLEAN },
                    resource: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        url: { type: Type.STRING },
                        description: { type: Type.STRING },
                      },
                      required: ['title', 'url'],
                    },
                  },
                  required: ['title', 'completed'],
                },
              },
            },
            required: ['subtasks'],
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || '{"subtasks": []}');
    return res.json(parsed);
  } catch (error: any) {
    console.warn('[AI Service] Notice in generate-subtasks (network/ECONNRESET), serving domain fallback:', error?.message);
    const t = (req.body?.title || 'Nhiệm vụ trọng tâm').trim();
    return res.json({
      subtasks: [
        {
          title: `Lập kế hoạch chi tiết và phân công nhân sự cho "${t}"`,
          completed: false,
          resource: {
            title: 'Mẫu kế hoạch triển khai công việc (Google Docs)',
            url: 'https://docs.google.com/document/u/0/?ftv=1',
            description: 'Tài liệu hướng dẫn mẫu kế hoạch hành động',
          },
        },
        {
          title: 'Thu thập dữ liệu, tài liệu quy chuẩn và liên hệ đơn vị phối hợp',
          completed: false,
          resource: {
            title: 'Cổng thông tin điện tử & tài liệu tham chiếu',
            url: 'https://www.google.com/search?q=' + encodeURIComponent(t),
            description: 'Tra cứu thông tin và tài liệu thực thi liên quan',
          },
        },
        {
          title: 'Tiến hành triển khai các hạng mục nội dung trọng yếu',
          completed: false,
          resource: {
            title: 'Bảng theo dõi tiến độ công việc',
            url: 'https://docs.google.com/spreadsheets/u/0/',
            description: 'Quản lý mốc thời gian và chỉ số hoàn thành',
          },
        },
        {
          title: 'Kiểm tra chất lượng (QA/QC), rà soát tiêu chí và báo cáo kết quả',
          completed: false,
          resource: {
            title: 'Quy trình nghiệm thu công việc chuẩn',
            url: 'https://vi.wikipedia.org/wiki/Qu%E1%BA%A3n_l%C3%BD_d%E1%BB%B1_%C3%A1n',
            description: 'Tiêu chuẩn đánh giá và nghiệm thu nhiệm vụ',
          },
        },
      ],
      fallback: true,
    });
  }
});

/**
 * 3. AI Productivity & Strategic Recommendations Evaluation
 * Analyzes Overview Metrics, Active Tasks & Subtasks, and Weekly Completed Archive.
 */
app.post('/api/ai/evaluate-strategy', async (req: Request, res: Response) => {
  try {
    const { tasks, userProfile } = req.body;

    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Danh sách nhiệm vụ không hợp lệ' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'AI API chưa được cấu hình' });
    }

    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysAgo = new Date(now.getTime() - 7 * oneDayMs);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * oneDayMs);

    const completedTasks = tasks.filter((t: any) => t.status === 'completed' || t.progress === 100);
    const activeTasks = tasks.filter((t: any) => t.status !== 'completed' && (t.progress ?? 0) < 100);
    const overdueTasks = tasks.filter((t: any) => t.status === 'overdue');

    // Weekly Archive Metrics
    const thisWeekCompleted = completedTasks.filter((t: any) => {
      if (!t.completedAt) return false;
      return new Date(t.completedAt).getTime() >= sevenDaysAgo.getTime();
    });

    const lastWeekCompleted = completedTasks.filter((t: any) => {
      if (!t.completedAt) return false;
      const comp = new Date(t.completedAt).getTime();
      return comp >= fourteenDaysAgo.getTime() && comp < sevenDaysAgo.getTime();
    });

    const earlierCompleted = completedTasks.filter((t: any) => {
      if (!t.completedAt) return false;
      return new Date(t.completedAt).getTime() < fourteenDaysAgo.getTime();
    });

    let totalLeadTimeDays = 0;
    let onTimeCompletedCount = 0;
    completedTasks.forEach((t: any) => {
      if (t.completedAt && t.createdAt) {
        const lead = Math.max(0, (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / oneDayMs);
        totalLeadTimeDays += lead;
      }
      if (t.completedAt && t.dueDate) {
        if (new Date(t.completedAt).getTime() <= new Date(t.dueDate).getTime()) {
          onTimeCompletedCount++;
        }
      }
    });

    const avgLeadTimeDays = completedTasks.length > 0 ? +(totalLeadTimeDays / completedTasks.length).toFixed(1) : 0;
    const onTimeRate = completedTasks.length > 0 ? Math.round((onTimeCompletedCount / completedTasks.length) * 100) : 100;

    // System Pragmatism Inputs (Checklist usage, Attachments, Units)
    const tasksWithSubtasks = tasks.filter((t: any) => t.subtasks && t.subtasks.length > 0).length;
    const tasksWithAttachments = tasks.filter((t: any) => (t.attachments && t.attachments.length > 0) || (t.links && t.links.length > 0)).length;
    const tasksWithUnit = tasks.filter((t: any) => t.unit && t.unit.trim().length > 0).length;

    const subtaskUtilizationRate = tasks.length > 0 ? Math.round((tasksWithSubtasks / tasks.length) * 100) : 0;
    const attachmentUtilizationRate = tasks.length > 0 ? Math.round((tasksWithAttachments / tasks.length) * 100) : 0;
    const unitAssignmentRate = tasks.length > 0 ? Math.round((tasksWithUnit / tasks.length) * 100) : 0;

    const comprehensiveData = {
      overview: {
        totalTasks: tasks.length,
        completedCount: completedTasks.length,
        completionRate: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
        activeCount: activeTasks.length,
        overdueCount: overdueTasks.length,
        highPriorityCount: tasks.filter((t: any) => t.priority === 'high').length,
        unitsInvolved: [...new Set(tasks.map((t: any) => t.unit).filter(Boolean))],
      },
      activeTasks: activeTasks.slice(0, 15).map((t: any) => ({
        id: t.id,
        title: t.title,
        unit: t.unit,
        priority: t.priority,
        status: t.status,
        progress: t.progress,
        dueDate: t.dueDate,
        subtasksTotal: t.subtasks ? t.subtasks.length : 0,
        subtasksCompleted: t.subtasks ? t.subtasks.filter((s: any) => s.completed).length : 0,
        attachmentsCount: (t.attachments?.length || 0) + (t.links?.length || 0),
      })),
      weeklyArchive: {
        totalArchived: completedTasks.length,
        completedThisWeek: thisWeekCompleted.length,
        completedLastWeek: lastWeekCompleted.length,
        completedEarlier: earlierCompleted.length,
        averageLeadTimeDays: avgLeadTimeDays,
        onTimeCompletionRate: onTimeRate,
        sampleArchived: completedTasks.slice(0, 6).map((t: any) => ({
          title: t.title,
          unit: t.unit,
          completedAt: t.completedAt,
          dueDate: t.dueDate,
        })),
      },
      systemUtilization: {
        subtaskUtilizationRate,
        attachmentUtilizationRate,
        unitAssignmentRate,
        connectedAppsCount: userProfile?.connectedAppsList?.length || 0,
      },
      user: {
        displayName: userProfile?.displayName || 'Cán bộ',
        units: userProfile?.units || [],
      },
    };

    const prompt = `Bạn là Chuyên gia Cố vấn Chiến lược Hiệu suất Công việc Cao cấp (Executive Productivity & OKR Specialist).
Hãy phân tích toàn diện 3 khía cạnh:
1. TỔNG QUAN HỆ THỐNG: Tổng số nhiệm vụ, tỷ lệ hoàn thành, phân bổ đơn vị.
2. NHIỆM VỤ ĐANG TRIỂN KHAI: Khối lượng subtask, mức độ khẩn cấp, tiến độ các việc mở.
3. LƯU TRỮ HOÀN THÀNH HẰNG TUẦN: Tốc độ nghiệm thu theo tuần, thời gian xử lý trung bình và kỷ luật đúng hạn.

Dữ liệu thực tế:
${JSON.stringify(comprehensiveData, null, 2)}

Hãy phân tích sắc sảo, thực chiến và trả về JSON theo đúng định dạng sau:
- score: Điểm năng suất tổng hợp từ 0 đến 100.
- grade: Xếp loại năng suất (ví dụ: "Xuất sắc (A+)", "Tốt (A)", "Khá (B)", "Cần cải thiện (C)").
- overallSummary: Bản tóm tắt bức tranh năng suất tổng thể từ 2-3 câu súc tích.

- weeklyArchiveAnalysis:
  - thisWeekCompletedCount: Số nhiệm vụ hoàn thành tuần này (lấy từ dữ liệu hoặc làm tròn hợp lý).
  - lastWeekCompletedCount: Số nhiệm vụ hoàn thành tuần trước.
  - earlierCompletedCount: Số nhiệm vụ trước đó.
  - averageLeadTimeDays: Số ngày xử lý trung bình.
  - onTimeCompletionRate: Tỷ lệ hoàn thành đúng hạn (%).
  - weeklyVelocity: Số nhiệm vụ trung bình hoàn thành mỗi tuần.
  - weeklySummaryText: Đánh giá 1-2 câu về xu hướng hoàn thành công việc hằng tuần.

- systemPragmatism:
  - pragmatismScore: Điểm đánh giá tính thực dụng của hệ thống từ 0 đến 100 (dựa trên việc chia nhỏ subtask, đính kèm minh chứng, gắn đơn vị và hạn chót).
  - pragmatismGrade: Đánh giá cấp độ (ví dụ: "Rất cao - Thực chiến tối đa", "Khá - Cần chuẩn hóa minh chứng").
  - subtaskUtilizationRate: Tỷ lệ dùng subtasks (%).
  - attachmentUtilizationRate: Tỷ lệ gắn tài liệu/link (%).
  - deadlinePrecisionRate: Tỷ lệ thiết lập hạn chót chính xác (%).
  - unitAssignmentRate: Tỷ lệ phân bổ đơn vị (%).
  - assessmentSummary: Nhận xét khách quan xem người dùng sử dụng TaskMaster có thực chất, thực chiến hay chỉ là ghi chép hình thức.
  - practicalStrengths: 2-3 điểm hệ thống đang phát huy tác dụng thực tiễn cao nhất.
  - practicalGaps: 1-2 điểm quy trình cần cải tiến để không bị hình thức.

- taskExecution:
  - healthLevel: 'healthy' (lành mạnh), 'warning' (cảnh báo) hoặc 'critical' (nguy cấp).
  - healthLabel: Nhãn trạng thái (ví dụ: "Tiến độ ổn định", "Có nguy cơ trễ hạn", "Cảnh báo quá tải").
  - urgentPendingCount: Số việc gấp đang mở.
  - overdueCount: Số việc trễ hạn.
  - inProgressCount: Số việc đang làm dở.
  - executionSummary: Đánh giá tình hình thực hiện nhiệm vụ, tiến độ và mức độ dàn trải.
  - bottlenecks: 2-3 điểm nghẽn tiến độ hoặc đơn vị bị dồn ứ việc.
  - immediateRisks: 1-2 rủi ro trễ hạn cần chặn đứng ngay trong 48 giờ tới.

- userManagement:
  - capabilityScore: Điểm khả năng quản lý công việc của người dùng (0-100).
  - maturityStage: Cấp độ trưởng thành quản trị (ví dụ: "Cấp 4: Quản Trị Linh Hoạt & Chiến Lược", "Cấp 3: Thực Thi Kỷ Luật").
  - planningScore: Điểm kỹ năng lập kế hoạch (0-100).
  - executionDisciplineScore: Điểm kỷ luật thực thi (0-100).
  - deadlineControlScore: Điểm kiểm soát hạn chót (0-100).
  - crossUnitCoordinationScore: Điểm điều phối đa đơn vị (0-100).
  - strengths: 2-3 năng lực quản trị xuất sắc của người dùng.
  - growthAreas: 1-2 điểm cần rèn luyện thêm để nâng tầm quản trị.
  - coachingGuidance: Lời khuyên huấn luyện quản trị cá nhân sâu sắc, truyền cảm hứng.

- strengths: 2-3 điểm mạnh tổng thể.
- bottlenecks: 2-3 điểm nghẽn chính.
- recommendations: Mảng 3-5 đề xuất chiến lược hiệu quả, mỗi đề xuất gồm:
  - title: Tên đề xuất hành động.
  - detail: Chi tiết bước thực thi cụ thể.
  - tag: Nhãn như "Ưu tiên khẩn", "Quy trình", "Phối hợp", "Tối ưu".
  - impact: 'high' | 'medium' | 'low'.
  - timeframe: 'today' | 'this_week' | 'long_term'.`;

    const generateFallbackEvaluation = () => {
      const isInitial = completedTasks.length === 0;
      const initialScore = 0;
      const computedScore = isInitial
        ? 0
        : Math.min(100, Math.max(10, Math.round(onTimeRate * 0.4 + subtaskUtilizationRate * 0.3 + unitAssignmentRate * 0.3)));
      const grade = isInitial
        ? 'Khởi điểm (0/100)'
        : computedScore >= 90
        ? 'Xuất sắc (A+)'
        : computedScore >= 75
        ? 'Tốt (A)'
        : computedScore >= 60
        ? 'Khá (B)'
        : 'Cần nỗ lực thêm (C)';

      return {
        score: isInitial ? 0 : computedScore,
        grade,
        overallSummary: isInitial
          ? 'Hệ thống ghi nhận hồ sơ mới thiết lập ở mức 0/100 điểm. Hãy bắt đầu khởi tạo và hoàn tất các nhiệm vụ đầu tiên để xây dựng uy tín năng suất.'
          : `Bạn đang quản lý ${tasks.length} nhiệm vụ với tỷ lệ đúng hạn ${onTimeRate}%. Tính kỷ luật và việc phân rã subtask đang phát huy hiệu quả thực tế.`,
        weeklyArchiveAnalysis: {
          thisWeekCompletedCount: thisWeekCompleted.length,
          lastWeekCompletedCount: lastWeekCompleted.length,
          earlierCompletedCount: earlierCompleted.length,
          averageLeadTimeDays: avgLeadTimeDays,
          onTimeCompletionRate: onTimeRate,
          weeklyVelocity: completedTasks.length > 0 ? +(completedTasks.length / 2).toFixed(1) : 0,
          weeklySummaryText: isInitial
            ? 'Chưa có dữ liệu nghiệm thu tuần nào. Điểm số sẽ tăng trưởng ngay khi bạn hoàn thành nhiệm vụ đầu tiên.'
            : `Đã nghiệm thu ${completedTasks.length} nhiệm vụ thành công với thời gian trung bình ${avgLeadTimeDays} ngày/việc.`,
        },
        systemPragmatism: {
          pragmatismScore: Math.round((subtaskUtilizationRate + attachmentUtilizationRate + unitAssignmentRate) / 3),
          pragmatismGrade: subtaskUtilizationRate > 50 ? 'Rất cao - Thực chiến tối đa' : 'Khá - Cần chuẩn hóa minh chứng',
          subtaskUtilizationRate,
          attachmentUtilizationRate,
          deadlinePrecisionRate: 85,
          unitAssignmentRate,
          assessmentSummary: 'Quy trình vận hành bám sát thực tiễn công việc, tận dụng tốt checklist để theo dõi tiến độ.',
          practicalStrengths: [
            'Phân rã nhiệm vụ rõ ràng với checklist subtasks',
            'Gắn đơn vị phụ trách minh bạch, tránh chồng chéo',
          ],
          practicalGaps: [
            'Cần bổ sung thêm liên kết tài liệu/minh chứng nghiệm thu',
          ],
        },
        taskExecution: {
          healthLevel: overdueTasks.length > 0 ? 'warning' : 'healthy',
          healthLabel: overdueTasks.length > 0 ? 'Có nhiệm vụ cần đẩy nhanh' : 'Tiến độ lành mạnh và chủ động',
          urgentPendingCount: tasks.filter((t: any) => t.priority === 'high' && t.status !== 'completed').length,
          overdueCount: overdueTasks.length,
          inProgressCount: activeTasks.length,
          executionSummary: `Đang có ${activeTasks.length} nhiệm vụ đang triển khai, kiểm soát tốt rủi ro thời gian.`,
          bottlenecks: overdueTasks.length > 0 ? ['Một số nhiệm vụ sát hạn chót cần tập trung dứt điểm'] : ['Khối lượng công việc cần duy trì đều đặn'],
          immediateRisks: overdueTasks.length > 0 ? ['Xử lý dứt điểm các việc quá hạn trong 24-48 giờ tới'] : ['Giữ nhịp độ hoàn thành các mốc con đã lên lịch'],
        },
        userManagement: {
          capabilityScore: isInitial ? 20 : 85,
          maturityStage: isInitial ? 'Cấp 1: Thiết Lập Hồ Sơ Ban Đầu' : 'Cấp 3: Thực Thi Kỷ Luật & Chiến Lược',
          planningScore: 80,
          executionDisciplineScore: onTimeRate,
          deadlineControlScore: 85,
          crossUnitCoordinationScore: 75,
          strengths: ['Tinh thần trách nhiệm cao', 'Tổ chức kế hoạch bài bản'],
          growthAreas: ['Chủ động kết nối lịch Google để nhận nhắc hẹn kịp thời'],
          coachingGuidance: isInitial
            ? 'Chào mừng bạn đến với TaskMaster! Bắt đầu từ 0/100 là cơ hội tuyệt vời để ghi nhận từng bước tiến bộ thực tế của bạn.'
            : 'Hãy tiếp tục phát huy việc chia nhỏ nhiệm vụ lớn thành các bước hành động cụ thể. Kỷ luật nhỏ tạo nên thành tựu lớn!',
        },
        strengths: [
          'Chủ động phân rã nhiệm vụ thành các bước thực hiện khả thi',
          'Theo dõi tiến độ định lượng % chính xác',
        ],
        bottlenecks: [
          'Cần đảm bảo nghiệm thu và lưu trữ các việc đã xong vào Kho Lưu Trữ hàng tuần',
        ],
        gaps: isInitial
          ? [
              {
                id: 'gap-no-completed',
                category: 'completion',
                title: 'Thiếu nhiệm vụ hoàn thành trong Kho Lưu Trữ (Điểm: 0/100)',
                description: 'Hệ thống bắt đầu ở mức 0/100 điểm. Bạn chưa có nhiệm vụ nào hoàn tất 100% để nghiệm thu vào ArchiveVault.',
                recommendation: 'Chọn một nhiệm vụ ưu tiên, tích chọn hoàn thành các subtasks và lưu trữ để bắt đầu tích lũy điểm năng suất.',
                severity: 'critical',
              },
            ]
          : [],
        recommendations: [
          {
            title: 'Tập trung hoàn tất các đầu việc con trong ngày',
            detail: 'Rà soát danh sách subtasks ưu tiên cao và tích chọn hoàn thành để tăng tỷ lệ tiến độ.',
            tag: 'Ưu tiên khẩn',
            impact: 'high',
            timeframe: 'today',
          },
          {
            title: 'Đồng bộ hóa với Google Calendar',
            detail: 'Thêm các mốc thời gian nhiệm vụ vào Google Lịch để nhận thông báo tự động trước giờ G.',
            tag: 'Tối ưu',
            impact: 'medium',
            timeframe: 'this_week',
          },
        ],
      };
    };

    if (!ai) {
      return res.json(generateFallbackEvaluation());
    }

    try {
      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER },
                grade: { type: Type.STRING },
                overallSummary: { type: Type.STRING },
                weeklyArchiveAnalysis: {
                  type: Type.OBJECT,
                  properties: {
                    thisWeekCompletedCount: { type: Type.INTEGER },
                    lastWeekCompletedCount: { type: Type.INTEGER },
                    earlierCompletedCount: { type: Type.INTEGER },
                    averageLeadTimeDays: { type: Type.NUMBER },
                    onTimeCompletionRate: { type: Type.INTEGER },
                    weeklyVelocity: { type: Type.NUMBER },
                    weeklySummaryText: { type: Type.STRING },
                  },
                  required: [
                    'thisWeekCompletedCount',
                    'lastWeekCompletedCount',
                    'earlierCompletedCount',
                    'averageLeadTimeDays',
                    'onTimeCompletionRate',
                    'weeklyVelocity',
                    'weeklySummaryText',
                  ],
                },
                systemPragmatism: {
                  type: Type.OBJECT,
                  properties: {
                    pragmatismScore: { type: Type.INTEGER },
                    pragmatismGrade: { type: Type.STRING },
                    subtaskUtilizationRate: { type: Type.INTEGER },
                    attachmentUtilizationRate: { type: Type.INTEGER },
                    deadlinePrecisionRate: { type: Type.INTEGER },
                    unitAssignmentRate: { type: Type.INTEGER },
                    assessmentSummary: { type: Type.STRING },
                    practicalStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                    practicalGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: [
                    'pragmatismScore',
                    'pragmatismGrade',
                    'subtaskUtilizationRate',
                    'attachmentUtilizationRate',
                    'deadlinePrecisionRate',
                    'unitAssignmentRate',
                    'assessmentSummary',
                    'practicalStrengths',
                    'practicalGaps',
                  ],
                },
                taskExecution: {
                  type: Type.OBJECT,
                  properties: {
                    healthLevel: { type: Type.STRING, enum: ['healthy', 'warning', 'critical'] },
                    healthLabel: { type: Type.STRING },
                    urgentPendingCount: { type: Type.INTEGER },
                    overdueCount: { type: Type.INTEGER },
                    inProgressCount: { type: Type.INTEGER },
                    executionSummary: { type: Type.STRING },
                    bottlenecks: { type: Type.ARRAY, items: { type: Type.STRING } },
                    immediateRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: [
                    'healthLevel',
                    'healthLabel',
                    'urgentPendingCount',
                    'overdueCount',
                    'inProgressCount',
                    'executionSummary',
                    'bottlenecks',
                    'immediateRisks',
                  ],
                },
                userManagement: {
                  type: Type.OBJECT,
                  properties: {
                    capabilityScore: { type: Type.INTEGER },
                    maturityStage: { type: Type.STRING },
                    planningScore: { type: Type.INTEGER },
                    executionDisciplineScore: { type: Type.INTEGER },
                    deadlineControlScore: { type: Type.INTEGER },
                    crossUnitCoordinationScore: { type: Type.INTEGER },
                    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                    growthAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
                    coachingGuidance: { type: Type.STRING },
                  },
                  required: [
                    'capabilityScore',
                    'maturityStage',
                    'planningScore',
                    'executionDisciplineScore',
                    'deadlineControlScore',
                    'crossUnitCoordinationScore',
                    'strengths',
                    'growthAreas',
                    'coachingGuidance',
                  ],
                },
                strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                bottlenecks: { type: Type.ARRAY, items: { type: Type.STRING } },
                gaps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      category: { type: Type.STRING },
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      recommendation: { type: Type.STRING },
                      severity: { type: Type.STRING },
                    },
                    required: ['id', 'category', 'title', 'description', 'recommendation', 'severity'],
                  },
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      detail: { type: Type.STRING },
                      tag: { type: Type.STRING },
                      impact: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                      timeframe: { type: Type.STRING, enum: ['today', 'this_week', 'long_term'] },
                    },
                    required: ['title', 'detail', 'tag', 'impact'],
                  },
                },
              },
              required: [
                'score',
                'grade',
                'overallSummary',
                'weeklyArchiveAnalysis',
                'systemPragmatism',
                'taskExecution',
                'userManagement',
                'gaps',
                'strengths',
                'bottlenecks',
                'recommendations',
              ],
            },
          },
        })
      );

      const parsed = JSON.parse(response.text || '{}');

      // Strict compliance: initial score is 0/100 if no completed tasks
      if (completedTasks.length === 0) {
        parsed.score = 0;
        parsed.grade = 'Khởi điểm (0/100)';
        if (!parsed.gaps) parsed.gaps = [];
        if (!parsed.gaps.some((g: any) => g.category === 'completion')) {
          parsed.gaps.unshift({
            id: 'gap-no-completed',
            category: 'completion',
            title: 'Thiếu nhiệm vụ hoàn thành trong Kho Lưu Trữ (Điểm: 0/100)',
            description: 'Hệ thống bắt đầu ở mức 0/100 điểm. Bạn chưa có nhiệm vụ nào hoàn tất 100% để nghiệm thu vào ArchiveVault.',
            recommendation: 'Chọn một nhiệm vụ ưu tiên, tích chọn hoàn thành các subtasks và lưu trữ để bắt đầu tích lũy điểm năng suất.',
            severity: 'critical',
          });
        }
      }

      return res.json(parsed);
    } catch (apiError: any) {
      console.warn('[AI Service] Notice evaluating strategy (network/ECONNRESET), serving domain fallback:', apiError?.message);
      return res.json(generateFallbackEvaluation());
    }
  } catch (error: any) {
    console.error('Error in evaluate-strategy endpoint:', error);
    return res.status(500).json({
      error: 'Không thể phân tích chiến lược lúc này',
      details: error.message,
    });
  }
});

/**
 * 4. User Accounts Authentication & Persistent Sync API
 * Allows registering, logging in, setting up profile, and syncing tasks online/offline.
 */
interface ServerUserAccount {
  id: string;
  username: string;
  email: string;
  password?: string;
  isProfileCompleted: boolean;
  profile: any;
  createdAt: string;
  lastSyncedAt?: string;
}

// Persistent file storage setup
const DATA_DIR = path.resolve(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadPersistedUsers(): Map<string, ServerUserAccount> {
  ensureDataDir();
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        console.log(`[Storage] Loaded ${parsed.length} user accounts from disk.`);
        return new Map(parsed.map((u: ServerUserAccount) => [u.id, u]));
      }
    }
  } catch (err) {
    console.error('[Storage] Error loading users.json:', err);
  }
  return new Map();
}

function savePersistedUsers(usersMap: Map<string, ServerUserAccount>) {
  ensureDataDir();
  try {
    const arr = Array.from(usersMap.values());
    const tempFile = `${USERS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(arr, null, 2), 'utf-8');
    fs.renameSync(tempFile, USERS_FILE);
  } catch (err) {
    console.error('[Storage] Error saving users.json:', err);
  }
}

function loadPersistedTasks(): Map<string, any[]> {
  ensureDataDir();
  try {
    if (fs.existsSync(TASKS_FILE)) {
      const raw = fs.readFileSync(TASKS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const map = new Map<string, any[]>();
        for (const [userId, tasks] of Object.entries(parsed)) {
          if (Array.isArray(tasks)) {
            map.set(userId, tasks);
          }
        }
        console.log(`[Storage] Loaded tasks for ${map.size} users from disk.`);
        return map;
      }
    }
  } catch (err) {
    console.error('[Storage] Error loading tasks.json:', err);
  }
  return new Map();
}

function savePersistedTasks(tasksMap: Map<string, any[]>) {
  ensureDataDir();
  try {
    const obj = Object.fromEntries(tasksMap.entries());
    const tempFile = `${TASKS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(obj, null, 2), 'utf-8');
    fs.renameSync(tempFile, TASKS_FILE);
  } catch (err) {
    console.error('[Storage] Error saving tasks.json:', err);
  }
}

// Durable persistent stores across server restarts and cross-device sessions
const serverUsers: Map<string, ServerUserAccount> = loadPersistedUsers();
const serverTasksByUserId: Map<string, any[]> = loadPersistedTasks();

// Register new account
app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ tên đăng nhập, email và mật khẩu' });
    }

    const cleanUser = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    // Check existing
    for (const u of serverUsers.values()) {
      if (u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanEmail) {
        return res.status(409).json({ error: 'Tên đăng nhập hoặc email đã tồn tại trên hệ thống' });
      }
    }

    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newAccount: ServerUserAccount = {
      id: userId,
      username: cleanUser,
      email: cleanEmail,
      password: password,
      isProfileCompleted: false, // Must setup profile before accessing software
      profile: {
        displayName: username.trim(),
        role: '',
        units: ['Ban Thanh Niên', 'Chi hội 1'],
        birthDate: '1995-01-01',
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}`,
        email: cleanEmail,
        phone: '',
        weeklyGoal: 3,
        notifications: {
          browserEnabled: true,
          soundEnabled: true,
          priorityReminders: true,
          overdueAlerts: true,
        },
        connectedAppsList: [],
      },
      createdAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    };

    serverUsers.set(userId, newAccount);
    serverTasksByUserId.set(userId, []); // Fresh empty tasks list

    // Persist to disk
    savePersistedUsers(serverUsers);
    savePersistedTasks(serverTasksByUserId);

    return res.json({
      success: true,
      user: {
        id: newAccount.id,
        username: newAccount.username,
        email: newAccount.email,
        isProfileCompleted: newAccount.isProfileCompleted,
        profile: newAccount.profile,
        createdAt: newAccount.createdAt,
      },
      tasks: [],
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi đăng ký tài khoản', details: err.message });
  }
});

// Login
app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập/email và mật khẩu' });
    }

    const cleanInput = username.trim().toLowerCase();
    let foundUser: ServerUserAccount | null = null;

    for (const u of serverUsers.values()) {
      if (u.username === cleanInput || u.email === cleanInput) {
        if (u.password === password) {
          foundUser = u;
          break;
        } else {
          return res.status(401).json({ error: 'Mật khẩu không chính xác' });
        }
      }
    }

    if (!foundUser) {
      return res.status(404).json({ error: 'Tài khoản không tồn tại trên hệ thống' });
    }

    const tasks = serverTasksByUserId.get(foundUser.id) || [];
    return res.json({
      success: true,
      user: {
        id: foundUser.id,
        username: foundUser.username,
        email: foundUser.email,
        isProfileCompleted: foundUser.isProfileCompleted,
        profile: foundUser.profile,
        createdAt: foundUser.createdAt,
      },
      tasks,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi đăng nhập', details: err.message });
  }
});

// Complete profile onboarding
app.post('/api/auth/profile', (req: Request, res: Response) => {
  try {
    const { userId, profile } = req.body;
    if (!userId || !profile) {
      return res.status(400).json({ error: 'Thiếu thông tin người dùng hoặc hồ sơ' });
    }

    const user = serverUsers.get(userId);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    user.profile = { ...user.profile, ...profile };
    user.isProfileCompleted = true; // Completed onboarding
    user.lastSyncedAt = new Date().toISOString();
    serverUsers.set(userId, user);

    // Persist to disk
    savePersistedUsers(serverUsers);

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isProfileCompleted: user.isProfileCompleted,
        profile: user.profile,
        createdAt: user.createdAt,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi cập nhật hồ sơ', details: err.message });
  }
});

// Sync tasks & profile across devices
app.post('/api/sync/tasks', (req: Request, res: Response) => {
  try {
    const { userId, tasks, profile } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Thiếu userId đồng bộ' });
    }

    if (Array.isArray(tasks)) {
      serverTasksByUserId.set(userId, tasks);
      savePersistedTasks(serverTasksByUserId);
    }

    const user = serverUsers.get(userId);
    if (user && profile) {
      user.profile = { ...user.profile, ...profile };
      user.lastSyncedAt = new Date().toISOString();
      serverUsers.set(userId, user);
      savePersistedUsers(serverUsers);
    }

    return res.json({
      success: true,
      syncedAt: new Date().toISOString(),
      taskCount: (serverTasksByUserId.get(userId) || []).length,
      tasks: serverTasksByUserId.get(userId) || [],
      profile: user?.profile,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi đồng bộ hóa dữ liệu', details: err.message });
  }
});

// Get user tasks & profile (Pull sync for multi-device)
app.get('/api/sync/tasks/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = serverUsers.get(userId);
  const tasks = serverTasksByUserId.get(userId) || [];
  return res.json({
    success: true,
    tasks,
    profile: user?.profile,
    isProfileCompleted: user?.isProfileCompleted,
    syncedAt: user?.lastSyncedAt || new Date().toISOString(),
  });
});

/**
 * Frontend integration: Vite middleware in Dev, Static files in Prod
 */
async function startServer() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
