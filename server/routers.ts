import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  /** 勤怠管理API */
  attendance: router({
    /** 今日の勤怠状態を取得 */
    today: protectedProcedure
      .input(z.object({ workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(({ ctx, input }) => {
        return db.getTodayAttendance(ctx.user.id, input.workDate);
      }),

    /** 月次勤怠記録を取得 */
    monthly: protectedProcedure
      .input(z.object({ yearMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ ctx, input }) => {
        return db.getMonthlyAttendance(ctx.user.id, input.yearMonth);
      }),

    /** 出勤打刻 */
    clockIn: protectedProcedure
      .input(z.object({ workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(({ ctx, input }) => {
        return db.clockIn(ctx.user.id, input.workDate);
      }),

    /** 退勤打刻 */
    clockOut: protectedProcedure
      .input(z.object({ workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(({ ctx, input }) => {
        return db.clockOut(ctx.user.id, input.workDate);
      }),

    /** 休憩開始 */
    startBreak: protectedProcedure
      .input(z.object({ workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(({ ctx, input }) => {
        return db.startBreak(ctx.user.id, input.workDate);
      }),

    /** 休憩終了 */
    endBreak: protectedProcedure
      .input(z.object({ workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(({ ctx, input }) => {
        return db.endBreak(ctx.user.id, input.workDate);
      }),
  }),

  /** GPS位置情報API */
  location: router({
    /** GPS位置情報を記録（バックグラウンドタスクから呼ばれる） */
    record: protectedProcedure
      .input(
        z.object({
          latitude: z.number(),
          longitude: z.number(),
          accuracy: z.number().optional(),
          attendanceId: z.number().optional(),
          isBackground: z.boolean().default(false),
        })
      )
      .mutation(({ ctx, input }) => {
        return db.recordLocation({
          userId: ctx.user.id,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
          accuracy: input.accuracy !== undefined ? String(input.accuracy) : null,
          attendanceId: input.attendanceId ?? null,
          isBackground: input.isBackground,
          recordedAt: new Date(),
        });
      }),

    /** 今日の位置履歴を取得 */
    today: protectedProcedure
      .input(z.object({ workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(({ ctx, input }) => {
        return db.getTodayLocations(ctx.user.id, input.workDate);
      }),
  }),
});

export type AppRouter = typeof appRouter;
