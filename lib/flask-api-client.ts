/**
 * 顧問先管理アプリ（Flask）モバイルAPI クライアント
 * 
 * Expoアプリから顧問先管理アプリのFlask APIに接続するためのクライアント。
 * 認証: X-Mobile-API-Key ヘッダー + X-Staff-Token ヘッダー
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  FLASK_API_URL: "flask_api_url",
  FLASK_STAFF_TOKEN: "flask_staff_token",
  FLASK_STAFF_INFO: "flask_staff_info",
  FLASK_TENANT_SLUG: "flask_tenant_slug",
} as const;

export interface FlaskStaffInfo {
  staffId: number;
  staffType: string;
  tenantId: number;
  name: string;
  gpsEnabled: boolean;
  gpsIntervalMinutes: number;
  gpsIntervalSeconds: number;
  staffToken: string;
  apiUrl: string;
  tenantSlug: string;
  mobileApiKey: string;
}

export interface FlaskAttendance {
  id: number;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  breakMinutes: number;
  status: string;
  note: string | null;
}

/**
 * 保存済みのFlask接続情報を取得する
 */
export async function getFlaskStaffInfo(): Promise<FlaskStaffInfo | null> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEYS.FLASK_STAFF_INFO);
    if (!json) return null;
    return JSON.parse(json) as FlaskStaffInfo;
  } catch {
    return null;
  }
}

/**
 * Flask接続情報を保存する
 */
export async function saveFlaskStaffInfo(info: FlaskStaffInfo): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.FLASK_STAFF_INFO, JSON.stringify(info));
}

/**
 * Flask接続情報を削除する（ログアウト）
 */
export async function clearFlaskStaffInfo(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.FLASK_STAFF_INFO);
}

/**
 * Flask APIにリクエストを送信する
 */
async function flaskRequest<T>(
  apiUrl: string,
  staffToken: string,
  mobileApiKey: string,
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const url = `${apiUrl.replace(/\/$/, "")}/api/mobile${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Mobile-API-Key": mobileApiKey,
      "X-Staff-Token": staffToken,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await response.json();
    if (!response.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${response.status}` };
    }
    return { ok: true, data: json as T };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/**
 * 顧問先管理アプリにログインする
 */
export async function loginToFlask(params: {
  apiUrl: string;
  mobileApiKey: string;
  loginId: string;
  password: string;
  tenantSlug: string;
}): Promise<{ ok: boolean; staffInfo?: FlaskStaffInfo; error?: string }> {
  try {
    const url = `${params.apiUrl.replace(/\/$/, "")}/api/mobile/auth/login`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mobile-API-Key": params.mobileApiKey,
      },
      body: JSON.stringify({
        login_id: params.loginId,
        password: params.password,
        tenant_slug: params.tenantSlug,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${response.status}` };
    }

    const gpsIntervalMinutes = json.gps_interval_minutes ?? 5;
    const gpsIntervalSeconds = json.gps_interval_seconds ?? (gpsIntervalMinutes * 60);
    const staffInfo: FlaskStaffInfo = {
      staffId: json.staff_id,
      staffType: json.staff_type,
      tenantId: json.tenant_id,
      name: json.name,
      gpsEnabled: json.gps_enabled,
      gpsIntervalMinutes: gpsIntervalMinutes,
      gpsIntervalSeconds: gpsIntervalSeconds,
      staffToken: json.staff_token,
      apiUrl: params.apiUrl,
      tenantSlug: params.tenantSlug,
      mobileApiKey: params.mobileApiKey,
    };

    await saveFlaskStaffInfo(staffInfo);
    return { ok: true, staffInfo };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/**
 * 今日の勤怠状態を取得する
 */
export async function getFlaskTodayAttendance(info: FlaskStaffInfo): Promise<{
  ok: boolean;
  attendance?: FlaskAttendance | null;
  error?: string;
}> {
  const result = await flaskRequest<{ attendance: FlaskAttendance | null }>(
    info.apiUrl,
    info.staffToken,
    info.mobileApiKey ?? "",
    "/attendance/today",
    "GET"
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, attendance: result.data?.attendance ?? null };
}

/**
 * 出勤打刻
 */
export async function flaskClockIn(info: FlaskStaffInfo, mobileApiKey: string): Promise<{
  ok: boolean;
  attendanceId?: number;
  clockIn?: string;
  error?: string;
}> {
  const result = await flaskRequest<{ attendance_id: number; clock_in: string }>(
    info.apiUrl,
    info.staffToken,
    mobileApiKey,
    "/attendance/clock_in",
    "POST"
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, attendanceId: result.data?.attendance_id, clockIn: result.data?.clock_in };
}

/**
 * 退勤打刻
 */
export async function flaskClockOut(info: FlaskStaffInfo, mobileApiKey: string): Promise<{
  ok: boolean;
  clockOut?: string;
  error?: string;
}> {
  const result = await flaskRequest<{ clock_out: string }>(
    info.apiUrl,
    info.staffToken,
    mobileApiKey,
    "/attendance/clock_out",
    "POST"
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, clockOut: result.data?.clock_out };
}

/**
 * 休憩開始
 */
export async function flaskBreakStart(info: FlaskStaffInfo, mobileApiKey: string): Promise<{
  ok: boolean;
  breakStart?: string;
  error?: string;
}> {
  const result = await flaskRequest<{ break_start: string }>(
    info.apiUrl,
    info.staffToken,
    mobileApiKey,
    "/attendance/break_start",
    "POST"
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, breakStart: result.data?.break_start };
}

/**
 * 休憩終了
 */
export async function flaskBreakEnd(info: FlaskStaffInfo, mobileApiKey: string): Promise<{
  ok: boolean;
  breakEnd?: string;
  breakMinutes?: number;
  error?: string;
}> {
  const result = await flaskRequest<{ break_end: string; break_minutes: number }>(
    info.apiUrl,
    info.staffToken,
    mobileApiKey,
    "/attendance/break_end",
    "POST"
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, breakEnd: result.data?.break_end, breakMinutes: result.data?.break_minutes };
}

/**
 * リアルタイムモードフラグを取得する（管理者が地図画面でONにしているか）
 */
export async function getFlaskRealtimeMode(
  info: FlaskStaffInfo,
  mobileApiKey: string
): Promise<{ ok: boolean; realtimeEnabled?: boolean; error?: string }> {
  const result = await flaskRequest<{ realtime_enabled: boolean }>(
    info.apiUrl,
    info.staffToken,
    mobileApiKey,
    "/location/realtime_mode",
    "GET"
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, realtimeEnabled: result.data?.realtime_enabled ?? false };
}

/**
 * GPS位置情報を記録する
 */
export async function flaskRecordLocation(
  info: FlaskStaffInfo,
  mobileApiKey: string,
  params: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    attendanceId?: number;
    isBackground?: boolean;
    /** 実際に位置を取得した時刻（ISO 8601形式）。未指定の場合はFlask側で現在時刻を使用する */
    recordedAt?: string;
  }
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const result = await flaskRequest<{ id: number }>(
    info.apiUrl,
    info.staffToken,
    mobileApiKey,
    "/location/record",
    "POST",
    {
      latitude: params.latitude,
      longitude: params.longitude,
      accuracy: params.accuracy,
      attendance_id: params.attendanceId,
      is_background: params.isBackground ?? false,
      recorded_at: params.recordedAt ?? null,
    }
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.data?.id };
}
