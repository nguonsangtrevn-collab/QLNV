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
  delayMs = 600,
  timeoutMs = 10000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ETIMEDOUT: Gemini API timeout')), timeoutMs)
      );
      return await Promise.race([operation(), timeoutPromise]);
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
/**
 * Helper: Smart Domain & Keyword Analyzer for Fallback WBS
 * Decomposes titles by understanding domain, entities, and action verbs.
 */
function generateSmartDomainSubtasks(
  taskTitle: string,
  taskUnit: string,
  mode: 'phased' | 'standard' | 'detailed' | 'deliverables' = 'phased'
): { analysis: string; subtasks: any[] } {
  const cleanTitle = taskTitle.trim();
  const lower = cleanTitle.toLowerCase();

  // Detect domain
  let domain = 'general';
  if (/website|web|app|phần mềm|api|hệ thống|database|máy chủ|server|cloud|frontend|backend|ui|ux|it|số hóa|mã nguồn|cntt|code|bug/.test(lower)) {
    domain = 'tech';
  } else if (/đoàn|đại hội|nghị quyết|chi bộ|chi đoàn|thanh niên|cán bộ|hội nghị|tuyên truyền|chính trị|học tập|chỉ thị/.test(lower)) {
    domain = 'youth';
  } else if (/sự kiện|hội thảo|workshop|tổ chức|khai mạc|lễ|giao lưu|giải|chương trình|hội thi|diễn đàn/.test(lower)) {
    domain = 'event';
  } else if (/kinh doanh|bán hàng|marketing|thị trường|doanh số|sản phẩm|ocop|quảng cáo|khách hàng|thương mại/.test(lower)) {
    domain = 'commerce';
  } else if (/đào tạo|tập huấn|khóa học|giáo trình|bài giảng|chuyên đề|học phần|hướng dẫn/.test(lower)) {
    domain = 'education';
  } else if (/báo cáo|thống kê|tài chính|ngân sách|thu chi|kế toán|kiểm toán|quyết toán|chi phí/.test(lower)) {
    domain = 'finance';
  }

  const subject = cleanTitle.length > 55 ? `${cleanTitle.slice(0, 52)}...` : cleanTitle;

  let analysis = `Nhiệm vụ "${subject}" được phân tích chuyên sâu nhằm bám sát mục tiêu của ${taskUnit}. Kế hoạch được phân rã chặt chẽ qua các mốc hành động cụ thể, gắn liền với đối tượng và sản phẩm thực tế cần đạt.`;

  let subtaskDefs: Array<{ phase: string; title: string; docTitle: string; query: string; desc: string }> = [];

  if (domain === 'tech') {
    analysis = `Nhiệm vụ công nghệ "${subject}": Đòi hỏi bóc tách rõ kiến trúc hệ thống, môi trường kỹ thuật, kiểm thử luồng tích hợp và tài liệu bàn giao kỹ thuật cho ${taskUnit}.`;
    subtaskDefs = [
      {
        phase: 'Chuẩn bị & Khảo sát',
        title: `[Chuẩn bị] Khảo sát yêu cầu nghiệp vụ, thông số kỹ thuật và kiến trúc cho "${subject}"`,
        docTitle: 'Đặc tả yêu cầu phần mềm & kiến trúc (SRS)',
        query: `software requirements specification ${subject}`,
        desc: 'Tài liệu chuẩn hóa đặc tả kỹ thuật và kiến trúc hệ thống',
      },
      {
        phase: 'Chuẩn bị & Thiết kế',
        title: `[Chuẩn bị] Thiết kế cơ sở dữ liệu, sơ đồ luồng dữ liệu (Data Flow) và giao diện người dùng mẫu`,
        docTitle: 'Tài liệu thiết kế Database & UI Wireframe',
        query: `database schema design wireframe ${subject}`,
        desc: 'Mẫu thiết kế lược đồ quan hệ và giao diện trực quan',
      },
      {
        phase: 'Triển khai & Kỹ thuật',
        title: `[Triển khai] Thiết lập môi trường phát triển (Dev/Staging) và tích hợp các module/thư viện nền tảng`,
        docTitle: 'Quy chuẩn cấu hình môi trường phát triển & bảo mật',
        query: `setup environment security guidelines ${subject}`,
        desc: 'Checklist an toàn thông tin và môi trường vận hành',
      },
      {
        phase: 'Triển khai & Lập trình',
        title: `[Triển khai] Lập trình các tính năng cốt lõi và kết nối API/Dịch vụ cho "${subject}"`,
        docTitle: 'Tài liệu hướng dẫn tích hợp API & mã nguồn',
        query: `API integration best practices ${subject}`,
        desc: 'Tài liệu tra cứu chuẩn kết nối API và xử lý dữ liệu',
      },
      {
        phase: 'Kiểm thử & Tối ưu',
        title: `[Kiểm thử] Xây dựng kịch bản kiểm thử (Test Cases), kiểm tra lỗi logic và hiệu năng`,
        docTitle: 'Biểu mẫu kịch bản kiểm thử QA/QC phần mềm',
        query: `QA test cases checklist ${subject}`,
        desc: 'Mẫu kiểm thử chức năng, tích hợp và kiểm soát lỗi',
      },
      {
        phase: 'Kiểm thử & Tối ưu',
        title: `[Kiểm thử] Khắc phục lỗi phát sinh (Bug fix), tối ưu hóa tốc độ tải và tính ổn định`,
        docTitle: 'Bảng theo dõi và quản lý lỗi (Bug Tracker)',
        query: `bug tracking performance optimization ${subject}`,
        desc: 'Mẫu biểu kiểm soát lỗi và tiêu chí chấp nhận chất lượng',
      },
      {
        phase: 'Nghiệm thu & Bàn giao',
        title: `[Nghiệm thu] Biên soạn tài liệu hướng dẫn sử dụng và hướng dẫn vận hành hệ thống`,
        docTitle: 'Tài liệu hướng dẫn vận hành hệ thống (User Manual)',
        query: `user manual deployment documentation ${subject}`,
        desc: 'Mẫu tài liệu hướng dẫn sử dụng và chuyển giao công nghệ',
      },
      {
        phase: 'Nghiệm thu & Bàn giao',
        title: `[Nghiệm thu] Tổ chức nghiệm thu kỹ thuật, bàn giao sản phẩm hoàn thiện cho ${taskUnit}`,
        docTitle: 'Biên bản nghiệm thu và bàn giao sản phẩm công nghệ',
        query: `biên bản nghiệm thu phần mềm công nghệ thông tin`,
        desc: 'Mẫu biên bản đánh giá đạt tiêu chuẩn và ký kết nghiệm thu',
      },
    ];
  } else if (domain === 'youth') {
    analysis = `Nhiệm vụ công tác đoàn thể "${subject}": Cần đảm bảo tính chính trị, sự hưởng ứng của đoàn viên thanh niên ${taskUnit}, phối hợp đồng bộ và lưu trữ hồ sơ minh chứng đầy đủ.`;
    subtaskDefs = [
      {
        phase: 'Chuẩn bị & Kế hoạch',
        title: `[Chuẩn bị] Xây dựng kế hoạch tổ chức chi tiết và dự trù kinh phí cho "${subject}"`,
        docTitle: 'Mẫu kế hoạch hoạt động phong trào Đoàn Thanh niên',
        query: `kế hoạch tổ chức ${subject} đoàn thanh niên`,
        desc: 'Mẫu kế hoạch phân kỳ mục tiêu và cơ chế phối hợp',
      },
      {
        phase: 'Chuẩn bị & Tuyên truyền',
        title: `[Chuẩn bị] Ban hành thông báo, công văn hướng dẫn và phát động tới các chi đoàn/đơn vị`,
        docTitle: 'Mẫu thông tri / công văn triệu tập Đoàn',
        query: `công văn thông tri triệu tập ${subject}`,
        desc: 'Văn bản hướng dẫn chỉ đạo triển khai cấp cơ sở',
      },
      {
        phase: 'Triển khai & Tuyên truyền',
        title: `[Triển khai] Thiết kế ấn phẩm truyền thông (Banner, Infographic, Video) lan tỏa nội dung "${subject}"`,
        docTitle: 'Bộ công cụ thiết kế truyền thông số Đoàn Thanh niên',
        query: `infographic poster truyền thông ${subject}`,
        desc: 'Mẫu ấn phẩm trực quan phục vụ mạng xã hội và hội nghị',
      },
      {
        phase: 'Triển khai & Thực hiện',
        title: `[Triển khai] Điều phối lực lượng đoàn viên, hậu cần và tổ chức các hoạt động trọng tâm`,
        docTitle: 'Bảng phân công nhiệm vụ chi tiết và kịch bản điều hành',
        query: `kịch bản tổ chức chi tiết ${subject}`,
        desc: 'Kịch bản điều phối thời gian và nhân lực hiện trường',
      },
      {
        phase: 'Triển khai & Thực hiện',
        title: `[Triển khai] Theo dõi, đôn đốc tiến độ thực hiện tại các chi đoàn thuộc ${taskUnit}`,
        docTitle: 'Bảng theo dõi thi đua và tiến độ thực hiện',
        query: `bảng theo dõi thi đua tiến độ hoạt động đoàn`,
        desc: 'Công cụ đánh giá mức độ tham gia và hoàn thành chỉ tiêu',
      },
      {
        phase: 'Nghiệm thu & Đánh giá',
        title: `[Nghiệm thu] Tổng hợp số liệu, hình ảnh minh chứng và phản hồi của người tham gia`,
        docTitle: 'Hồ sơ minh chứng và phiếu thu thập ý kiến đánh giá',
        query: `báo cáo kết quả hoạt động phong trào đoàn minh chứng`,
        desc: 'Mẫu tổng hợp kết quả định lượng và định tính',
      },
      {
        phase: 'Nghiệm thu & Báo cáo',
        title: `[Nghiệm thu] Hoàn thiện báo cáo tổng kết, đề xuất khen thưởng và gửi cấp ủy/đoàn cấp trên`,
        docTitle: 'Mẫu báo cáo tổng kết chương trình & đề xuất khen thưởng',
        query: `mẫu báo cáo tổng kết hoạt động đoàn thanh niên`,
        desc: 'Báo cáo chính thức đánh giá hiệu quả và bài học kinh nghiệm',
      },
    ];
  } else if (domain === 'event') {
    analysis = `Nhiệm vụ tổ chức sự kiện "${subject}": Đòi hỏi kịch bản điều hành chặt chẽ, kiểm soát khách mời, âm thanh ánh sáng và phương án dự phòng cho ${taskUnit}.`;
    subtaskDefs = [
      {
        phase: 'Chuẩn bị & Kịch bản',
        title: `[Chuẩn bị] Xây dựng kịch bản chương trình tổng thể (Timeline) và kịch bản MC cho "${subject}"`,
        docTitle: 'Mẫu kịch bản điều hành sự kiện chuẩn (Master Timeline)',
        query: `kịch bản tổ chức sự kiện master timeline ${subject}`,
        desc: 'Mẫu phân bổ thời gian chi tiết từng phút cho sự kiện',
      },
      {
        phase: 'Chuẩn bị & Hậu cần',
        title: `[Chuẩn bị] Khảo sát địa điểm, đặt thiết bị âm thanh ánh sáng, sân khấu và trang trí`,
        docTitle: 'Checklist hậu cần, kỹ thuật và thiết bị sự kiện',
        query: `checklist hậu cần âm thanh ánh sáng sự kiện`,
        desc: 'Bảng kiểm tra trang thiết bị và nhà cung cấp dịch vụ',
      },
      {
        phase: 'Chuẩn bị & Khách mời',
        title: `[Chuẩn bị] Lập danh sách khách mời, gửi thư mời và xác nhận sự tham dự`,
        docTitle: 'Biểu mẫu quản lý danh sách đại biểu & khách mời',
        query: `mẫu quản lý danh sách khách mời đại biểu sự kiện`,
        desc: 'Theo dõi tình trạng gửi thiệp và phản hồi tham dự',
      },
      {
        phase: 'Triển khai & Tổng duyệt',
        title: `[Triển khai] Tổ chức buổi chạy thử (Rehearsal/Tổng duyệt) rà soát các khâu kỹ thuật`,
        docTitle: 'Quy trình tổng duyệt sự kiện và xử lý sự cố phát sinh',
        query: `quy trình rehearsal tổng duyệt sự kiện`,
        desc: 'Kế hoạch diễn tập và kiểm tra phối hợp các bộ phận',
      },
      {
        phase: 'Triển khai & Thực hiện',
        title: `[Triển khai] Đón tiếp đại biểu, điều hành sự kiện chính thức theo kịch bản phê duyệt`,
        docTitle: 'Kịch bản lễ tân đón tiếp và điều phối sân khấu',
        query: `quy trình lễ tân đón tiếp đại biểu sự kiện`,
        desc: 'Hướng dẫn sắp xếp chỗ ngồi, đón tiếp và phục vụ',
      },
      {
        phase: 'Nghiệm thu & Đánh giá',
        title: `[Nghiệm thu] Thu dọn hiện trường, kiểm kê tài sản và quyết toán chi phí với các bên`,
        docTitle: 'Bảng kiểm kê tài sản và thanh quyết toán sự kiện',
        query: `quyết toán chi phí tổ chức sự kiện`,
        desc: 'Mẫu đối soát hóa đơn chứng từ và chi phí thực tế',
      },
      {
        phase: 'Nghiệm thu & Báo cáo',
        title: `[Nghiệm thu] Họp rút kinh nghiệm, tổng hợp hình ảnh/video và lưu trữ hồ sơ sự kiện`,
        docTitle: 'Biên bản họp rút kinh nghiệm và báo cáo truyền thông',
        query: `báo cáo tổng kết rút kinh nghiệm sự kiện`,
        desc: 'Đánh giá KPI người tham dự và bài học kinh nghiệm',
      },
    ];
  } else {
    // Default contextual domain
    analysis = `Nhiệm vụ trọng tâm "${subject}": Được phân tích chi tiết hóa các hành động cụ thể gắn liền với đơn vị ${taskUnit}, xác định rõ đầu ra và kiểm soát chất lượng.`;
    subtaskDefs = [
      {
        phase: 'Chuẩn bị & Nghiên cứu',
        title: `[Chuẩn bị] Nghiên cứu cơ sở quy định, khảo sát hiện trạng phục vụ triển khai "${subject}"`,
        docTitle: 'Tài liệu hướng dẫn tra cứu văn bản & khảo sát nghiệp vụ',
        query: `hướng dẫn khảo sát quy định ${subject}`,
        desc: 'Cơ sở tra cứu quy chuẩn và dữ liệu nền tảng',
      },
      {
        phase: 'Chuẩn bị & Kế hoạch',
        title: `[Chuẩn bị] Lập đề cương chi tiết, xác định chỉ số mục tiêu (KPI) và phân công cán bộ ${taskUnit}`,
        docTitle: 'Mẫu đề cương kế hoạch công tác ma trận RACI',
        query: `kế hoạch hành động chi tiết ${subject}`,
        desc: 'Khung phân công trách nhiệm và lộ trình triển khai',
      },
      {
        phase: 'Triển khai & Thực hiện',
        title: `[Triển khai] Thu thập dữ liệu thực tế, phối hợp các đơn vị liên quan xử lý nội dung cốt lõi`,
        docTitle: 'Biểu mẫu thu thập dữ liệu và trao đổi liên phòng ban',
        query: `thu thập dữ liệu phối hợp công tác ${subject}`,
        desc: 'Mẫu phiếu khảo sát và biên bản làm việc phối hợp',
      },
      {
        phase: 'Triển khai & Thực hiện',
        title: `[Triển khai] Trực tiếp thực thi các hạng mục chuyên môn chính của "${subject}"`,
        docTitle: 'Bảng theo dõi tiến độ công việc hàng tuần',
        query: `bảng tiến độ thực thi ${subject}`,
        desc: 'Công cụ giám sát đầu việc và mốc thời gian hoàn thành',
      },
      {
        phase: 'Kiểm tra & Hiệu chỉnh',
        title: `[Kiểm tra] Rà soát chất lượng sản phẩm trung gian, giải quyết khó khăn và tối ưu hóa`,
        docTitle: 'Checklist kiểm soát chất lượng công việc (QA/QC)',
        query: `checklist kiểm soát chất lượng ${subject}`,
        desc: 'Bảng tiêu chí rà soát sai sót và phương án hiệu chỉnh',
      },
      {
        phase: 'Nghiệm thu & Báo cáo',
        title: `[Nghiệm thu] Hoàn thiện sản phẩm cuối cùng, tổng hợp hồ sơ minh chứng đạt chuẩn`,
        docTitle: 'Mẫu hồ sơ nghiệm thu và biên bản bàn giao kết quả',
        query: `mẫu biên bản nghiệm thu ${subject}`,
        desc: 'Hồ sơ đánh giá nghiệm thu sản phẩm nhiệm vụ',
      },
      {
        phase: 'Nghiệm thu & Báo cáo',
        title: `[Nghiệm thu] Lập báo cáo kết quả thực hiện trình lãnh đạo và lưu trữ hồ sơ`,
        docTitle: 'Mẫu báo cáo kết quả thực hiện nhiệm vụ',
        query: `báo cáo kết quả hoàn thành nhiệm vụ ${subject}`,
        desc: 'Báo cáo tổng kết hoàn thành và kiến nghị tiếp theo',
      },
    ];
  }

  // Filter based on granularity
  let selected = subtaskDefs;
  if (mode === 'standard') {
    selected = subtaskDefs.filter((_, idx) => idx % 2 === 0 || idx === subtaskDefs.length - 1);
    if (selected.length < 5) selected = subtaskDefs.slice(0, 5);
  } else if (mode === 'detailed') {
    selected = subtaskDefs;
  } else if (mode === 'deliverables') {
    selected = subtaskDefs.map((st) => ({
      ...st,
      title: st.title.replace(/^\[.*?\]\s*/, '📦 Sản phẩm: '),
    }));
  }

  const subtasks = selected.map((s) => ({
    title: s.title,
    phase: s.phase,
    completed: false,
    resource: {
      title: s.docTitle,
      url: `https://www.google.com/search?q=${encodeURIComponent(s.query)}`,
      description: s.desc,
    },
  }));

  return { analysis, subtasks };
}

/**
 * 2. Deep Semantic AI Decomposition for tasks (WBS)
 * Strictly analyzes the title keywords, domain context, and decomposes action-oriented subtasks.
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
    const mode = (granularity || 'phased') as 'phased' | 'standard' | 'detailed' | 'deliverables';

    if (!ai) {
      const fallbackResult = generateSmartDomainSubtasks(taskTitle, taskUnit, mode);
      return res.json({
        analysis: fallbackResult.analysis,
        subtasks: fallbackResult.subtasks,
        fallback: true,
      });
    }

    const countPrompt =
      mode === 'detailed'
        ? '8 đến 12 việc con chi tiết sâu sắc, tỉ mỉ từng khâu nghiệp vụ, kỹ thuật, dữ liệu và kiểm soát rủi ro'
        : mode === 'phased'
        ? '6 đến 8 việc con phân chia cân đối theo 3 giai đoạn rõ rệt: [Chuẩn bị & Nghiên cứu], [Triển khai & Thực hiện], [Kiểm thử, Nghiệm thu & Bàn giao]'
        : mode === 'deliverables'
        ? '5 đến 7 mốc công việc tập trung vào việc tạo ra và bàn giao các sản phẩm đầu ra cụ thể'
        : '5 đến 7 việc con hành động cốt lõi, thứ tự logic, kết quả đo lường rõ ràng';

    const prompt = `Bạn là Chuyên gia Cao cấp về Phân tích & Phân rã Công việc (Work Breakdown Structure - WBS), Nghiên cứu Quy trình Nghiệp vụ Thực chiến.

NHIỆM VỤ CẦN NGHIÊN CỨU & PHÂN RÃ:
- Tiêu đề nhiệm vụ: "${taskTitle}"
- Đơn vị phụ trách: "${taskUnit}"
- Mô tả / Ngữ cảnh: "${taskDesc || 'Không có mô tả phụ, hãy phân tích và nghiên cứu sâu trực tiếp từ tiêu đề trên.'}"
- Mức độ phân rã được chọn: "${mode}" (${countPrompt})

YÊU CẦU BẮT BUỘC ĐỂ ĐẢM BẢO TÍNH BÁM SÁT 100% TIÊU ĐỀ:
1. NGHIÊN CỨU & BÓC TÁCH NGỮ NGHĨA TIÊU ĐỀ:
   - Nghiên cứu sâu: Tiêu đề "${taskTitle}" muốn làm gì? Thuộc lĩnh vực nào (Công nghệ thông tin, Đoàn/Đoàn thể, Hành chính nhà nước, Giáo dục/Đào tạo, Bán hàng/Thương mại, Tổ chức sự kiện, Tài chính/Ngân sách, v.v.)?
   - Nhận diện các thực thể, thuật ngữ, công cụ, văn bản chỉ đạo hoặc đối tượng thụ hưởng có trong tiêu đề.
2. NGUYÊN TẮC BÁM SÁT (CHỐNG CÂU CHUNG CHUNG):
   - TUYỆT ĐỐI CẤM các câu mơ hồ như: "Lập kế hoạch chi tiết", "Thu thập dữ liệu", "Triển khai nội dung chính", "Kiểm tra chất lượng", "Nghiệm thu công việc".
   - MỌI đầu việc con (title) BẮT BUỘC phải gọi tên cụ thể đối tượng, công cụ, nội dung hoặc công việc thực tế của "${taskTitle}".
   Ví dụ:
   - Nếu tiêu đề là "Tổ chức giải bóng đá Thanh niên 2026": task phải là "Ban hành Điều lệ giải bóng đá Thanh niên 2026 và gửi đến các chi đoàn", "Thu nhận danh sách đăng ký vận động viên và bốc thăm chia bảng", "Thuê sân cỏ, bố trí trọng tài và chuẩn bị cờ cúp y tế", "Tổ chức lễ khai mạc và điều hành các trận đấu vòng bảng", v.v.
   - Nếu tiêu đề là "Xây dựng tính năng thanh toán VNPay": task phải là "Đăng ký tài khoản Merchant VNPay Sandbox và nhận API Key", "Lập trình Endpoint khởi tạo giao dịch VNPay SDK", "Xử lý IPN Webhook xác nhận trạng thái thanh toán đơn hàng", "Kiểm thử luồng thanh toán QR và thẻ nội địa trên môi trường test", v.v.
3. TÀI NGUYÊN THỰC TẾ ĐÍNH KÈM (resource):
   - Gợi ý 1 tài liệu/công cụ thực tế bám sát đầu việc:
     + title: Tên tài liệu/công cụ gợi ý (ví dụ: "Tài liệu kỹ thuật tích hợp VNPay", "Mẫu điều lệ giải đấu thể thao Đoàn thanh niên", v.v.)
     + url: Link tra cứu Google chuyên sâu https://www.google.com/search?q=... với từ khóa chuẩn xác hoặc link mẫu Google Docs/Sheets/Wikipedia chính xác.
     + description: Hướng dẫn ngắn gọn cách ứng dụng tài liệu này vào công việc con.
4. ĐOẠN PHÂN TÍCH NGHIÊN CỨU (analysis):
   - Trả về 2-3 câu phân tích sâu sắc mục tiêu cốt lõi, phạm vi công việc và lời khuyên chiến lược cho người thực hiện nhiệm vụ này.`;

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: {
                type: Type.STRING,
                description: 'Đoạn phân tích sâu sắc về mục tiêu, bản chất nhiệm vụ và chiến lược triển khai bám sát tiêu đề.',
              },
              subtasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: {
                      type: Type.STRING,
                      description: 'Tên việc con chứa từ khóa, hành động và đối tượng cụ thể từ tiêu đề nhiệm vụ.',
                    },
                    phase: {
                      type: Type.STRING,
                      description: 'Tên giai đoạn (ví dụ: Chuẩn bị & Khảo sát, Triển khai & Thực hiện, Kiểm thử & Nghiệm thu)',
                    },
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
            required: ['analysis', 'subtasks'],
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || '{}');
    if (!parsed.subtasks || !Array.isArray(parsed.subtasks) || parsed.subtasks.length === 0) {
      const fallbackResult = generateSmartDomainSubtasks(taskTitle, taskUnit, mode);
      return res.json({
        analysis: fallbackResult.analysis,
        subtasks: fallbackResult.subtasks,
        fallback: true,
      });
    }

    return res.json(parsed);
  } catch (error: any) {
    console.warn('[AI Service] Notice in breakdown-task, serving smart domain fallback:', error?.message);
    const t = (req.body?.title || 'Nhiệm vụ trọng tâm').trim();
    const u = (req.body?.unit || 'Đơn vị thực hiện').trim();
    const mode = (req.body?.granularity || 'phased') as 'phased' | 'standard' | 'detailed' | 'deliverables';
    const fallbackResult = generateSmartDomainSubtasks(t, u, mode);
    return res.json({
      analysis: fallbackResult.analysis,
      subtasks: fallbackResult.subtasks,
      fallback: true,
    });
  }
});

app.post('/api/ai/generate-subtasks', async (req: Request, res: Response) => {
  // Alias to breakdown-task with deep semantic analysis
  try {
    const { title, description, unit, granularity } = req.body;
    const taskTitle = (title || 'Nhiệm vụ trọng tâm').trim();
    const taskDesc = (description || '').trim();
    const taskUnit = (unit || 'Đơn vị thực hiện').trim();
    const mode = (granularity || 'phased') as 'phased' | 'standard' | 'detailed' | 'deliverables';

    if (!ai) {
      const fallbackResult = generateSmartDomainSubtasks(taskTitle, taskUnit, mode);
      return res.json({
        analysis: fallbackResult.analysis,
        subtasks: fallbackResult.subtasks,
        fallback: true,
      });
    }

    const countPrompt =
      mode === 'detailed'
        ? '8 đến 12 việc con chi tiết'
        : mode === 'phased'
        ? '6 đến 8 việc con chia theo 3 giai đoạn: [Chuẩn bị], [Triển khai], [Nghiệm thu]'
        : '5 đến 7 việc con hành động cụ thể';

    const prompt = `Bạn là Chuyên gia Cao cấp về Phân rã Công việc (WBS).
Hãy phân tích và nghiên cứu sâu tiêu đề nhiệm vụ: "${taskTitle}"
Đơn vị: "${taskUnit}"
Mô tả: "${taskDesc}"
Mức độ: "${mode}" (${countPrompt})

Mọi việc con phải bám sát 100% nội dung và từ khóa của "${taskTitle}", không dùng câu chung chung. Mỗi việc con kèm 1 tài nguyên tham khảo thực tế (tiêu đề, url Google search chuẩn, mô tả). Trả về JSON gồm "analysis" và "subtasks".`;

    const response = await callGeminiWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING },
              subtasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    phase: { type: Type.STRING },
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
            required: ['analysis', 'subtasks'],
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || '{}');
    if (!parsed.subtasks || !Array.isArray(parsed.subtasks) || parsed.subtasks.length === 0) {
      const fallbackResult = generateSmartDomainSubtasks(taskTitle, taskUnit, mode);
      return res.json({
        analysis: fallbackResult.analysis,
        subtasks: fallbackResult.subtasks,
        fallback: true,
      });
    }

    return res.json(parsed);
  } catch (error: any) {
    const t = (req.body?.title || 'Nhiệm vụ trọng tâm').trim();
    const u = (req.body?.unit || 'Đơn vị thực hiện').trim();
    const mode = (req.body?.granularity || 'phased') as 'phased' | 'standard' | 'detailed' | 'deliverables';
    const fallbackResult = generateSmartDomainSubtasks(t, u, mode);
    return res.json({
      analysis: fallbackResult.analysis,
      subtasks: fallbackResult.subtasks,
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
