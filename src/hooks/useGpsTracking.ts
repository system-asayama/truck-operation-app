import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { recordLocation, getRealtimeMode } from '../services/api';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// バックグラウンドタスクの定義（モジュールレベルで定義する必要がある）
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('バックグラウンド位置情報エラー:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    for (const location of locations) {
      try {
        await recordLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          isBackground: true,
          recordedAt: new Date(location.timestamp).toISOString(),
        });
      } catch (e) {
        console.error('バックグラウンド位置記録エラー:', e);
      }
    }
  }
});

export function useGpsTracking(params: {
  enabled: boolean;
  intervalSeconds: number;
  attendanceId?: number;
}) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    timestamp: string;
  } | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // パーミッション確認
  const requestPermissions = useCallback(async () => {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      console.warn('フォアグラウンド位置情報の権限が拒否されました');
      return false;
    }
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('バックグラウンド位置情報の権限が拒否されました');
      // フォアグラウンドのみで動作
    }
    setPermissionGranted(true);
    return true;
  }, []);

  // 現在位置を取得して送信
  const sendCurrentLocation = useCallback(async (isBackground = false) => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude, accuracy } = location.coords;
      const recordedAt = new Date(location.timestamp).toISOString();

      setLastLocation({ latitude, longitude, accuracy, timestamp: recordedAt });

      await recordLocation({
        latitude,
        longitude,
        accuracy: accuracy ?? undefined,
        attendanceId: params.attendanceId,
        isBackground,
        recordedAt,
      });
    } catch (e) {
      console.error('位置情報送信エラー:', e);
    }
  }, [params.attendanceId]);

  // リアルタイムモードのポーリング
  const startRealtimePolling = useCallback(() => {
    if (realtimeIntervalRef.current) return;
    realtimeIntervalRef.current = setInterval(async () => {
      try {
        const result = await getRealtimeMode();
        if (result.ok && result.realtime_enabled) {
          // リアルタイムモード: 4秒間隔で送信
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          intervalRef.current = setInterval(() => sendCurrentLocation(false), 4000);
        } else {
          // 通常モード: 設定間隔で送信
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          intervalRef.current = setInterval(
            () => sendCurrentLocation(false),
            params.intervalSeconds * 1000
          );
        }
      } catch (e) {
        console.error('リアルタイムモード確認エラー:', e);
      }
    }, 10000); // 10秒ごとにポーリング
  }, [params.intervalSeconds, sendCurrentLocation]);

  // GPS追跡開始
  const startTracking = useCallback(async () => {
    if (!params.enabled) return;
    const granted = await requestPermissions();
    if (!granted) return;

    setIsTracking(true);

    // 即時に1回送信
    await sendCurrentLocation(false);

    // フォアグラウンド定期送信
    intervalRef.current = setInterval(
      () => sendCurrentLocation(false),
      params.intervalSeconds * 1000
    );

    // リアルタイムモードのポーリング開始
    startRealtimePolling();

    // バックグラウンド追跡の開始
    try {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: params.intervalSeconds * 1000,
        distanceInterval: 50, // 50m移動ごとに更新
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'トラック運行管理',
          notificationBody: 'GPS位置情報を記録中...',
          notificationColor: '#1a3a5c',
        },
      });
    } catch (e) {
      console.warn('バックグラウンド追跡の開始に失敗（フォアグラウンドのみで動作）:', e);
    }
  }, [params.enabled, params.intervalSeconds, requestPermissions, sendCurrentLocation, startRealtimePolling]);

  // GPS追跡停止
  const stopTracking = useCallback(async () => {
    setIsTracking(false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (realtimeIntervalRef.current) {
      clearInterval(realtimeIntervalRef.current);
      realtimeIntervalRef.current = null;
    }

    try {
      const hasTask = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (hasTask) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (e) {
      console.warn('バックグラウンド追跡の停止エラー:', e);
    }
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (realtimeIntervalRef.current) clearInterval(realtimeIntervalRef.current);
    };
  }, []);

  return {
    isTracking,
    lastLocation,
    permissionGranted,
    startTracking,
    stopTracking,
    sendCurrentLocation,
  };
}
