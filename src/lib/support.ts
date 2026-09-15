/**
 * সাপোর্ট চ্যাট — ব্যবহারকারী (ম্যানেজার/সদস্য/যেকোনো অফিস) প্ল্যাটফর্ম
 * অ্যাডমিনকে বার্তা পাঠায়; অ্যাডমিন উত্তর দেয়। সব বার্তা support_messages টেবলে।
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cryptoId, supportMessages, type User } from "@/db/schema";
import type { SupportMessageDTO, SupportThread } from "@/lib/types";

/**
 * চলমান ডিপ্লয়মেন্টে শেল/মাইগ্রেশন এনভ না থাকলেও প্রথম চ্যাট কলেই টেবিল
 * নিজে থেকে তৈরি হয় (CREATE TABLE IF NOT EXISTS — সম্পূর্ণ idempotent;
 * drizzle/0005_support_chat.sql-এর সমান)। প্রসেসপ্রতি একবারই চলে।
 */
let tableReady: Promise<void> | null = null;

export function ensureSupportTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "support_messages" (
          "id" text PRIMARY KEY NOT NULL,
          "at" timestamptz DEFAULT now() NOT NULL,
          "user_id" text DEFAULT '' NOT NULL,
          "user_name" text DEFAULT '' NOT NULL,
          "role" text DEFAULT '' NOT NULL,
          "office_id" text DEFAULT '' NOT NULL,
          "office_name" text DEFAULT '' NOT NULL,
          "sender" text DEFAULT 'user' NOT NULL,
          "body" text DEFAULT '' NOT NULL,
          "read" boolean DEFAULT false NOT NULL
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "support_user_idx" ON "support_messages" ("user_id","at")`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "support_read_idx" ON "support_messages" ("read","sender")`);
    })();
    tableReady.catch(() => {
      tableReady = null; // পরের কলে আবার চেষ্টা
    });
  }
  return tableReady;
}

function dto(r: typeof supportMessages.$inferSelect): SupportMessageDTO {
  return {
    id: r.id,
    at: r.at.toISOString(),
    userId: r.userId,
    userName: r.userName,
    role: r.role,
    officeId: r.officeId,
    officeName: r.officeName,
    sender: r.sender === "admin" ? "admin" : "user",
    body: r.body,
    read: r.read,
  };
}

/** ব্যবহারকারীর নিজের থ্রেড (পুরোনো → নতুন) */
export async function listMine(userId: string): Promise<SupportMessageDTO[]> {
  const rows = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.userId, userId))
    .orderBy(asc(supportMessages.at));
  return rows.map(dto);
}

/** অ্যাডমিনের উত্তরগুলো ব্যবহারকারী পড়েছেন ধরে নেওয়া হয় (থ্রেড খোলামাত্র) */
export async function markRepliesRead(userId: string): Promise<void> {
  await db
    .update(supportMessages)
    .set({ read: true })
    .where(and(eq(supportMessages.userId, userId), eq(supportMessages.sender, "admin"), eq(supportMessages.read, false)));
}

/** ব্যবহারকারীর জন্য অপঠিত অ্যাডমিন-উত্তরের সংখ্যা */
export async function unreadForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(supportMessages)
    .where(and(eq(supportMessages.userId, userId), eq(supportMessages.sender, "admin"), eq(supportMessages.read, false)));
  return rows[0]?.n ?? 0;
}

/** অ্যাডমিনের জন্য অপঠিত ইনবাউন্ড বার্তা ও থ্রেড সংখ্যা */
export async function unreadForAdmin(): Promise<{ messages: number; threads: number }> {
  const rows = await db
    .select({
      messages: sql<number>`count(*) filter (where ${supportMessages.read} = false and ${supportMessages.sender} = 'user')::int`,
      threads: sql<number>`count(distinct ${supportMessages.userId}) filter (where ${supportMessages.read} = false and ${supportMessages.sender} = 'user')::int`,
    })
    .from(supportMessages);
  return { messages: rows[0]?.messages ?? 0, threads: rows[0]?.threads ?? 0 };
}

/** অ্যাডমিনের ইনবক্স — প্রতি ব্যবহারকারী এক সারি, সাম্প্রতিক আগে (ড্রাইভার-নিরপেক্ষ: query builder) */
export async function listThreads(): Promise<SupportThread[]> {
  const rows = await db
    .select()
    .from(supportMessages)
    .orderBy(asc(supportMessages.at));
  const map = new Map<string, SupportThread & { _lastAt: number }>();
  type MutableThread = SupportThread & { _lastAt: number };
  for (const r of rows) {
    const unread = r.read === false && r.sender === "user" ? 1 : 0;
    const existing = map.get(r.userId);
    if (existing) {
      existing.total += 1;
      existing.unread += unread;
      existing.lastAt = r.at.toISOString();
      existing.lastBody = r.body;
      existing.lastSender = r.sender === "admin" ? "admin" : "user";
      existing._lastAt = r.at.getTime();
    } else {
      map.set(r.userId, {
        userId: r.userId,
        userName: r.userName,
        role: r.role,
        officeId: r.officeId,
        officeName: r.officeName,
        lastAt: r.at.toISOString(),
        lastBody: r.body,
        lastSender: r.sender === "admin" ? "admin" : "user",
        unread,
        total: 1,
        _lastAt: r.at.getTime(),
      });
    }
  }
  return [...map.values()]
    .sort((a, b) => b._lastAt - a._lastAt)
    .map(({ _lastAt, ...t }: MutableThread) => t);
}

/** নির্দিষ্ট ব্যবহারকারীর পুরো থ্রেড; খোলামাত্র ইনবাউন্ড পঠিত ধরা হয় */
export async function openThread(userId: string): Promise<SupportMessageDTO[]> {
  await db
    .update(supportMessages)
    .set({ read: true })
    .where(and(eq(supportMessages.userId, userId), eq(supportMessages.sender, "user"), eq(supportMessages.read, false)));
  const rows = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.userId, userId))
    .orderBy(asc(supportMessages.at));
  return rows.map(dto);
}

export async function insertMessage(input: {
  user: Pick<User, "userId" | "name" | "role">;
  officeId: string;
  officeName: string;
  sender: "user" | "admin";
  body: string;
  /** admin উত্তর দিলে গ্রাহকের userId/নাম/রোল */
  targetUserId?: string;
  targetName?: string;
  targetRole?: string;
}): Promise<SupportMessageDTO> {
  const userId = input.sender === "admin" ? (input.targetUserId ?? "") : input.user.userId;
  const userName = input.sender === "admin" ? (input.targetName ?? "") : input.user.name;
  const role = input.sender === "admin" ? (input.targetRole ?? "") : input.user.role;
  const [row] = await db
    .insert(supportMessages)
    .values({
      id: cryptoId("msg"),
      userId,
      userName,
      role,
      officeId: input.officeId,
      officeName: input.officeName,
      sender: input.sender,
      body: input.body,
      read: false,
    })
    .returning();
  return dto(row);
}
