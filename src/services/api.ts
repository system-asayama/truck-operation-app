/**
 * トラック運行管理アプリ - API通信サービス
 * 既存の client-management-app の /api/mobile エンドポイントと通信する
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  BASE_URL: 'base_url',
  TENANT_SLUG: 'tenant_slug',
  STAFF_TOKEN: 'staff_token',
  STAFF_ID: 'staff_id',
  STAFF_TYPE: 'staff_type',
  TENANT_ID: 'tenant_id',
  STAFF_NAME: 'staff_name',
  GPS_ENABLED: 'gps_enabled',
  GPS_INTERVAL_SECONDS: 'gps_interval_seconds',
};

export { STORAGE_KEYS };

// ─────────────────────────────────────────────
// ストレージ操作
// ─────────────────────────────────────────────

export async function saveAuthInfo(params: {
  baseUrl: string;
  tenantSlug: string;
  staffToken: string;
  staffId: number;
  staffType: string;
  tenantId: number;
  name: string;
  gpsEnabled: boolean;
  gpsIntervalSeconds: number;
}) {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.BASE_URL, params.baseUrl],
    [STORAGE_KEYS.TENANT_SLUG, params.tenantSlug],
    [STORAGE_KEYS.STAFF_TOKEN, params.staffToken],
    [STORAGE_KEYS.STAFF_ID, String(params.staffId)],
    [STORAGE_KEYS.STAFF_TYPE, params.staffType],
    [STORAGE_KEYS.TENANT_ID, String(params.tenantId)],
    [STORAGE_KEYS.STAFF_NAME, params.name],
    [STORAGE_KEYS.GPS_ENABLED, params.gpsEnabled ? '1' : '0'],
    [STORAGE_KEYS.GPS_INTERVAL_SECONDS, String(params.gpsIntervalSeconds)],
  ]);
}

export async function loadAuthInfo() {
  const keys = Object.values(STORAGE_KEYS);
  const pairs = await AsyncStorage.multiGet(keys);
  const map: Record<string, string | null> = {};
  pairs.forEach(([k, v]) => { map[k] = v; });
  return {
    baseUrl: map[STORAGE_KEYS.BASE_URL],
    tenantSlug: map[STORAGE_KEYS.TENANT_SLUG],
    staffToken: map[STORAGE_KEYS.STAFF_TOKEN],
    staffId: map[STORAGE_KEYS.STAFF_ID] ? Number(map[STORAGE_KEYS.STAFF_ID]) : null,
    staffType: map[STORAGE_KEYS.STAFF_TYPE],
    tenantId: map[STORAGE_KEYS.TENANT_ID] ? Number(map[STORAGE_KEYS.TENANT_ID]) : null,
    name: map[STORAGE_KEYS.STAFF_NAME],
    gpsEnabled: map[STORAGE_KEYS.GPS_ENABLED] === '1',
    gpsIntervalSeconds: map[STORAGE_KEYS.GPS_INTERVAL_SECONDS]
      ? Number(map[STORAGE_KEYS.GPS_INTERVAL_SECONDS])
      : 300,
  };
}

export async function clearAuthInfo() {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
}

// ─────────────────────────────────────────────
// HTTPクライアント
// ─────────────────────────────────────────────

async function getHeaders(): Promise<Record<string, string>> {
  const staffToken = await AsyncStorage.getItem(STORAGE_KEYS.STAFF_TOKEN);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Mobile-API-Key': process.env.EXPO_PUBLIC_MOBILE_API_KEY || 'truck-app-key',
  };
  if (staffToken) {
    headers['X-Staff-Token'] = staffToken;
  }
  return headers;
}

async function getBaseUrl(): Promise<string> {
  const url = await AsyncStorage.getItem(STORAGE_KEYS.BASE_URL);
  return url || '';
}

async function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: object
): Promise<T> {
  const baseUrl = await getBaseUrl();
  const headers = await getHeaders();
  const url = `${baseUrl}/api/mobile${path}`;

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();
  return data as T;
}

// ─────────────────────────────────────────────
// 認証 API
// ─────────────────────────────────────────────

export async function login(params: {
  baseUrl: string;
  loginId: string;
  password: string;
  tenantSlug: string;
}) {
  const url = `${params.baseUrl}/api/mobile/auth/login`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mobile-API-Key': process.env.EXPO_PUBLIC_MOBILE_API_KEY || 'truck-app-key',
    },
    body: JSON.stringify({
      login_id: params.loginId,
      password: params.password,
      tenant_slug: params.tenantSlug,
    }),
  });
  return response.json();
}

// ─────────────────────────────────────────────
// 勤怠（運行）API
// ─────────────────────────────────────────────

export async function getTodayAttendance() {
  return apiRequest<any>('/attendance/today', 'GET');
}

export async function clockIn() {
  return apiRequest<any>('/attendance/clock_in', 'POST');
}

export async function clockOut() {
  return apiRequest<any>('/attendance/clock_out', 'POST');
}

export async function breakStart() {
  return apiRequest<any>('/attendance/break_start', 'POST');
}

export async function breakEnd() {
  return apiRequest<any>('/attendance/break_end', 'POST');
}

// ─────────────────────────────────────────────
// GPS 位置情報 API
// ─────────────────────────────────────────────

export async function recordLocation(params: {
  latitude: number;
  longitude: number;
  accuracy?: number;
  attendanceId?: number;
  isBackground?: boolean;
  recordedAt?: string;
}) {
  return apiRequest<any>('/location/record', 'POST', {
    latitude: params.latitude,
    longitude: params.longitude,
    accuracy: params.accuracy,
    attendance_id: params.attendanceId,
    is_background: params.isBackground || false,
    recorded_at: params.recordedAt,
  });
}

export async function getTodayLocations() {
  return apiRequest<any>('/location/today', 'GET');
}

export async function getRealtimeMode() {
  return apiRequest<any>('/location/realtime_mode', 'GET');
}

// ─────────────────────────────────────────────
// 顔認証 API
// ─────────────────────────────────────────────

/** 顔写真の登録状況を確認する */
export async function getFaceStatus() {
  return apiRequest<{
    ok: boolean;
    registered: boolean;
    registered_at: string | null;
  }>('/face/status', 'GET');
}

/** 顔写真を登録する（初回セットアップ時） */
export async function registerFace(faceImageBase64: string) {
  return apiRequest<{
    ok: boolean;
    message: string;
  }>('/face/register', 'POST', {
    face_image_base64: faceImageBase64,
  });
}

/** 顔認証を実行する（出発打刻前の本人確認） */
export async function verifyFace(faceImageBase64: string) {
  return apiRequest<{
    ok: boolean;
    verified: boolean;
    confidence: number;
    message: string;
    needs_registration?: boolean;
    dev_mode?: boolean;
    fallback?: boolean;
  }>('/face/verify', 'POST', {
    face_image_base64: faceImageBase64,
  });
}
