import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  attendance,
  InsertAttendance,
  InsertLocationHistory,
  InsertUser,
  locationHistory,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      lastSignedIn: user.lastSignedIn ?? new Date(),
    };

    const updateSet: Partial<InsertUser> = {
      name: values.name,
      email: values.email,
      loginMethod: values.loginMethod,
      lastSignedIn: values.lastSignedIn,
      updatedAt: new Date(),
    };

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.openId,
        set: updateSet,
      });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================
// 勤怠管理クエリ
// ============================================================

/** 今日の勤怠記録を取得（なければnull） */
export async function getTodayAttendance(userId: number, workDate: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.userId, userId), eq(attendance.workDate, workDate)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/** 月次勤怠記録を取得 */
export async function getMonthlyAttendance(userId: number, yearMonth: string) {
  const db = await getDb();
  if (!db) return [];

  const startDate = `${yearMonth}-01`;
  const endDate = `${yearMonth}-31`;

  const result = await db
    .select()
    .from(attendance)
    .where(eq(attendance.userId, userId))
    .orderBy(desc(attendance.workDate));

  return result.filter((r) => r.workDate >= startDate && r.workDate <= endDate);
}

/** 出勤打刻 */
export async function clockIn(userId: number, workDate: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getTodayAttendance(userId, workDate);
  if (existing) {
    await db
      .update(attendance)
      .set({ clockIn: new Date(), status: "working" })
      .where(eq(attendance.id, existing.id));
    return existing.id;
  }

  const result = await db
    .insert(attendance)
    .values({
      userId,
      workDate,
      clockIn: new Date(),
      status: "working",
    })
    .returning({ id: attendance.id });
  return result[0].id;
}

/** 退勤打刻 */
export async function clockOut(userId: number, workDate: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getTodayAttendance(userId, workDate);
  if (!existing) throw new Error("No attendance record found");

  const updateData: Partial<InsertAttendance> = {
    clockOut: new Date(),
    status: "finished",
  };

  if (existing.status === "break" && existing.breakStart && !existing.breakEnd) {
    updateData.breakEnd = new Date();
  }

  await db.update(attendance).set(updateData).where(eq(attendance.id, existing.id));
}

/** 休憩開始 */
export async function startBreak(userId: number, workDate: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getTodayAttendance(userId, workDate);
  if (!existing) throw new Error("No attendance record found");

  await db
    .update(attendance)
    .set({ breakStart: new Date(), status: "break" })
    .where(eq(attendance.id, existing.id));
}

/** 休憩終了 */
export async function endBreak(userId: number, workDate: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getTodayAttendance(userId, workDate);
  if (!existing) throw new Error("No attendance record found");

  await db
    .update(attendance)
    .set({ breakEnd: new Date(), status: "working" })
    .where(eq(attendance.id, existing.id));
}

// ============================================================
// GPS位置履歴クエリ
// ============================================================

/** GPS位置情報を記録 */
export async function recordLocation(data: InsertLocationHistory): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(locationHistory).values(data);
}

/** ユーザーの今日の位置履歴を取得 */
export async function getTodayLocations(userId: number, workDate: string) {
  const db = await getDb();
  if (!db) return [];

  const startOfDay = new Date(`${workDate}T00:00:00`);
  const endOfDay = new Date(`${workDate}T23:59:59`);

  const result = await db
    .select()
    .from(locationHistory)
    .where(eq(locationHistory.userId, userId))
    .orderBy(desc(locationHistory.recordedAt));

  return result.filter(
    (r) => r.recordedAt >= startOfDay && r.recordedAt <= endOfDay
  );
}
