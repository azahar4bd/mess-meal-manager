/**
 * Shared application types (server + client).
 * Nothing in this file may import server-only modules.
 */

export type Role = "admin" | "manager" | "member" | "audit";
export type UserStatus = "pending" | "approved" | "rejected" | "inactive" | "active";
export type OfficeStatus = "pending" | "approved" | "active" | "inactive";
export type ExtraType = "shared" | "individual";
export type BazarCategory =
  | "Groceries"
  | "Vegetables"
  | "Meat"
  | "Fish"
  | "Rice"
  | "Oil"
  | "Spices"
  | "Other";

export const BAZAR_CATEGORIES: BazarCategory[] = [
  "Groceries",
  "Vegetables",
  "Meat",
  "Fish",
  "Rice",
  "Oil",
  "Spices",
  "Other",
];

export const BAZAR_CATEGORY_BN: Record<BazarCategory, string> = {
  Groceries: "মুদি",
  Vegetables: "শাকসবজি",
  Meat: "মাংস",
  Fish: "মাছ",
  Rice: "চাল",
  Oil: "তেল",
  Spices: "মসলা",
  Other: "অন্যান্য",
};

export interface OfficeDTO {
  id: string;
  name: string;
  branch: string;
  code: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  status: OfficeStatus;
  isDefault: boolean;
  sheetUrl: string;
  sheetId: string;
  scriptUrl: string;
  lastSyncedAt: string | null;
  address: string;
  note: string;
  createdAt: string;
}

export interface UserDTO {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  branch: string;
  officeId: string | null;
  officeName?: string;
  role: Role;
  status: UserStatus;
  lastLogin: string | null;
  createdAt: string;
}

/** The signed-in identity returned by /api/auth/me */
export interface AuthUser {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
  /** own office (null for platform admin) */
  officeId: string | null;
  /** office currently in effect (admin switcher aware) */
  activeOfficeId: string | null;
  canSwitchOffice: boolean;
}

export interface MonthDTO {
  id: string;
  officeId: string;
  year: number;
  month: number;
  monthName: string;
  totalDays: number;
  isClosed: boolean;
  carryForwardBalance: number;
  note: string;
}

export interface MemberDTO {
  id: string;
  officeId: string;
  monthId: string;
  name: string;
  role: string;
  isActive: boolean;
  phone: string;
  note: string;
  sortOrder: number;
  /** আগের মাস থেকে ক্যারি হওয়া বাকি (জের) — নতুন মাসের শুরুতে ≥ 0 */
  openingDue: number;
  createdAt: string;
}

export interface MealRowDTO {
  id: string;
  monthId: string;
  memberId: string;
  memberName: string;
  day: number;
  date: string;
  meals: number;
  note: string;
}

/** বাজারের আইটেম-ভিত্তিক হিসাবের এক লাইন (আইটেম পপআপ থেকে যোগ করা) */
export interface BazarLine {
  item: string;
  qty: number;
  price: number;
}

export interface BazarDTO {
  id: string;
  monthId: string;
  date: string;
  day: number;
  memberId: string | null;
  buyerName: string;
  /** এই সদস্য নিজের পকেটের টাকা থেকে বাজারটি করেছেন → মাস শেষে সমন্বয় হবে */
  paidByMemberId: string;
  category: BazarCategory;
  items: string;
  lines: BazarLine[];
  amount: number;
  note: string;
}

export interface DepositDTO {
  id: string;
  monthId: string;
  date: string;
  day: number;
  memberId: string | null;
  memberName: string;
  amount: number;
  note: string;
  type: string;
  createdBy?: string;
}

export interface IncomeDTO {
  id: string;
  monthId: string;
  date: string;
  day: number;
  title: string;
  amount: number;
  note: string;
}

export interface ExtraDTO {
  id: string;
  monthId: string;
  date: string;
  day: number;
  title: string;
  amount: number;
  type: ExtraType;
  memberId: string | null;
  memberName: string;
  note: string;
}

export interface MemberCalculation {
  memberId: string;
  name: string;
  role: string;
  phone: string;
  isActive: boolean;
  totalMill: number;
  perMillRate: number;
  mealCost: number;
  individualExtra: number;
  sharedExtra: number;
  totalCost: number;
  /** মাসের জমা/সমন্বয় — স্থায়ী ফান্ড বাদে */
  totalDeposit: number;
  /** নিজের টাকা থেকে করা মোট বাজার (জের সমন্বয় + পাওনা — দুটো মিলে) */
  selfPaidBazar: number;
  /** আগের মাসের বাকি (জের) — এই মাসের শুরুতে */
  openingDue: number;
  /** জেরের যে অংশ নিজের টাকার বাজার থেকে সমন্বয় হয়েছে */
  jerAdjusted: number;
  /** জেরের যে অংশ নগদ (jer_payment) পরিশোধ হয়েছে */
  jerCashPaid: number;
  /** এখনো বাকি জের — লাস্ট ব্যালেন্স থেকে বাদ যায় */
  remainingJer: number;
  /** জের সমন্বয়ের পর বাড়তি নিজের-টাকার বাজার — এটাই পাওনা হিসেবে যোগ হয় */
  selfPaidCredit: number;
  /** নগদ জমার যে অংশ জের মিটিয়ে চলতি মাসের জমা/সমন্বয়ে বসেছে */
  cashCredit: number;
  /** মোট বকেয়া জের সমন্বয় (নিজ-বাজার + নগদ) */
  jerSettled: number;
  /** শুধু permanent_fund ধরনের জমা — দেনা-পাওনার সঙ্গে মেলে না */
  permanentFund: number;
  denaPoana: number;
  balance: number;
  status: "দিবে" | "পাবে" | "সমান";
  statusEn: "Due" | "Receive" | "Settled";
}

/** internal summary object (spec §87) */
export interface MonthSummary {
  totalMembers: number;
  activeMembers: number;
  totalMill: number;
  totalBazarCost: number;
  totalOthersIncome: number;
  netCost: number;
  perMillRate: number;
  totalFund: number;
  /** সদস্যরা নিজের পকেট থেকে যে বাজার করেছে (মোট) */
  totalSelfPaidBazar: number;
  /** নিজ টাকার বাজারের যে অংশ জের মিটিয়ে জমা/সমন্বয়ে বসেছে (KPI) */
  totalSelfPaidCredit: number;
  /** আগের মাস থেকে ক্যারি হওয়া মোট জের (মাসের শুরুতে) */
  totalOpeningDue: number;
  /** বাজার থেকে সমন্বয় হওয়া মোট জের */
  totalJerAdjusted: number;
  /** নগদে পরিশোধ হওয়া মোট জের */
  totalJerCashPaid: number;
  /** এখনো বাকি মোট জের — লাস্ট ব্যালেন্স থেকে বাদ যায় */
  totalRemainingJer: number;
  /** ফান্ড থেকে করা বাজার (লাস্ট ব্যালেন্স থেকে বাদ যায়) */
  fundPaidBazar: number;
  totalSharedExtra: number;
  totalIndividualExtra: number;
  totalDepositsThisMonth: number;
  /** ফান্ড বাদে সদস্যের জমা/সমন্বয় (দেনা-পাওনায় এটাই ধরা হয়) */
  totalMemberPayments: number;
  /** প্রকৃত নগদ জমা (ক্যারি-ফরোয়ার্ড সমন্বয় বাদে) — লাস্ট ব্যালেন্স বাড়ায় */
  totalCashCollected: number;
  /**
   * জের-বাদ রিজার্ভ (lastBalance) বনাম হাতে থাকা প্রকৃত নগদ।
   * ক্লোজের সময় পরের মাসে এটাই carryForwardBalance হিসেবে যায়।
   */
  lastBalance: number;
  cashBalance: number;
  memberCalculations: MemberCalculation[];
}

/** main data object (spec §104) */
export interface MessData {
  id: string;
  officeId: string;
  year: number;
  month: number;
  monthName: string;
  totalDays: number;
  isClosed: boolean;
  carryForwardBalance: number;
  members: MemberDTO[];
  dailyMeals: MealRowDTO[];
  bazarExpenses: BazarDTO[];
  deposits: DepositDTO[];
  otherIncomes: IncomeDTO[];
  extraExpenses: ExtraDTO[];
}

export interface SyncLogDTO {
  id: string;
  at: string;
  action: string;
  trigger: string;
  officeId: string;
  monthId: string;
  ok: boolean;
  message: string;
  sheetUrl: string;
  durationMs: number;
  userName?: string;
}

export interface AuditLogDTO {
  id: string;
  at: string;
  userName: string;
  role: string;
  officeId: string;
  action: string;
  entity: string;
  entityId: string;
  ok: boolean;
  message: string;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
  fields?: Record<string, string>;
}

export type ApiResponse<T> = { ok: true; data: T } | ApiError;

/* ── সাপোর্ট চ্যাট ─────────────────────────────────────────── */
export interface SupportMessageDTO {
  id: string;
  at: string;
  userId: string;
  userName: string;
  role: string;
  officeId: string;
  officeName: string;
  /** "user" = ব্যবহারকারী → অ্যাডমিন; "admin" = অ্যাডমিন → ব্যবহারকারী */
  sender: "user" | "admin";
  body: string;
  read: boolean;
}

export interface SupportThread {
  userId: string;
  userName: string;
  role: string;
  officeId: string;
  officeName: string;
  lastAt: string;
  lastBody: string;
  lastSender: "user" | "admin";
  unread: number;
  total: number;
}

export const TABS = [
  "dashboard",
  "meals",
  "bazar",
  "fund",
  "income",
  "extras",
  "members",
  "report",
  "sheet",
  "admin",
] as const;
export type Tab = (typeof TABS)[number];
