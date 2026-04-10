/**
 * トラック運行管理 管理者向けAPIクライアント
 * VPS: https://samurai-hub.com
 */

export const DEFAULT_API_URL = "https://samurai-hub.com";
export const DEFAULT_TENANT_SLUG = "zeioks";
export const DEFAULT_MOBILE_API_KEY = "truck-app-key";

export interface AdminInfo {
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

export interface Driver {
  id: number;
  name: string;
  loginId: string;
  staffType: string;
  active: number;
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
  driverName?: string;
}

export interface LocationRecord {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
  isBackground: boolean;
}

const STORAGE_KEY = "truck_admin_info";

export function getAdminInfo(): AdminInfo | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    return JSON.parse(json) as AdminInfo;
  } catch {
    return null;
  }
}

export function saveAdminInfo(info: AdminInfo): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
}

export function clearAdminInfo(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function apiRequest<T>(
  apiUrl: string,
  staffToken: string,
  mobileApiKey: string,
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const url = `${apiUrl.replace(/\/$/, "")}/api/mobile${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Mobile-API-Key": mobileApiKey,
        "X-Staff-Token": staffToken,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return { ok: false, error: (data.error as string) || `HTTP ${res.status}` };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "通信エラー" };
  }
}

export async function loginAdmin(params: {
  apiUrl: string;
  tenantSlug: string;
  mobileApiKey: string;
  loginId: string;
  password: string;
}): Promise<{ ok: boolean; info?: AdminInfo; error?: string }> {
  try {
    const url = `${params.apiUrl.replace(/\/$/, "")}/api/mobile/auth/login`;
    const res = await fetch(url, {
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
    const data = await res.json() as Record<string, unknown>;
    if (!data.ok) return { ok: false, error: (data.error as string) || "ログイン失敗" };
    const info: AdminInfo = {
      staffId: data.staff_id as number,
      staffType: data.staff_type as string,
      tenantId: data.tenant_id as number,
      name: data.name as string,
      staffToken: data.staff_token as string,
      apiUrl: params.apiUrl,
      tenantSlug: params.tenantSlug,
      mobileApiKey: params.mobileApiKey,
    };
    return { ok: true, info };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "通信エラー" };
  }
}

export async function getTrucks(info: AdminInfo): Promise<{ ok: boolean; trucks?: Truck[]; error?: string }> {
  const result = await apiRequest<{ trucks: unknown[] }>(info.apiUrl, info.staffToken, info.mobileApiKey, "/trucks", "GET");
  if (!result.ok) return { ok: false, error: result.error };
  const trucks = (result.data?.trucks ?? []).map((raw: unknown) => {
    const t = raw as Record<string, unknown>;
    return {
      id: t.id as number,
      truckNumber: (t.truck_number ?? t.truckNumber) as string,
      truckName: (t.truck_name ?? t.truckName) as string,
      capacity: (t.capacity ?? null) as string | null,
      status: (t.status ?? "available") as string,
    };
  });
  return { ok: true, trucks };
}

export async function getRoutes(info: AdminInfo): Promise<{ ok: boolean; routes?: Route[]; error?: string }> {
  const result = await apiRequest<{ routes: unknown[] }>(info.apiUrl, info.staffToken, info.mobileApiKey, "/routes", "GET");
  if (!result.ok) return { ok: false, error: result.error };
  const routes = (result.data?.routes ?? []).map((raw: unknown) => {
    const r = raw as Record<string, unknown>;
    return {
      id: r.id as number,
      routeName: (r.route_name ?? r.routeName) as string,
      description: (r.description ?? null) as string | null,
      estimatedMinutes: (r.estimated_minutes ?? r.estimatedMinutes ?? null) as number | null,
    };
  });
  return { ok: true, routes };
}

export async function getDrivers(info: AdminInfo): Promise<{ ok: boolean; drivers?: Driver[]; error?: string }> {
  const result = await apiRequest<{ drivers: unknown[] }>(info.apiUrl, info.staffToken, info.mobileApiKey, "/drivers", "GET");
  if (!result.ok) return { ok: false, error: result.error };
  const drivers = (result.data?.drivers ?? []).map((raw: unknown) => {
    const d = raw as Record<string, unknown>;
    return {
      id: d.id as number,
      name: d.name as string,
      loginId: (d.login_id ?? d.loginId) as string,
      staffType: (d.staff_type ?? d.staffType ?? "employee") as string,
      active: (d.active ?? 1) as number,
    };
  });
  return { ok: true, drivers };
}

export async function getTodayOperations(info: AdminInfo): Promise<{ ok: boolean; operations?: TruckOperation[]; error?: string }> {
  const result = await apiRequest<{ operations: unknown[] }>(info.apiUrl, info.staffToken, info.mobileApiKey, "/admin/operations/today", "GET");
  if (!result.ok) return { ok: false, error: result.error };
  const operations = (result.data?.operations ?? []).map((raw: unknown) => {
    const o = raw as Record<string, unknown>;
    return {
      id: o.id as number,
      truckId: (o.truck_id ?? o.truckId) as number,
      routeId: (o.route_id ?? o.routeId ?? null) as number | null,
      driverStaffId: (o.driver_staff_id ?? o.driverStaffId) as number,
      operationDate: (o.operation_date ?? o.operationDate) as string,
      startTime: (o.start_time ?? o.startTime ?? null) as string | null,
      endTime: (o.end_time ?? o.endTime ?? null) as string | null,
      status: o.status as string,
      truckNumber: (o.truck_number ?? o.truckNumber) as string | undefined,
      truckName: (o.truck_name ?? o.truckName) as string | undefined,
      routeName: (o.route_name ?? o.routeName) as string | undefined,
      driverName: (o.driver_name ?? o.driverName) as string | undefined,
    };
  });
  return { ok: true, operations };
}

export async function getOperationHistory(
  info: AdminInfo,
  params?: { year?: number; month?: number; driverId?: number; truckId?: number }
): Promise<{ ok: boolean; operations?: TruckOperation[]; error?: string }> {
  const query = new URLSearchParams();
  if (params?.year) query.set("year", String(params.year));
  if (params?.month) query.set("month", String(params.month));
  if (params?.driverId) query.set("driver_id", String(params.driverId));
  if (params?.truckId) query.set("truck_id", String(params.truckId));
  const qs = query.toString() ? `?${query.toString()}` : "";
  const result = await apiRequest<{ operations: unknown[] }>(info.apiUrl, info.staffToken, info.mobileApiKey, `/admin/operations/history${qs}`, "GET");
  if (!result.ok) return { ok: false, error: result.error };
  const operations = (result.data?.operations ?? []).map((raw: unknown) => {
    const o = raw as Record<string, unknown>;
    return {
      id: o.id as number,
      truckId: (o.truck_id ?? o.truckId) as number,
      routeId: (o.route_id ?? o.routeId ?? null) as number | null,
      driverStaffId: (o.driver_staff_id ?? o.driverStaffId) as number,
      operationDate: (o.operation_date ?? o.operationDate) as string,
      startTime: (o.start_time ?? o.startTime ?? null) as string | null,
      endTime: (o.end_time ?? o.endTime ?? null) as string | null,
      status: o.status as string,
      truckNumber: (o.truck_number ?? o.truckNumber) as string | undefined,
      truckName: (o.truck_name ?? o.truckName) as string | undefined,
      routeName: (o.route_name ?? o.routeName) as string | undefined,
      driverName: (o.driver_name ?? o.driverName) as string | undefined,
    };
  });
  return { ok: true, operations };
}

export async function getDriverLocations(
  info: AdminInfo,
  driverStaffId: number,
  operationId?: number
): Promise<{ ok: boolean; locations?: LocationRecord[]; error?: string }> {
  const query = operationId ? `?operation_id=${operationId}` : "";
  const result = await apiRequest<{ locations: unknown[] }>(
    info.apiUrl, info.staffToken, info.mobileApiKey,
    `/admin/locations/${driverStaffId}${query}`, "GET"
  );
  if (!result.ok) return { ok: false, error: result.error };
  const locations = (result.data?.locations ?? []).map((raw: unknown) => {
    const l = raw as Record<string, unknown>;
    return {
      id: l.id as number,
      latitude: l.latitude as number,
      longitude: l.longitude as number,
      accuracy: (l.accuracy ?? null) as number | null,
      recordedAt: (l.recorded_at ?? l.recordedAt) as string,
      isBackground: (l.is_background ?? l.isBackground ?? false) as boolean,
    };
  });
  return { ok: true, locations };
}

export function formatStatus(status: string): string {
  const map: Record<string, string> = {
    off: "未出発",
    driving: "運行中",
    break: "休憩中",
    loading: "荷積み中",
    unloading: "荷下ろし中",
    finished: "運行終了",
  };
  return map[status] ?? status;
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    off: "#6b7280",
    driving: "#16a34a",
    break: "#d97706",
    loading: "#2563eb",
    unloading: "#7c3aed",
    finished: "#dc2626",
  };
  return map[status] ?? "#6b7280";
}

export function calcDuration(start: string | null, end: string | null): string {
  if (!start) return "-";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const mins = Math.floor((e - s) / 60000);
  if (mins < 60) return `${mins}分`;
  return `${Math.floor(mins / 60)}時間${mins % 60}分`;
}
