// ─────────────────────────────────────────────
// 認証・スタッフ関連
// ─────────────────────────────────────────────

export interface AuthState {
  staffToken: string | null;
  staffId: number | null;
  staffType: string | null;
  tenantId: number | null;
  name: string | null;
  gpsEnabled: boolean;
  gpsIntervalSeconds: number;
  baseUrl: string | null;
  tenantSlug: string | null;
}

export interface LoginResponse {
  ok: boolean;
  staff_token?: string;
  staff_id?: number;
  staff_type?: string;
  tenant_id?: number;
  name?: string;
  gps_enabled?: boolean;
  gps_interval_minutes?: number;
  gps_interval_seconds?: number;
  error?: string;
}

// ─────────────────────────────────────────────
// 運行（勤怠）関連
// ─────────────────────────────────────────────

export type AttendanceStatus =
  | 'not_started'   // 運行前
  | 'working'       // 運行中
  | 'on_break'      // 休憩中
  | 'finished';     // 運行終了

export interface AttendanceRecord {
  id: number | null;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  breakMinutes: number;
  status: AttendanceStatus;
  note: string | null;
}

export interface AttendanceTodayResponse {
  ok: boolean;
  attendance?: {
    id: number;
    work_date: string;
    clock_in: string | null;
    clock_out: string | null;
    break_start: string | null;
    break_end: string | null;
    break_minutes: number;
    status: string;
    note: string | null;
  };
  error?: string;
}

// ─────────────────────────────────────────────
// GPS・位置情報関連
// ─────────────────────────────────────────────

export interface LocationRecord {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  isBackground: boolean;
  recordedAt: string;
}

export interface LocationTodayResponse {
  ok: boolean;
  locations?: Array<{
    id: number;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    is_background: boolean;
    recorded_at: string;
  }>;
  count?: number;
  error?: string;
}

// ─────────────────────────────────────────────
// ナビゲーション関連
// ─────────────────────────────────────────────

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Operation: undefined;
  History: undefined;
  Settings: undefined;
};
