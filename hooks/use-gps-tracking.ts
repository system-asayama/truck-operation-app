/**
 * GPS追跡カスタムフック
 * 出勤中のバックグラウンドGPS追跡を管理する
 * 顧問先管理アプリ（Flask）のAPIに位置情報を送信する
 *
 * 2モード対応:
 *   - 通常モード: テナント設定の間隔（デフォルト5分）で位置送信
 *   - リアルタイムモード: 管理者が地図画面でONにした場合、4秒ごとに位置送信
 *
 * バックグラウンドタスクはFlask APIに直接送信（アプリが閉じていても動作）
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  BACKGROUND_LOCATION_TASK,
  isBackgroundTaskAvailable,
  STORAGE_KEYS,
} from "@/lib/background-location-task";
import {
  flaskRecordLocation,
  getFlaskStaffInfo,
  saveFlaskStaffInfo,
  getFlaskRealtimeMode,
} from "@/lib/flask-api-client";

export type GpsStatus =
  | "idle"
  | "requesting"
  | "tracking"
  | "paused"
  | "error"
  | "unavailable";

export interface GpsTrackingState {
  status: GpsStatus;
  lastLocation: Location.LocationObject | null;
  errorMessage: string | null;
  permissionGranted: boolean;
  isRealtimeMode: boolean;
}

const DEFAULT_TRACKING_INTERVAL_MS = 5 * 60 * 1000; // 通常: 5分
const REALTIME_TRACKING_INTERVAL_MS = 4 * 1000; // リアルタイム: 4秒
const REALTIME_POLL_INTERVAL_MS = 10 * 1000; // リアルタイムフラグ確認: 10秒ごと

/**
 * GPS間隔（ms）に応じた最適なaccuracyを返す。
 * Androidはaccuracyによって最小間隔が制限されるため、
 * 短い間隔の場合はHighest/BestForNavigationを使用する必要がある。
 */
function getAccuracyForInterval(intervalMs: number): Location.Accuracy {
  if (intervalMs <= 1000) return Location.Accuracy.BestForNavigation; // ~500ms対応
  if (intervalMs <= 5000) return Location.Accuracy.Highest;           // ~1000ms対応
  if (intervalMs <= 30000) return Location.Accuracy.High;             // ~2000ms対応
  return Location.Accuracy.Balanced;                                   // 3000ms以上
}

export function useGpsTracking(attendanceId?: number | null) {
  const [state, setState] = useState<GpsTrackingState>({
    status: "idle",
    lastLocation: null,
    errorMessage: null,
    permissionGranted: false,
    isRealtimeMode: false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackingIntervalMs = useRef<number>(DEFAULT_TRACKING_INTERVAL_MS);
  const isRealtimeModeRef = useRef<boolean>(false);
  const isTrackingRef = useRef<boolean>(false);

  // Web環境では追跡不可
  if (Platform.OS === "web") {
    return {
      ...state,
      status: "unavailable" as GpsStatus,
      startTracking: async () => {},
      stopTracking: async () => {},
      pauseTracking: async () => {},
      resumeTracking: async () => {},
      requestPermissions: async () => false,
    };
  }

  /** 位置情報権限をリクエスト */
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, status: "requesting" }));

      const { status: fgStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== "granted") {
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: "位置情報の権限が許可されていません",
          permissionGranted: false,
        }));
        return false;
      }

      if (isBackgroundTaskAvailable) {
        const { status: bgStatus } =
          await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== "granted") {
          console.warn(
            "[GPS] バックグラウンド権限が許可されていません（フォアグラウンドのみ）"
          );
        }
      }

      setState((prev) => ({ ...prev, permissionGranted: true, status: "idle" }));
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: "権限リクエスト中にエラーが発生しました",
      }));
      return false;
    }
  }, []);

  /** 現在位置を取得してFlask APIに送信 */
  const sendCurrentLocation = useCallback(async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setState((prev) => ({ ...prev, lastLocation: location }));

      // Flask APIに送信
      const staffInfo = await getFlaskStaffInfo();
      if (staffInfo) {
        const mobileApiKey =
          (await AsyncStorage.getItem(STORAGE_KEYS.MOBILE_API_KEY)) ?? "";
        await flaskRecordLocation(staffInfo, mobileApiKey, {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? undefined,
          attendanceId: attendanceId ?? undefined,
          isBackground: false,
        });
        console.log(
          "[GPS] 位置情報送信:",
          location.coords.latitude,
          location.coords.longitude,
          isRealtimeModeRef.current ? "(リアルタイム)" : "(通常)"
        );
      } else {
        console.warn("[GPS] Flask接続情報なし、位置情報を送信できません");
      }
    } catch (err) {
      console.error("[GPS] 位置情報送信エラー:", err);
    }
  }, [attendanceId]);

  /** バックグラウンドに保存された位置情報をFlask APIに送信 */
  const flushPendingLocations = useCallback(async () => {
    try {
      const pending = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_LOCATIONS);
      if (!pending) return;

      const locations: Array<{
        latitude: number;
        longitude: number;
        accuracy: number | null;
        recordedAt: string;
        isBackground: boolean;
        attendanceId: number | null;
      }> = JSON.parse(pending);

      if (locations.length === 0) return;

      const staffInfo = await getFlaskStaffInfo();
      if (!staffInfo) return;
      const mobileApiKey =
        (await AsyncStorage.getItem(STORAGE_KEYS.MOBILE_API_KEY)) ?? "";

      let successCount = 0;
      for (const loc of locations) {
        try {
          await flaskRecordLocation(staffInfo, mobileApiKey, {
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy: loc.accuracy ?? undefined,
            attendanceId: loc.attendanceId ?? attendanceId ?? undefined,
            isBackground: true,
            // 実際に位置を取得した時刻を送信（オフライン中の正確な時刻を保持する）
            recordedAt: loc.recordedAt,
          });
          successCount++;
        } catch (err) {
          console.error("[GPS] バックグラウンドデータ送信エラー:", err);
        }
      }

      await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_LOCATIONS);
      console.log(
        `[GPS] バックグラウンドデータ送信完了: ${successCount}/${locations.length}件`
      );
    } catch (err) {
      console.error("[GPS] バックグラウンドデータ送信エラー:", err);
    }
  }, [attendanceId]);

  /**
   * 送信インターバルを切り替える（リアルタイム↔通常）
   * フォアグラウンドのsetIntervalとバックグラウンドタスクの両方を新しい間隔で再起動する
   */
  const switchInterval = useCallback(
    async (realtimeMode: boolean) => {
      if (!isTrackingRef.current) return;

      const newInterval = realtimeMode
        ? REALTIME_TRACKING_INTERVAL_MS
        : trackingIntervalMs.current;

      // フォアグラウンドのインターバルを切り替え
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      intervalRef.current = setInterval(sendCurrentLocation, newInterval);
      isRealtimeModeRef.current = realtimeMode;
      setState((prev) => ({ ...prev, isRealtimeMode: realtimeMode }));

      console.log(
        `[GPS] モード切替: ${realtimeMode ? "リアルタイム" : "通常"}（${newInterval / 1000}秒間隔）`
      );

      // バックグラウンドタスクも新しい間隔で再起動する
      if (isBackgroundTaskAvailable) {
        try {
          const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          if (isRunning) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          }
          const isAvailable = await Location.isBackgroundLocationAvailableAsync();
          if (isAvailable) {
            const switchAccuracy = getAccuracyForInterval(newInterval);
            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
              accuracy: switchAccuracy,
              timeInterval: newInterval,
              distanceInterval: 0,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: realtimeMode ? "勤怠GPS追跡中（リアルタイム）" : "勤怠GPS追跡中",
                notificationBody: realtimeMode ? "リアルタイムで位置情報を記録しています" : "出勤中の位置情報を記録しています",
                notificationColor: realtimeMode ? "#e53935" : "#1a56db",
              },
            });
            console.log(`[GPS] バックグラウンドタスク再起動（${newInterval / 1000}秒間隔）`);
          }
        } catch (err) {
          console.warn("[GPS] バックグラウンドタスク再起動エラー:", err);
        }
      }
    },
    [sendCurrentLocation]
  );

  /** リアルタイムモードフラグをサーバーから確認して切り替える */
  const checkRealtimeMode = useCallback(async () => {
    try {
      const staffInfo = await getFlaskStaffInfo();
      if (!staffInfo) return;
      const mobileApiKey =
        (await AsyncStorage.getItem(STORAGE_KEYS.MOBILE_API_KEY)) ?? "";
      const result = await getFlaskRealtimeMode(staffInfo, mobileApiKey);
      if (!result.ok) return;

      const serverRealtime = result.realtimeEnabled ?? false;
      if (serverRealtime !== isRealtimeModeRef.current) {
        switchInterval(serverRealtime);
      }
    } catch (err) {
      console.warn("[GPS] リアルタイムモード確認エラー:", err);
    }
  }, [switchInterval]);

  /** GPS追跡を開始 */
  const startTracking = useCallback(async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    // テナントのGPS間隔設定を取得
    const staffInfo = await getFlaskStaffInfo();
    if (staffInfo) {
      // gpsIntervalSecondsを優先、なければgpsIntervalMinutesから計算
      const intervalSec = staffInfo.gpsIntervalSeconds ?? ((staffInfo.gpsIntervalMinutes || 5) * 60);
      trackingIntervalMs.current = intervalSec * 1000;
      console.log(`[GPS] 間隔設定: ${intervalSec}秒 (${intervalSec * 1000}ms)`);
      // バックグラウンドタスクが確実に読み取れるよう最新のstaffInfoをAsyncStorageに再保存
      await saveFlaskStaffInfo(staffInfo);
      console.log("[GPS] staffInfo再保存完了（バックグラウンドタスク用）");
    } else {
      console.warn("[GPS] staffInfoが見つかりません。設定画面でログインしてください。");
    }

    // 出勤IDをAsyncStorageに保存（バックグラウンドタスクで参照するため）
    if (attendanceId != null) {
      await AsyncStorage.setItem(
        STORAGE_KEYS.CURRENT_ATTENDANCE_ID,
        String(attendanceId)
      );
      console.log("[GPS] 出勤ID保存:", attendanceId);
    }

    // バックグラウンド追跡を開始
    if (isBackgroundTaskAvailable) {
      try {
        const isAvailable = await Location.isBackgroundLocationAvailableAsync();
        if (isAvailable) {
          const isAlreadyRunning =
            await Location.hasStartedLocationUpdatesAsync(
              BACKGROUND_LOCATION_TASK
            );
          if (!isAlreadyRunning) {
            const accuracy = getAccuracyForInterval(trackingIntervalMs.current);
            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
              accuracy,
              timeInterval: trackingIntervalMs.current,
              distanceInterval: 0,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: "勤怠GPS追跡中",
                notificationBody: "出勤中の位置情報を記録しています",
                notificationColor: "#1a56db",
              },
            });
            console.log(`[GPS] バックグラウンド追跡開始 (accuracy=${accuracy}, interval=${trackingIntervalMs.current}ms)`);
          } else {
            console.log("[GPS] バックグラウンド追跡は既に動作中");
          }
        } else {
          console.warn("[GPS] バックグラウンド位置情報は利用不可");
        }
      } catch (err) {
        console.warn("[GPS] バックグラウンド追跡開始エラー:", err);
      }
    }

    isTrackingRef.current = true;

    // 初回位置送信
    await sendCurrentLocation();

    // リアルタイムモードを確認してから適切な間隔でインターバル開始
    await checkRealtimeMode();
    if (!intervalRef.current) {
      // checkRealtimeModeでセットされなかった場合（通常モード）
      intervalRef.current = setInterval(
        sendCurrentLocation,
        trackingIntervalMs.current
      );
    }

    // リアルタイムモードフラグを定期確認（10秒ごと）
    realtimePollRef.current = setInterval(
      checkRealtimeMode,
      REALTIME_POLL_INTERVAL_MS
    );

    // バックグラウンドに保存された位置情報を送信
    await flushPendingLocations();

    setState((prev) => ({ ...prev, status: "tracking", errorMessage: null }));
  }, [
    requestPermissions,
    sendCurrentLocation,
    checkRealtimeMode,
    flushPendingLocations,
    attendanceId,
  ]);

  /** GPS追跡を停止 */
  const stopTracking = useCallback(async () => {
    isTrackingRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (realtimePollRef.current) {
      clearInterval(realtimePollRef.current);
      realtimePollRef.current = null;
    }

    // バックグラウンドタスクを停止
    if (isBackgroundTaskAvailable) {
      try {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK
        );
        if (isRunning) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          console.log("[GPS] バックグラウンド追跡停止");
        }
      } catch (err) {
        console.warn("[GPS] バックグラウンド追跡停止エラー:", err);
      }
    }

    // 出勤IDをクリア
    await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_ATTENDANCE_ID);

    isRealtimeModeRef.current = false;
    setState((prev) => ({
      ...prev,
      status: "idle",
      lastLocation: null,
      isRealtimeMode: false,
    }));
  }, []);

  /** GPS追跡を一時停止（休憩中） */
  const pauseTracking = useCallback(async () => {
    isTrackingRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (realtimePollRef.current) {
      clearInterval(realtimePollRef.current);
      realtimePollRef.current = null;
    }

    // バックグラウンドタスクも一時停止
    if (isBackgroundTaskAvailable) {
      try {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK
        );
        if (isRunning) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          console.log("[GPS] バックグラウンド追跡一時停止");
        }
      } catch (err) {
        console.warn("[GPS] バックグラウンド追跡一時停止エラー:", err);
      }
    }

    setState((prev) => ({ ...prev, status: "paused", isRealtimeMode: false }));
  }, []);

  /** GPS追跡を再開（休憩終了後） */
  const resumeTracking = useCallback(async () => {
    await startTracking();
  }, [startTracking]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (realtimePollRef.current) {
        clearInterval(realtimePollRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    requestPermissions,
  };
}
