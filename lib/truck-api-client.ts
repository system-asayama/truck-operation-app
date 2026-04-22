/**
 * トラック運行管理アプリ（Flask）モバイルAPI クライアント
 * 
 * 認証: X-Mobile-API-Key ヘッダー + X-Staff-Token ヘッダー
 * サーバー: https://samurai-hub.com
 * テナント: zeioks
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const TRUCK_STORAGE_KEYS = {
  DRIVER_INFO: "truck_driver_info",
  CURRENT_OPERATION_ID: "truck_current_operation_id",
  PENDING_LOCATIONS: "truck_pending_locations",
  MOBILE_API_KEY: "truck_mobile_api_key",
  SAVED_API_URL: "truck_saved_api_url",
  SAVED_TENANT_SLUG: "truck_saved_tenant_slug",
} as const;

// デフォルト設定
export const DEFAULT_API_URL = "https://dev.samurai-hub.com";
export const DEFAULT_TENANT_SLUG = "zeioks";
export const DEFAULT_MOBILE_API_KEY = "truck-app-key";

export interface TruckDriverInfo {
  staffId: number;
  staffType: string;
  tenantId: number;
  name: string;
  staffToken: string;
  apiUrl: string;
  tenantSlug: string;
  mobileApiKey: string;
}

export interface Truck {
  id: number;
  truckNumber: string;
  truckName: string;
  capacity: string | null;
  status: string;
}

export interface Route {
  id: number;
  routeName: string;
  description: string | null;
  estimatedMinutes: number | null;
}

export interface TruckOperation {
  id: number;
  truckId: number;
  routeId: number | null;
  driverStaffId: number;
  operationDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  truckNumber?: string;
  truckName?: string;
  routeName?: string;
}

export type OperationStatus =
  | "off"
  | "driving"
  | "break"
  | "loading"
  | "unloading"
  | "finished";

/**
 * 保存済みのドライバー情報を取得する
 */
export async function getTruckDriverInfo(): Promise<TruckDriverInfo | null> {
  try {
    const json = await AsyncStorage.getItem(TRUCK_STORAGE_KEYS.DRIVER_INFO);
    if (!json) return null;
    return JSON.parse(json) as TruckDriverInfo;
  } catch {
    return null;
  }
}

/**
 * ドライバー情報を保存する
 */
export async function saveTruckDriverInfo(info: TruckDriverInfo): Promise<void> {
  await AsyncStorage.setItem(TRUCK_STORAGE_KEYS.DRIVER_INFO, JSON.stringify(info));
}

/**
 * ドライバー情報を削除する（ログアウト）
 */
export async function clearTruckDriverInfo(): Promise<void> {
  await AsyncStorage.removeItem(TRUCK_STORAGE_KEYS.DRIVER_INFO);
  await AsyncStorage.removeItem(TRUCK_STORAGE_KEYS.CURRENT_OPERATION_ID);
  // SAVED_API_URL / SAVED_TENANT_SLUG はログアウト後も保持する
}

/**
 * 保存済みのサーバー設定を取得する（ログアウト後も保持）
 */
export async function getSavedServerSettings(): Promise<{ apiUrl: string; tenantSlug: string }> {
  const apiUrl = await AsyncStorage.getItem(TRUCK_STORAGE_KEYS.SAVED_API_URL);
  const tenantSlug = await AsyncStorage.getItem(TRUCK_STORAGE_KEYS.SAVED_TENANT_SLUG);
  return {
    apiUrl: apiUrl ?? DEFAULT_API_URL,
    tenantSlug: tenantSlug ?? DEFAULT_TENANT_SLUG,
  };
}

/**
 * サーバー設定を保存する（ログアウト後も保持）
 */
export async function saveServerSettings(apiUrl: string, tenantSlug: string): Promise<void> {
  await AsyncStorage.setItem(TRUCK_STORAGE_KEYS.SAVED_API_URL, apiUrl);
  await AsyncStorage.setItem(TRUCK_STORAGE_KEYS.SAVED_TENANT_SLUG, tenantSlug);
}

/**
 * Flask APIにリクエストを送信する
 */
async function truckApiRequest<T>(
  apiUrl: string,
  staffToken: string,
  mobileApiKey: string,
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const url = `${apiUrl.replace(/\/$/, "")}/truck/api/mobile${path}`;
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
 * ログイン
 */
export async function loginTruckDriver(params: {
  apiUrl: string;
  mobileApiKey: string;
  tenantSlug: string;
  loginId: string;
  password: string;
}): Promise<{ ok: boolean; driverInfo?: TruckDriverInfo; error?: string }> {
  try {
    const url = `${params.apiUrl.replace(/\/$/, "")}/truck/api/mobile/auth/login`;
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
    const driverInfo: TruckDriverInfo = {
      staffId: json.staff_id,
      staffType: json.staff_type,
      tenantId: json.tenant_id,
      name: json.name,
      staffToken: json.staff_token,
      apiUrl: params.apiUrl,
      tenantSlug: params.tenantSlug,
      mobileApiKey: params.mobileApiKey,
    };
    await saveTruckDriverInfo(driverInfo);
    return { ok: true, driverInfo };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/**
 * トラック一覧を取得する
 */
export async function getTrucks(info: TruckDriverInfo): Promise<{
  ok: boolean;
  trucks?: Truck[];
  error?: string;
}> {
  const result = await truckApiRequest<{ trucks: unknown[] }>(
    info.apiUrl,
    info.staffToken,
    info.mobileApiKey,
    "/trucks",
    "GET"
  );
  if (!result.ok) return { ok: false, error: result.error };
  const trucks = (result.data?.trucks ?? []).map((raw: unknown) => { const t = raw as Record<string, unknown>; return {
    id: t.id as number,
    truckNumber: (t.truck_number ?? t.truckNumber) as string,
    truckName: (t.truck_name ?? t.truckName) as string,
    capacity: (t.capacity ?? null) as string | null,
    status: (t.status ?? "available") as string,
  }; });
  return { ok: true, trucks };
}

/**
 * ルート一覧を取得する
 */
export async function getRoutes(info: TruckDriverInfo): Promise<{
  ok: boolean;
  routes?: Route[];
  error?: string;
}> {
  const result = await truckApiRequest<{ routes: unknown[] }>(
    info.apiUrl,
    info.staffToken,
    info.mobileApiKey,
    "/routes",
    "GET"
  );
  if (!result.ok) return { ok: false, error: result.error };
  const routes = (result.data?.routes ?? []).map((raw: unknown) => { const r = raw as Record<string, unknown>; return {
    id: r.id as number,
    routeName: (r.route_name ?? r.routeName) as string,
    description: (r.description ?? null) as string | null,
    estimatedMinutes: (r.estimated_minutes ?? r.estimatedMinutes ?? null) as number | null,
  }; });
  return { ok: true, routes };
}

/**
 * 本日の運行記録を取得する
 */
export async function getTodayOperation(info: TruckDriverInfo): Promise<{
  ok: boolean;
  operation?: TruckOperation | null;
  error?: string;
}> {
  const result = await truckApiRequest<{ operation: unknown }>(
    info.apiUrl,
    info.staffToken,
    info.mobileApiKey,
    "/operation/today",
    "GET"
  );
  if (!result.ok) return { ok: false, error: result.error };
  const rawOp = result.data?.operation;
  if (!rawOp) return { ok: true, operation: null };
  const op = rawOp as Record<string, unknown>;
  const operation: TruckOperation = {
    id: op.id as number,
    truckId: (op.truck_id ?? op.truckId) as number,
    routeId: (op.route_id ?? op.routeId ?? null) as number | null,
    driverStaffId: (op.driver_staff_id ?? op.driverStaffId) as number,
    operationDate: (op.operation_date ?? op.operationDate) as string,
    startTime: (op.start_time ?? op.startTime ?? null) as string | null,
    endTime: (op.end_time ?? op.endTime ?? null) as string | null,
    status: op.status as string,
    truckNumber: (op.truck_number ?? op.truckNumber) as string | undefined,
    truckName: (op.truck_name ?? op.truckName) as string | undefined,
    routeName: (op.route_name ?? op.routeName) as string | undefined,
  };
  return { ok: true, operation };
}

/**
 * 運行開始
 */
export async function startOperation(
  info: TruckDriverInfo,
  params: { truckId: number; routeId?: number }
): Promise<{ ok: boolean; operationId?: number; error?: string }> {
  const result = await truckApiRequest<{ operation_id: number }>(
    info.apiUrl,
    info.staffToken,
    info.mobileApiKey,
    "/operation/start",
    "POST",
    { truck_id: params.truckId, route_id: params.routeId ?? null }
  );
  if (!result.ok) return { ok: false, error: result.error };
  const operationId = result.data?.operation_id;
  if (operationId) {
    await AsyncStorage.setItem(TRUCK_STORAGE_KEYS.CURRENT_OPERATION_ID, String(operationId));
  }
  return { ok: true, operationId };
}

/**
 * ステータス更新（休憩開始/終了・荷積み開始/完了・荷下ろし開始/完了・運行終了）
 */
export async function updateOperationStatus(
  info: TruckDriverInfo,
  params: { operationId: number; status: OperationStatus }
): Promise<{ ok: boolean; error?: string }> {
  const result = await truckApiRequest<Record<string, unknown>>(
    info.apiUrl,
    info.staffToken,
    info.mobileApiKey,
    "/operation/status",
    "POST",
    { operation_id: params.operationId, status: params.status }
  );
  return { ok: result.ok, error: result.error };
}

/**
 * GPS位置情報を記録する
 */
export async function recordTruckLocation(
  info: TruckDriverInfo,
  params: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    operationId?: number;
    isBackground?: boolean;
    recordedAt?: string;
  }
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const result = await truckApiRequest<{ id: number }>(
    info.apiUrl,
    info.staffToken,
    info.mobileApiKey,
    "/location/record",
    "POST",
    {
      latitude: params.latitude,
      longitude: params.longitude,
      accuracy: params.accuracy,
      operation_id: params.operationId,
      is_background: params.isBackground ?? false,
      recorded_at: params.recordedAt ?? null,
    }
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.data?.id };
}

/**
 * 運行履歴を取得する
 */
export async function getOperationHistory(
  info: TruckDriverInfo,
  params?: { year?: number; month?: number }
): Promise<{ ok: boolean; operations?: TruckOperation[]; error?: string }> {
  const query = params ? `?year=${params.year}&month=${params.month}` : "";
  const result = await truckApiRequest<{ operations: TruckOperation[] }>(
    info.apiUrl,
    info.staffToken,
    info.mobileApiKey,
    `/operation/history${query}`,
    "GET"
  );
  if (!result.ok) return { ok: false, error: result.error };
  const operations = ((result.data?.operations ?? []) as unknown as Record<string, unknown>[]).map((op: Record<string, unknown>) => ({
    id: op.id as number,
    truckId: (op.truck_id ?? op.truckId) as number,
    routeId: (op.route_id ?? op.routeId ?? null) as number | null,
    driverStaffId: (op.driver_staff_id ?? op.driverStaffId) as number,
    operationDate: (op.operation_date ?? op.operationDate) as string,
    startTime: (op.start_time ?? op.startTime ?? null) as string | null,
    endTime: (op.end_time ?? op.endTime ?? null) as string | null,
    status: op.status as string,
    truckNumber: (op.truck_number ?? op.truckNumber) as string | undefined,
    truckName: (op.truck_name ?? op.truckName) as string | undefined,
    routeName: (op.route_name ?? op.routeName) as string | undefined,
  }));
  return { ok: true, operations };
}
