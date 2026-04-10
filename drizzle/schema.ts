import {
  boolean,
  decimal,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 勤怠記録テーブル
 * スタッフの出退勤・休憩時間を管理する
 */
export const attendanceStatusEnum = pgEnum("attendance_status", ["off", "working", "break", "finished"]);

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  /** 勤務日 (YYYY-MM-DD) */
  workDate: varchar("workDate", { length: 10 }).notNull(),
  /** 出勤時刻 */
  clockIn: timestamp("clockIn"),
  /** 退勤時刻 */
  clockOut: timestamp("clockOut"),
  /** 休憩開始時刻 */
  breakStart: timestamp("breakStart"),
  /** 休憩終了時刻 */
  breakEnd: timestamp("breakEnd"),
  /** 現在のステータス */
  status: attendanceStatusEnum("status").default("off").notNull(),
  /** メモ */
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;

/**
 * GPS位置履歴テーブル
 * 勤務中のスタッフの位置情報を記録する
 */
export const locationHistory = pgTable("location_history", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  attendanceId: integer("attendanceId"),
  /** 緯度 */
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  /** 経度 */
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  /** 精度 (メートル) */
  accuracy: decimal("accuracy", { precision: 10, scale: 2 }),
  /** 記録時刻 */
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  /** バックグラウンドで取得したか */
  isBackground: boolean("isBackground").default(false).notNull(),
});
export type LocationHistory = typeof locationHistory.$inferSelect;
export type InsertLocationHistory = typeof locationHistory.$inferInsert;
