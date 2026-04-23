/**
 * トラック運行管理アプリ バックグラウンドGPS追跡タスク
 * 
 * expo-task-managerを使用してバックグラウンドでGPS位置情報を取得し、
 * Flask APIに直接HTTPリクエストを送信します。
 */
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { Platform } from "react-native";

export const BACKGROUND_LOCATION_TASK = "truck-background-location";

export const STORAGE_KEYS = {
  DRIVER_INFO: "truck_driver_info",
  CURRENT_OPERATION_ID: "truck_current_operation_id",
  CURRENT_STATUS: "truck_current_status",
  PENDING_LOCATIONS: "truck_pending_locations",
  MOBILE_API_KEY: "truck_mobile_api_key",
  GPS_SENT_COUNT: "truck_gps_sent_count",
} as const;

// バックグラウンドタスクがネイティブで利用可能かどうか
export const isBackgroundTaskAvailable = Platform.OS !== "web";

/**
 * Flask APIにGPS位置情報を直接送信する
 */
async function sendLocationToFlask(params: {
  apiUrl: string;
  staffToken: string;
  mobileApiKey: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  operationId: number | null;
  status: string | null;
}): Promise<boolean> {
  try {
    const url = `${params.apiUrl.replace(/\/$/, "")}/truck/api/mobile/location/record`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mobile-API-Key": params.mobileApiKey,
        "X-Staff-Token": params.staffToken,
      },
      body: JSON.stringify({
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy: params.accuracy,
        operation_id: params.operationId,
        status: params.status,
        is_background: true,
      }),
    });
    const json = await response.json();
    return response.ok && json.ok;
  } catch (err) {
    console.error("[TruckBackgroundLocation] API送信エラー:", err);
    return false;
  }
}

/**
 * バックグラウンドGPS追跡タスクの定義
 */
if (isBackgroundTaskAvailable) {
  TaskManager.defineTask(
    BACKGROUND_LOCATION_TASK,
    async ({
      data,
      error,
    }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
      if (error) {
        console.error("[TruckBackgroundLocation] タスクエラー:", error.message);
        return;
      }
      if (!data || !data.locations || data.locations.length === 0) {
        return;
      }
      const location = data.locations[data.locations.length - 1];
      console.log("[TruckBackgroundLocation] 新しい位置情報:", {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });

      try {
        const AsyncStorage = (
          await import("@react-native-async-storage/async-storage")
        ).default;

        // 保存済みのドライバー情報を取得
        const driverInfoJson = await AsyncStorage.getItem(STORAGE_KEYS.DRIVER_INFO);
        const operationIdStr = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_OPERATION_ID);
        const operationId = operationIdStr ? parseInt(operationIdStr, 10) : null;
        const currentStatus = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_STATUS);

        if (driverInfoJson) {
          const driverInfo = JSON.parse(driverInfoJson) as {
            staffId: number;
            staffToken: string;
            apiUrl: string;
            tenantId: number;
            name: string;
            mobileApiKey?: string;
          };

          // mobileApiKeyを取得
          let mobileApiKey = (await AsyncStorage.getItem(STORAGE_KEYS.MOBILE_API_KEY)) ?? "";
          if (!mobileApiKey && driverInfo.mobileApiKey) {
            mobileApiKey = driverInfo.mobileApiKey;
            await AsyncStorage.setItem(STORAGE_KEYS.MOBILE_API_KEY, mobileApiKey);
            console.log("[TruckBackgroundLocation] mobileApiKeyをdriverInfoから復元して保存");
          }

          if (!mobileApiKey) {
            console.warn("[TruckBackgroundLocation] mobileApiKeyが取得できません");
          } else {
            // Flask APIに直接送信
            const success = await sendLocationToFlask({
              apiUrl: driverInfo.apiUrl,
              staffToken: driverInfo.staffToken,
              mobileApiKey,
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
              operationId,
              status: currentStatus,
            });

            if (success) {
              console.log("[TruckBackgroundLocation] Flask APIへの送信成功");
              // 送信件数をカウントアップ
              const countStr = await AsyncStorage.getItem(STORAGE_KEYS.GPS_SENT_COUNT);
              const count = countStr ? parseInt(countStr, 10) : 0;
              await AsyncStorage.setItem(STORAGE_KEYS.GPS_SENT_COUNT, String(count + 1));
              return;
            } else {
              console.warn("[TruckBackgroundLocation] Flask API送信失敗、AsyncStorageに保存");
            }
          }
        } else {
          console.warn("[TruckBackgroundLocation] ドライバー情報なし、AsyncStorageに保存");
        }

        // 送信失敗時はAsyncStorageに保存
        const pending = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_LOCATIONS);
        const pendingLocations: Array<{
          latitude: number;
          longitude: number;
          accuracy: number | null;
          recordedAt: string;
          isBackground: boolean;
          operationId: number | null;
          status: string | null;
        }> = pending ? JSON.parse(pending) : [];

        pendingLocations.push({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          recordedAt: new Date(location.timestamp).toISOString(),
          isBackground: true,
          operationId,
          status: currentStatus,
        });

        // 最大200件まで保持
        const trimmed = pendingLocations.slice(-200);
        await AsyncStorage.setItem(STORAGE_KEYS.PENDING_LOCATIONS, JSON.stringify(trimmed));
        console.log(`[TruckBackgroundLocation] AsyncStorageに保存（合計${trimmed.length}件）`);
      } catch (storageError) {
        console.error("[TruckBackgroundLocation] ストレージエラー:", storageError);
      }
    }
  );
}
