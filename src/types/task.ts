export interface SubtaskResource {
  title: string;
  url: string;
  description?: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  phase?: string;
  resource?: SubtaskResource;
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  uploadDate: string;
}

export interface TaskLink {
  id: string;
  title: string;
  url: string;
}

export interface TaskReminder {
  enabled: boolean;
  minutesBefore: number; // e.g. 15, 30, 60, 1440 (1 day)
  notified?: boolean;
}

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

export interface Task {
  id: string;
  title: string;
  description: string;
  unit: string; // Đơn vị thực hiện
  priority: TaskPriority;
  createdAt: string; // ISO string
  dueDate: string; // ISO string (giờ, ngày, tháng, năm)
  completedAt?: string; // ISO string when finished
  subtasks: Subtask[];
  progress: number; // 0 - 100
  status: TaskStatus;
  attachments: TaskAttachment[];
  links: TaskLink[];
  reminder: TaskReminder;
  notes?: string;
  aiAnalysis?: string;
}

export interface ConnectedAppItem {
  id: string;
  name: string;
  url: string;
  category: 'calendar' | 'storage' | 'communication' | 'project_management' | 'document' | 'other';
  description: string;
  isConnected: boolean;
  addedAt: string;
  iconKey?: string;
}

export interface UserProfile {
  displayName: string;
  role?: string; // Chức vụ / Vai trò công tác
  weeklyGoal?: number; // Mục tiêu nhiệm vụ hoàn thành mỗi tuần
  birthDate: string; // YYYY-MM-DD
  units: string[]; // Các đơn vị đang sinh hoạt
  avatarUrl: string;
  bio?: string;
  email?: string;
  phone?: string;
  connectedAppsList?: ConnectedAppItem[];
  connectedApps?: {
    googleCalendar: boolean;
    googleDrive: boolean;
    zalo: boolean;
    notion: boolean;
    telegram: boolean;
  };
  notifications: {
    browserEnabled: boolean;
    soundEnabled: boolean;
    priorityReminders: boolean;
    overdueAlerts: boolean;
  };
}

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  password?: string;
  isProfileCompleted: boolean;
  profile: UserProfile;
  createdAt: string;
  lastSyncedAt?: string;
}

export type BreakdownGranularity = 'standard' | 'detailed' | 'phased';

export interface GapAnalysisItem {
  id: string;
  category: 'completion' | 'subtasks' | 'deadline' | 'unit' | 'attachments';
  title: string;
  description: string;
  recommendation: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface StrategicRecommendation {
  id: string;
  title: string;
  detail: string;
  tag: string;
  impact: 'high' | 'medium' | 'low';
  timeframe?: 'today' | 'this_week' | 'long_term';
}

export interface WeeklyArchiveAnalysis {
  thisWeekCompletedCount: number;
  lastWeekCompletedCount: number;
  earlierCompletedCount: number;
  averageLeadTimeDays: number;
  onTimeCompletionRate: number;
  weeklyVelocity: number; // tasks completed per week average
  weeklySummaryText: string;
}

export interface SystemPragmatismAssessment {
  pragmatismScore: number; // 0 - 100
  pragmatismGrade: string; // e.g., "Rất cao - Thực chiến tối đa"
  subtaskUtilizationRate: number; // % tasks with checklists
  attachmentUtilizationRate: number; // % tasks with attachments
  deadlinePrecisionRate: number; // % tasks with realistic deadlines & reminders
  unitAssignmentRate: number; // % tasks assigned to explicit units
  assessmentSummary: string;
  practicalStrengths: string[];
  practicalGaps: string[];
}

export interface TaskExecutionHealth {
  healthLevel: 'healthy' | 'warning' | 'critical';
  healthLabel: string;
  urgentPendingCount: number;
  overdueCount: number;
  inProgressCount: number;
  executionSummary: string;
  bottlenecks: string[];
  immediateRisks: string[];
}

export interface UserManagementCapability {
  capabilityScore: number; // 0 - 100
  maturityStage: string; // e.g., "Cấp 4: Quản Trị Linh Hoạt & Chiến Lược"
  planningScore: number; // 0 - 100
  executionDisciplineScore: number; // 0 - 100
  deadlineControlScore: number; // 0 - 100
  crossUnitCoordinationScore: number; // 0 - 100
  strengths: string[];
  growthAreas: string[];
  coachingGuidance: string;
}

export interface AIStrategicReview {
  score: number; // 0 - 100 overall productivity index (starts strictly at 0/100 until tasks completed)
  grade: string;
  overallSummary: string;
  completionRate: number;
  onTimeRate: number;
  averageVelocityDays?: number;
  
  // 4 Core Required Pillars
  weeklyArchiveAnalysis: WeeklyArchiveAnalysis;
  systemPragmatism: SystemPragmatismAssessment;
  taskExecution: TaskExecutionHealth;
  userManagement: UserManagementCapability;

  // Gap analysis: Missing elements and targeted strategic fixes
  gaps: GapAnalysisItem[];

  strengths: string[];
  bottlenecks: string[];
  recommendations: StrategicRecommendation[];
  analyzedAt: string;
}

