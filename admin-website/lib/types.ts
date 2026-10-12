export type Role = 'ADMIN' | 'EDITOR' | 'REVIEWER';

export type LearningLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface ApiErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  details?: {
    reason?: string;
    [key: string]: unknown;
  };
  requestId?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  passwordChangeRequired?: boolean;
}

export interface AuthSessionResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  admin: AdminUser;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleItem {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  position: number;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonSummary {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  shortTitle: string | null;
  subtitle: string | null;
  introduction: string | null;
  estimatedMinutes: number | null;
  position: number;
  levels: LearningLevel[];
  coverMediaId: string | null;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';
  version: number;
  contentRevision?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BlockLevelVariant {
  level: LearningLevel;
  content: Record<string, unknown> | null;
}

export interface LessonBlock {
  id: string;
  lessonId: string;
  type: string;
  position: number;
  sharedContent: Record<string, unknown> | null;
  levels: BlockLevelVariant[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowState {
  subjectId: string;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED';
  version: number;
  allowedActions: ('SUBMIT_FOR_REVIEW' | 'REQUEST_CHANGES' | 'APPROVE' | 'PUBLISH' | 'UNPUBLISH')[];
}

export interface WorkflowEvent {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  actorId: string;
  note: string | null;
  createdAt: string;
}

export interface ReadinessIssue {
  code: string;
  severity: 'BLOCKING';
  source: 'RULE' | 'RESOLVER' | 'SAFEGUARD';
  level?: LearningLevel;
  blockId?: string;
  message: string;
  problems?: { code: string; message: string; path?: string }[];
}

export interface LevelReadiness {
  level: LearningLevel;
  visibleBlocks: number;
  resolvedBlocks: number;
}

export interface ReadinessReport {
  lessonId: string;
  ready: boolean;
  contentRevision: number;
  issues: ReadinessIssue[];
  levels: LevelReadiness[];
}

export interface MediaAsset {
  id: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdBy: string;
  createdAt: string;
}

export interface QuizOption {
  id: string;
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  id: string;
  type: string;
  prompt: string;
  explanation: string | null;
  options: QuizOption[];
}

export interface AdminQuiz {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  questions: QuizQuestion[];
}

export interface QuizSummary {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  version: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface AccountItem {
  id: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AccountEvent {
  id: string;
  seq: number;
  subjectAdminId: string;
  actorAdminId: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
}

export interface ConsistencyIssue {
  code: string;
  lessonId: string;
  publicationId: string | null;
  level?: string;
}

export interface ConsistencyReport {
  consistent: boolean;
  limitPerCheck: number;
  snapshotsVerified: boolean;
  truncated: boolean;
  issues: ConsistencyIssue[];
}
