import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform, Alert, AppState } from "react-native";
import { useEffect, useRef, useCallback, useState } from "react";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useGpsTracking } from "@/hooks/use-gps-tracking";
import {
  getFlaskStaffInfo,
  getFlaskTodayAttendance,
  flaskClockIn,
  flaskClockOut,
  flaskBreakStart,
  flaskBreakEnd,
  type FlaskStaffInfo,
  type FlaskAttendance,
} from "@/lib/flask-api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "@/lib/background-location-task";

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "--:--";
  // "HH:MM:SS" or ISO format
  const parts = timeStr.split("T");
  const timePart = parts.length > 1 ? parts[1] : parts[0];
  const [h, m] = timePart.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${y}年${m}月${d}日`;
}

export default function AttendanceScreen() {
  const colors = useColors();
  const today = getTodayDateString();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [flaskInfo, setFlaskInfo] = useState<FlaskStaffInfo | null>(null);
  const [attendance, setAttendance] = useState<FlaskAttendance | null>(null);

  const gps = useGpsTracking(attendance?.id ?? null);

  // 勤怠データを取得する
  const loadAttendance = useCallback(async (info?: FlaskStaffInfo | null) => {
    const staffInfo = info ?? flaskInfo;
    if (!staffInfo) return;
    const result = await getFlaskTodayAttendance(staffInfo);
    if (result.ok && result.attendance) {
      setAttendance(result.attendance);
    } else if (result.ok && !result.attendance) {
      setAttendance(null);
    }
  }, [flaskInfo]);

  // 初回ロード
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      const info = await getFlaskStaffInfo();
      if (cancelled) return;
      setFlaskInfo(info);
      if (info) {
        const result = await getFlaskTodayAttendance(info);
        if (!cancelled) {
          if (result.ok && result.attendance) {
            setAttendance(result.attendance);
          } else {
            setAttendance(null);
          }
        }
      }
      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // 30秒ごとに勤怠状態を更新
  useEffect(() => {
    if (!flaskInfo) return;
    const timer = setInterval(() => loadAttendance(), 30000);
    return () => clearInterval(timer);
  }, [flaskInfo, loadAttendance]);

  // GPS自動再開ロジック（出勤中なのにGPS停止中の場合）
  const autoResumeHandledRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!flaskInfo) return;
    if (Platform.OS === "web") return;
    if (autoResumeHandledRef.current) return;

    autoResumeHandledRef.current = true;

    const currentStatus = attendance?.status ?? "off";
    const gpsStatus = gps.status;

    if (currentStatus === "working") {
      if (gpsStatus !== "tracking") {
        console.log("[AutoResume] 出勤中を検知 → GPS追跡を自動再開");
        gps.startTracking();
      }
    } else if (currentStatus === "break") {
      if (gpsStatus === "tracking") {
        console.log("[AutoResume] 休憩中を検知 → GPS追跡を停止");
        gps.pauseTracking();
      }
    } else {
      if (gpsStatus === "tracking" || gpsStatus === "paused") {
        console.log("[AutoResume] 退勤済み/未出勤を検知 → GPS追跡を停止");
        gps.stopTracking();
      }
    }
  }, [loading, attendance?.id, attendance?.status, flaskInfo]);

  // attendance.id が変わったら再評価フラグをリセット
  useEffect(() => {
    autoResumeHandledRef.current = false;
  }, [attendance?.id]);

  // Flask APIポーリング（AppState復帰時）
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadAttendance();
      }
    });
    return () => subscription.remove();
  }, [loadAttendance]);

  const status = attendance?.status ?? "off";

  const handleClockIn = async () => {
    if (!flaskInfo) return;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setActionLoading(true);
    try {
      const mobileApiKey = (await AsyncStorage.getItem(STORAGE_KEYS.MOBILE_API_KEY)) ?? flaskInfo.mobileApiKey ?? "";
      const result = await flaskClockIn(flaskInfo, mobileApiKey);
      if (!result.ok) {
        Alert.alert("エラー", result.error ?? "出勤打刻に失敗しました");
        return;
      }
      // 出勤IDをAsyncStorageに保存
      if (result.attendanceId) {
        await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_ATTENDANCE_ID, String(result.attendanceId));
      }
      await loadAttendance();
      await gps.startTracking();
    } catch (err) {
      Alert.alert("エラー", "出勤打刻に失敗しました");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    Alert.alert("退勤確認", "退勤しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "退勤する",
        style: "destructive",
        onPress: async () => {
          if (!flaskInfo) return;
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          setActionLoading(true);
          try {
            await gps.stopTracking();
            const mobileApiKey = (await AsyncStorage.getItem(STORAGE_KEYS.MOBILE_API_KEY)) ?? flaskInfo.mobileApiKey ?? "";
            const result = await flaskClockOut(flaskInfo, mobileApiKey);
            if (!result.ok) {
              Alert.alert("エラー", result.error ?? "退勤打刻に失敗しました");
              return;
            }
            await loadAttendance();
          } catch (err) {
            Alert.alert("エラー", "退勤打刻に失敗しました");
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleStartBreak = async () => {
    if (!flaskInfo) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setActionLoading(true);
    try {
      await gps.pauseTracking();
      const mobileApiKey = (await AsyncStorage.getItem(STORAGE_KEYS.MOBILE_API_KEY)) ?? flaskInfo.mobileApiKey ?? "";
      const result = await flaskBreakStart(flaskInfo, mobileApiKey);
      if (!result.ok) {
        Alert.alert("エラー", result.error ?? "休憩開始に失敗しました");
        return;
      }
      await loadAttendance();
    } catch (err) {
      Alert.alert("エラー", "休憩開始に失敗しました");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndBreak = async () => {
    if (!flaskInfo) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setActionLoading(true);
    try {
      const mobileApiKey = (await AsyncStorage.getItem(STORAGE_KEYS.MOBILE_API_KEY)) ?? flaskInfo.mobileApiKey ?? "";
      const result = await flaskBreakEnd(flaskInfo, mobileApiKey);
      if (!result.ok) {
        Alert.alert("エラー", result.error ?? "休憩終了に失敗しました");
        return;
      }
      await loadAttendance();
      await gps.resumeTracking();
    } catch (err) {
      Alert.alert("エラー", "休憩終了に失敗しました");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.muted, fontSize: 16 }}>読み込み中...</Text>
      </ScreenContainer>
    );
  }

  if (!flaskInfo) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <Text style={{ color: colors.muted, fontSize: 16 }}>ログインが必要です</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8, textAlign: "center" }}>
          設定タブから顧問先管理アプリに接続してください
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* ヘッダー */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Text style={styles.headerTitle}>勤怠管理</Text>
          <Text style={styles.headerDate}>{formatDate(today)}</Text>
        </View>

        <View style={styles.content}>
          {/* 現在の状態 */}
          <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statusLabel, { color: colors.muted }]}>現在の状態</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusIndicator, {
                backgroundColor:
                  status === "working" ? colors.success + "20" :
                  status === "break" ? colors.warning + "20" :
                  status === "finished" ? colors.muted + "20" :
                  colors.border,
              }]}>
                <View style={[styles.statusDot, {
                  backgroundColor:
                    status === "working" ? colors.success :
                    status === "break" ? colors.warning :
                    status === "finished" ? colors.muted :
                    colors.border,
                }]} />
                <Text style={[styles.statusText, {
                  color:
                    status === "working" ? colors.success :
                    status === "break" ? colors.warning :
                    status === "finished" ? colors.muted :
                    colors.muted,
                }]}>
                  {status === "working" ? "出勤中" :
                   status === "break" ? "休憩中" :
                   status === "finished" ? "退勤済み" : "未出勤"}
                </Text>
              </View>
            </View>
          </View>

          {/* 打刻時間 */}
          <View style={[styles.timeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.timeRow}>
              <View style={styles.timeItem}>
                <View style={[styles.timeIconBg, { backgroundColor: colors.success + "15" }]}>
                  <IconSymbol name="clock.fill" size={22} color={colors.success} />
                </View>
                <Text style={[styles.timeLabel, { color: colors.muted }]}>出勤時刻</Text>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>
                  {formatTime(attendance?.clockIn)}
                </Text>
              </View>
              <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
              <View style={styles.timeItem}>
                <View style={[styles.timeIconBg, { backgroundColor: colors.warning + "15" }]}>
                  <IconSymbol name="pause.circle.fill" size={22} color={colors.warning} />
                </View>
                <Text style={[styles.timeLabel, { color: colors.muted }]}>休憩開始</Text>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>
                  {formatTime(attendance?.breakStart)}
                </Text>
              </View>
              <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
              <View style={styles.timeItem}>
                <View style={[styles.timeIconBg, { backgroundColor: colors.error + "15" }]}>
                  <IconSymbol name="xmark.circle.fill" size={22} color={colors.error} />
                </View>
                <Text style={[styles.timeLabel, { color: colors.muted }]}>退勤時刻</Text>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>
                  {formatTime(attendance?.clockOut)}
                </Text>
              </View>
            </View>
          </View>

          {/* アクションボタン */}
          <View style={styles.actionSection}>
            {/* 出勤ボタン */}
            {(status === "off") && (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.success }]}
                onPress={handleClockIn}
                disabled={actionLoading}
                activeOpacity={0.8}
              >
                <IconSymbol name="play.circle.fill" size={24} color="#ffffff" />
                <Text style={styles.primaryButtonText}>
                  {actionLoading ? "処理中..." : "出勤する"}
                </Text>
              </TouchableOpacity>
            )}

            {/* 休憩開始・退勤ボタン（出勤中） */}
            {status === "working" && (
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.secondaryButton, { backgroundColor: colors.warning + "15", borderColor: colors.warning }]}
                  onPress={handleStartBreak}
                  disabled={actionLoading}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="pause.circle.fill" size={22} color={colors.warning} />
                  <Text style={[styles.secondaryButtonText, { color: colors.warning }]}>
                    {actionLoading ? "処理中..." : "休憩開始"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryButton, { backgroundColor: colors.error + "15", borderColor: colors.error }]}
                  onPress={handleClockOut}
                  disabled={actionLoading}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="xmark.circle.fill" size={22} color={colors.error} />
                  <Text style={[styles.secondaryButtonText, { color: colors.error }]}>
                    {actionLoading ? "処理中..." : "退勤する"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 休憩終了ボタン（休憩中） */}
            {status === "break" && (
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                  onPress={handleEndBreak}
                  disabled={actionLoading}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="play.circle.fill" size={24} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>
                    {actionLoading ? "処理中..." : "休憩終了"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryButton, { backgroundColor: colors.error + "15", borderColor: colors.error }]}
                  onPress={handleClockOut}
                  disabled={actionLoading}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="xmark.circle.fill" size={22} color={colors.error} />
                  <Text style={[styles.secondaryButtonText, { color: colors.error }]}>
                    {actionLoading ? "処理中..." : "退勤する"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 退勤済みメッセージ */}
            {status === "finished" && (
              <View style={[styles.finishedBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <IconSymbol name="checkmark.circle.fill" size={32} color={colors.success} />
                <Text style={[styles.finishedText, { color: colors.foreground }]}>本日の勤務お疲れ様でした</Text>
              </View>
            )}
          </View>

          {/* GPS追跡状態 */}
          <View style={[styles.gpsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.gpsHeader}>
              <IconSymbol
                name={gps.status === "tracking" ? "location.fill" : "location.slash.fill"}
                size={18}
                color={gps.status === "tracking" ? colors.primary : colors.muted}
              />
              <Text style={[styles.gpsTitle, { color: colors.foreground }]}>GPS追跡</Text>
              <View style={[styles.gpsBadge, {
                backgroundColor:
                  gps.status === "tracking" ? colors.success + "20" :
                  gps.status === "paused" ? colors.warning + "20" :
                  gps.status === "unavailable" ? colors.border :
                  colors.border,
              }]}>
                <Text style={[styles.gpsBadgeText, {
                  color:
                    gps.status === "tracking" ? colors.success :
                    gps.status === "paused" ? colors.warning :
                    colors.muted,
                }]}>
                  {gps.status === "tracking" ? "追跡中" :
                   gps.status === "paused" ? "一時停止" :
                   gps.status === "unavailable" ? "非対応" :
                   gps.status === "error" ? "エラー" :
                   gps.status === "requesting" ? "権限確認中" : "停止中"}
                </Text>
              </View>
            </View>

            {gps.lastLocation && (
              <View style={[styles.locationInfo, { borderTopColor: colors.border }]}>
                <Text style={[styles.locationLabel, { color: colors.muted }]}>最終取得位置</Text>
                <Text style={[styles.locationValue, { color: colors.foreground }]}>
                  {gps.lastLocation.coords.latitude.toFixed(6)}, {gps.lastLocation.coords.longitude.toFixed(6)}
                </Text>
                {gps.lastLocation.coords.accuracy && (
                  <Text style={[styles.locationAccuracy, { color: colors.muted }]}>
                    精度: ±{Math.round(gps.lastLocation.coords.accuracy)}m
                  </Text>
                )}
              </View>
            )}

            {gps.errorMessage && (
              <Text style={[styles.gpsError, { color: colors.error }]}>{gps.errorMessage}</Text>
            )}

            <Text style={[styles.gpsNote, { color: colors.muted }]}>
              {Platform.OS === "web"
                ? "GPS追跡はモバイルアプリでのみ利用できます"
                : `出勤中は${flaskInfo.gpsIntervalSeconds ?? (flaskInfo.gpsIntervalMinutes * 60)}秒ごとに位置情報を自動記録します`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
  },
  headerDate: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: 4,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  statusCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  statusLabel: {
    fontSize: 13,
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: "row",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "700",
  },
  timeCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  timeIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timeLabel: {
    fontSize: 12,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  timeDivider: {
    width: 1,
    height: 60,
  },
  actionSection: {
    gap: 12,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  finishedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  finishedText: {
    fontSize: 16,
    fontWeight: "600",
  },
  gpsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  gpsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gpsTitle: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  gpsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  gpsBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  locationInfo: {
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 2,
  },
  locationLabel: {
    fontSize: 12,
  },
  locationValue: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  locationAccuracy: {
    fontSize: 12,
  },
  gpsError: {
    fontSize: 13,
  },
  gpsNote: {
    fontSize: 12,
    lineHeight: 18,
  },
});
