/**
 * バックグラウンドGPS追跡タスク
 * このファイルはアプリのエントリーポイント（app/_layout.tsx）でインポートして
 * タスクを登録する必要があります。
 *
 * 重要: TaskManager.defineTask はグローバルスコープで呼び出す必要があります。
 *
 * バックグラウンドタスクからFlask APIに直接位置データを送信します。
 * 送信失敗時はAsyncStorageにフォールバック保存します。
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

export const BACKGROUND_LOCATION_TASK = "background-location-task";

/** バックグラウンドタスクが利用可能かどうか */
export const isBackgroundTaskAvailable = Platform.OS !== "web";

/** AsyncStorageのキー */
export const STORAGE_KEYS = {
  FLASK_STAFF_INFO: "flask_staff_info",
  MOBILE_API_KEY: "mobileApiKey",
  PENDING_LOCATIONS: "pendingLocations",
  CURRENT_ATTENDANCE_ID: "currentAttendanceId",
} as const;

/**
 * Flask APIに位置情報を直接送信する（バックグラウンドタスク用）
 * fetch APIを使用してHTTPリクエストを送信します。
 */
async function sendLocationToFlask(params: {
  apiUrl: string;
  staffToken: string;
  mobileApiKey: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  attendanceId: number | null;
}): Promise<boolean> {
  try {
    const url = `${params.apiUrl.replace(/\/$/, "")}/api/mobile/location/record`;
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
        attendance_id: params.attendanceId,
        is_background: true,
      }),
    });

    const json = await response.json();
    return response.ok && json.ok;
  } catch (err) {
    console.error("[BackgroundLocation] API送信エラー:", err);
    return false;
  }
}

/**
 * バックグラウンドGPS追跡タスクの定義
 * 位置情報を取得してFlask APIに直接送信する
 * 送信失敗時はAsyncStorageに保存してフォアグラウンド復帰時に再送信
 */
if (isBackgroundTaskAvailable) {
  TaskManager.defineTask(
    BACKGROUND_LOCATION_TASK,
    async ({
      data,
      error,
    }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
      if (error) {
        console.error("[BackgroundLocation] タスクエラー:", error.message);
        return;
      }

      if (!data || !data.locations || data.locations.length === 0) {
        return;
      }

      const location = data.locations[data.locations.length - 1];
      console.log("[BackgroundLocation] 新しい位置情報:", {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });

      try {
        const AsyncStorage = (
          await import("@react-native-async-storage/async-storage")
        ).default;

        // 保存済みのFlask接続情報を取得
        const staffInfoJson = await AsyncStorage.getItem(STORAGE_KEYS.FLASK_STAFF_INFO);
        const attendanceIdStr = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_ATTENDANCE_ID);
        const attendanceId = attendanceIdStr ? parseInt(attendanceIdStr, 10) : null;

        if (staffInfoJson) {
          const staffInfo = JSON.parse(staffInfoJson) as {
            staffId: number;
            staffToken: string;
            apiUrl: string;
            tenantId: number;
            name: string;
            mobileApiKey?: string;
          };

          // mobileApiKeyは"mobileApiKey"キーから取得、なければflask_staff_infoの中から取得
          let mobileApiKey = (await AsyncStorage.getItem(STORAGE_KEYS.MOBILE_API_KEY)) ?? "";
          if (!mobileApiKey && staffInfo.mobileApiKey) {
            mobileApiKey = staffInfo.mobileApiKey;
            // 次回のために保存しておく
            await AsyncStorage.setItem(STORAGE_KEYS.MOBILE_API_KEY, mobileApiKey);
            console.log("[BackgroundLocation] mobileApiKeyをflask_staff_infoから復元して保存");
          }

          if (!mobileApiKey) {
            console.warn("[BackgroundLocation] mobileApiKeyが取得できません");
          } else {
            console.log(`[BackgroundLocation] mobileApiKey取得OK len=${mobileApiKey.length}`);
          }

          // Flask APIに直接送信
          const success = await sendLocationToFlask({
            apiUrl: staffInfo.apiUrl,
            staffToken: staffInfo.staffToken,
            mobileApiKey,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            attendanceId,
          });

          if (success) {
            console.log("[BackgroundLocation] Flask APIへの送信成功");
            return;
          } else {
            console.warn("[BackgroundLocation] Flask API送信失敗、AsyncStorageに保存");
          }
        } else {
          console.warn("[BackgroundLocation] Flask接続情報なし、AsyncStorageに保存");
        }

        // 送信失敗時またはFlask情報がない場合はAsyncStorageに保存
        const pending = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_LOCATIONS);
        const pendingLocations: Array<{
          latitude: number;
          longitude: number;
          accuracy: number | null;
          recordedAt: string;
          isBackground: boolean;
          attendanceId: number | null;
        }> = pending ? JSON.parse(pending) : [];

        pendingLocations.push({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          recordedAt: new Date(location.timestamp).toISOString(),
          isBackground: true,
          attendanceId,
        });

        // 最大200件まで保持
        const trimmed = pendingLocations.slice(-200);
        await AsyncStorage.setItem(STORAGE_KEYS.PENDING_LOCATIONS, JSON.stringify(trimmed));
        console.log(`[BackgroundLocation] AsyncStorageに保存（合計${trimmed.length}件）`);
      } catch (storageError) {
        console.error("[BackgroundLocation] ストレージエラー:", storageError);
      }
    }
  );
}
