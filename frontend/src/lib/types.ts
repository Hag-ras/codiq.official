export type Role = 'STUDENT' | 'PARENT' | 'INSTRUCTOR' | 'ASSISTANT' | 'ADMIN';
export type Track = 'KIDS' | 'SCHOOL' | 'COLLEGE';
export type Billing = 'ONE_TIME' | 'MONTHLY';
export type PayMethod = 'CARD' | 'WALLET' | 'INSTALLMENTS' | 'FAWRY' | 'INSTAPAY';
export type PayStatus = 'PENDING' | 'AWAITING_REVIEW' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface Me {
  id: string; name: string; email: string; phone?: string | null; role: Role; track: Track | null; avatar: string | null;
  children: { id: string; name: string; track: Track | null }[];
}

export interface Package {
  id: string; slug: string; name: string; track: Track; description: string;
  priceOneTime: number; priceMonthly: number | null; installmentsAllowed: boolean; isPublished: boolean;
  _count?: { sessions: number; enrollments: number };
  sessions?: { id: string; order: number; title: string; type: 'LIVE' | 'RECORDED'; startsAt: string | null; durationMin: number }[];
}

export interface SessionSummary {
  id: string; order: number; title: string; type: 'LIVE' | 'RECORDED'; startsAt: string | null; durationMin: number;
  packageId: string; packageName: string; instructorName: string | null; hasRecording: boolean; youtubeId?: string | null; isLiveNow: boolean;
  completed: boolean; dueAt: string | null; submission: { status: 'SUBMITTED' | 'GRADED'; score: number | null } | null;
  quizScore: number | null; pendingSubmissions: number;
}

export interface SessionDetail extends SessionSummary {
  description: string | null;
  package: { id: string; name: string; track: Track };
  instructor: { id: string; name: string } | null;
  materials: { id: string; name: string; sizeBytes: number; mimeType: string }[];
  assignment: null | {
    id: string; title: string; brief: string; dueAt: string | null; maxScore: number;
    mySubmission: null | { id: string; text: string | null; fileName: string | null; status: 'SUBMITTED' | 'GRADED'; score: number | null; feedback: string | null; submittedAt: string };
  };
  quiz: null | {
    id: string; title: string; passScore: number;
    lastAttempt: null | { score: number; answers: number[] };
    questions: { id: string; text: string; options: string[]; correctIndex?: number }[];
  };
}

export interface Payment {
  id: string; amount: number; method: PayMethod; billing: Billing; status: PayStatus; createdAt: string; paidAt: string | null;
  providerRef: string | null; package: { name: string }; student?: { name: string }; payer?: { name: string; email: string };
  discountAmount?: number; coupon?: { code: string } | null;
}

export const TRACK_LABEL: Record<Track, string> = { KIDS: 'Codiq Kids', SCHOOL: 'Codiq School', COLLEGE: 'Codiq College' };
export const TRACK_AUDIENCE: Record<Track, string> = {
  KIDS: 'Ages 8–16',
  SCHOOL: 'Egyptian curriculum · Age 15',
  COLLEGE: 'University students',
};

export interface AdminStats {
  users: { total: number; newLast30Days: number; byRole: Partial<Record<Role, number>> };
  enrollments: { active: number; byTrack: Record<Track, number> };
  revenue: { total: number; paidPayments: number; byMonth: { month: string; amount: number }[] };
  payments: { awaitingReview: number; pending: number };
  content: { sessions: number; packages: number };
  recentPayments: { id: string; amount: number; method: PayMethod; status: PayStatus; createdAt: string; payer: { name: string }; package: { name: string } }[];
  recentUsers: { id: string; name: string; email: string; role: Role; createdAt: string; avatar: string | null }[];
}

export interface MyCourse {
  enrollmentId: string; packageId: string; name: string; track: Track; description: string; billing: Billing;
  activeUntil: string | null; totalSessions: number; completedSessions: number; percent: number;
}

export interface CatalogPackage extends Package { enrolled: boolean }

export interface Profile {
  id: string; name: string; email: string; phone: string | null; role: Role; track: Track | null;
  avatar: string | null; createdAt: string; hasGoogle: boolean;
}

export interface AdminUser {
  id: string; name: string; email: string; phone: string | null; role: Role; track: Track | null; createdAt: string;
  avatar: string | null; _count: { enrollments: number };
}

export interface AdminAssignmentRow {
  id: string; title: string; dueAt: string | null; maxScore: number;
  session: { id: string; title: string; instructorName: string | null };
  package: { id: string; name: string; track: Track };
  students: number; submitted: number; graded: number; toGrade: number; averageScore: number | null;
}

export interface AdminAssignmentDetail {
  id: string; title: string; brief: string; dueAt: string | null; maxScore: number;
  session: { id: string; title: string; instructorName: string | null };
  package: { name: string; track: Track };
  submissions: {
    id: string; text: string | null; fileName: string | null; hasFile: boolean; status: 'SUBMITTED' | 'GRADED'; score: number | null;
    feedback: string | null; submittedAt: string; gradedAt: string | null;
    student: { id: string; name: string; email: string; avatar: string | null };
  }[];
  notSubmitted: { id: string; name: string; email: string; phone: string | null; avatar: string | null }[];
}

export interface AdminCoupon {
  id: string; code: string; description: string | null; type: 'PERCENT' | 'FIXED'; value: number; maxRedemptions: number | null;
  redeemedCount: number; expiresAt: string | null; packageId: string | null; packageName: string | null; track: Track | null; active: boolean;
  createdAt: string; paidCount: number; discountTotal: number; revenueTotal: number;
}

export interface RevenueAnalytics {
  range: '30d' | '90d' | '12m'; monthly: boolean;
  totals: { revenue: number; previousRevenue: number; paidCount: number; previousPaidCount: number; averageOrder: number; discountsGiven: number; couponOrders: number; recurringRevenue: number };
  series: { label: string; revenue: number; count: number }[];
  byMethod: { method: PayMethod; revenue: number; count: number }[];
  byTrack: { track: Track; revenue: number; count: number }[];
  byPackage: { id: string; name: string; track: Track; revenue: number; count: number }[];
  funnel: { attempts: number; paid: number; failed: number; pending: number; awaitingReview: number; successRate: number | null };
}
export interface StudentAnalytics {
  range: '30d' | '90d' | '12m';
  totals: { students: number; newInRange: number; payingStudents: number; conversionRate: number; activeLearners: number };
  series: { label: string; count: number }[];
  byTrack: { track: Track; count: number }[];
  enrollments: { active: number; expired: number; cancelled: number };
}
export interface CourseAnalytics {
  id: string; name: string; track: Track; isPublished: boolean; sessions: number; enrollments: number; activeStudents: number;
  revenue: number; paidCount: number; completionRate: number | null; averageQuizScore: number | null; averageGrade: number | null;
}
export interface StudentPaymentRow {
  id: string; name: string; email: string; track: Track | null; joined: string; avatar: string | null; courses: number;
  totalPaid: number; payments: number; discounts: number; lastPaymentAt: string | null; failedPayments: number;
}
export interface StudentPayments { totals: { students: number; paying: number; revenue: number; average: number }; rows: StudentPaymentRow[] }
export interface StudentPaymentDetail {
  student: { id: string; name: string; email: string; track: Track | null; avatar: string | null };
  payments: { id: string; amount: number; discountAmount: number; method: PayMethod; billing: Billing; status: PayStatus; providerRef: string | null; createdAt: string; paidAt: string | null; package: { name: string }; payer: { name: string }; coupon: { code: string } | null }[];
  enrollments: { billing: Billing; status: string; activeUntil: string | null; package: { name: string } }[];
}

export interface AdminCourseDetail {
  id: string; name: string; track: Track; description: string; priceOneTime: number; priceMonthly: number | null; isPublished: boolean; installmentsAllowed: boolean;
  totals: { revenue: number; paidPayments: number; discounts: number; pending: number; students: number; sessions: number };
  instructors: { id: string; name: string; email: string; avatar: string | null; sessions: number }[];
  sessions: { id: string; order: number; title: string; type: string; startsAt: string | null; instructorName: string | null }[];
  students: {
    enrollmentId: string; id: string; name: string; email: string; phone: string | null; role: Role; track: Track | null; avatar: string | null;
    billing: Billing; status: string; active: boolean; activeUntil: string | null; enrolledAt: string; joinedAt: string; completedSessions: number;
    parent: { name: string; email: string; phone: string | null } | null;
  }[];
  payments: {
    id: string; amount: number; discountAmount: number; method: PayMethod; billing: Billing; status: PayStatus; providerRef: string | null;
    createdAt: string; paidAt: string | null; coupon: { code: string } | null; student: { id: string; name: string }; payer: { name: string; email: string };
  }[];
}
