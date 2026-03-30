import { useState, useEffect, useCallback } from 'react';
import { loadAuthInfo, clearAuthInfo, saveAuthInfo, login as apiLogin } from '../services/api';
import { AuthState } from '../types';

const initialState: AuthState = {
  staffToken: null,
  staffId: null,
  staffType: null,
  tenantId: null,
  name: null,
  gpsEnabled: false,
  gpsIntervalSeconds: 300,
  baseUrl: null,
  tenantSlug: null,
};

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(initialState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const info = await loadAuthInfo();
        if (info.staffToken) {
          setAuth({
            staffToken: info.staffToken,
            staffId: info.staffId,
            staffType: info.staffType,
            tenantId: info.tenantId,
            name: info.name,
            gpsEnabled: info.gpsEnabled,
            gpsIntervalSeconds: info.gpsIntervalSeconds,
            baseUrl: info.baseUrl,
            tenantSlug: info.tenantSlug,
          });
        }
      } catch (e) {
        console.error('認証情報の読み込みに失敗:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (params: {
    baseUrl: string;
    loginId: string;
    password: string;
    tenantSlug: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const result = await apiLogin(params);
      if (result.ok) {
        const intervalSeconds = result.gps_interval_seconds ||
          (result.gps_interval_minutes || 5) * 60;
        await saveAuthInfo({
          baseUrl: params.baseUrl,
          tenantSlug: params.tenantSlug,
          staffToken: result.staff_token,
          staffId: result.staff_id,
          staffType: result.staff_type,
          tenantId: result.tenant_id,
          name: result.name,
          gpsEnabled: result.gps_enabled || false,
          gpsIntervalSeconds: intervalSeconds,
        });
        setAuth({
          staffToken: result.staff_token,
          staffId: result.staff_id,
          staffType: result.staff_type,
          tenantId: result.tenant_id,
          name: result.name,
          gpsEnabled: result.gps_enabled || false,
          gpsIntervalSeconds: intervalSeconds,
          baseUrl: params.baseUrl,
          tenantSlug: params.tenantSlug,
        });
        return { ok: true };
      } else {
        return { ok: false, error: result.error || 'ログインに失敗しました' };
      }
    } catch (e: any) {
      return { ok: false, error: 'サーバーに接続できません: ' + (e?.message || '') };
    }
  }, []);

  const logout = useCallback(async () => {
    await clearAuthInfo();
    setAuth(initialState);
  }, []);

  return { auth, loading, login, logout };
}
