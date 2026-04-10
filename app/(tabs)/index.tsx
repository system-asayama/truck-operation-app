import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useEffect, useState } from "react";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getFlaskStaffInfo, getFlaskTodayAttendance, type FlaskStaffInfo, type FlaskAttendance } from "@/lib/flask-api-client";

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

function getStatusLabel(status: string | null | undefined): { label: string; color: string } {
  switch (status) {
    case "working":
      return { label: "出勤中", color: "#16a34a" };
    case "break":
      return { label: "休憩中", color: "#d97706" };
    case "finished":
      return { label: "退勤済み", color: "#64748b" };
    default:
      return { label: "未出勤", color: "#94a3b8" };
  }
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const today = getTodayDateString();

  const [loading, setLoading] = useState(true);
  const [flaskInfo, setFlaskInfo] = useState<FlaskStaffInfo | null>(null);
  const [attendance, setAttendance] = useState<FlaskAttendance | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const info = await getFlaskStaffInfo();
      if (cancelled) return;
      setFlaskInfo(info);
      if (info) {
        const result = await getFlaskTodayAttendance(info);
        if (!cancelled && result.ok && result.attendance) {
          setAttendance(result.attendance);
        }
      }
      setLoading(false);
    };
    load();
    // 30秒ごとに勤怠状態を更新
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const statusInfo = getStatusLabel(attendance?.status);

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
        <View style={styles.loginCard}>
          <View style={[styles.logoContainer, { backgroundColor: colors.primary + "15" }]}>
            <IconSymbol name="person.circle.fill" size={64} color={colors.primary} />
          </View>
          <Text style={[styles.appTitle, { color: colors.foreground }]}>スタッフ勤怠GPS</Text>
          <Text style={[styles.appSubtitle, { color: colors.muted }]}>
            税理士事務所スタッフ向け{"\n"}勤怠管理・GPS追跡アプリ
          </Text>
          <TouchableOpacity
            style={[styles.loginButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(tabs)/settings" as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.loginButtonText}>設定画面でログイン</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* ヘッダー */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View>
            <Text style={styles.headerGreeting}>おはようございます</Text>
            <Text style={styles.headerName}>{flaskInfo.name} さん</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
            <Text style={styles.statusBadgeText}>{statusInfo.label}</Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* 今日の勤怠カード */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>本日の勤怠</Text>
            <Text style={[styles.cardDate, { color: colors.muted }]}>{today}</Text>

            <View style={styles.timeRow}>
              <View style={styles.timeItem}>
                <IconSymbol name="clock.fill" size={20} color={colors.success} />
                <Text style={[styles.timeLabel, { color: colors.muted }]}>出勤</Text>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>
                  {formatTime(attendance?.clockIn)}
                </Text>
              </View>
              <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
              <View style={styles.timeItem}>
                <IconSymbol name="pause.circle.fill" size={20} color={colors.warning} />
                <Text style={[styles.timeLabel, { color: colors.muted }]}>休憩</Text>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>
                  {formatTime(attendance?.breakStart)}
                </Text>
              </View>
              <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
              <View style={styles.timeItem}>
                <IconSymbol name="xmark.circle.fill" size={20} color={colors.error} />
                <Text style={[styles.timeLabel, { color: colors.muted }]}>退勤</Text>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>
                  {formatTime(attendance?.clockOut)}
                </Text>
              </View>
            </View>
          </View>

          {/* クイックアクション */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>クイックアクション</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push("/(tabs)/attendance" as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.primary + "15" }]}>
                <IconSymbol name="clock.fill" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>勤怠管理</Text>
              <Text style={[styles.quickActionSub, { color: colors.muted }]}>出退勤・休憩</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push("/(tabs)/history" as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.success + "15" }]}>
                <IconSymbol name="calendar" size={28} color={colors.success} />
              </View>
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>勤怠履歴</Text>
              <Text style={[styles.quickActionSub, { color: colors.muted }]}>月次記録</Text>
            </TouchableOpacity>
          </View>

          {/* GPS状態 */}
          <View style={[styles.gpsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.gpsCardHeader}>
              <IconSymbol name="location.fill" size={20} color={colors.primary} />
              <Text style={[styles.gpsCardTitle, { color: colors.foreground }]}>GPS追跡状態</Text>
            </View>
            <Text style={[styles.gpsCardDesc, { color: colors.muted }]}>
              出勤中は{flaskInfo.gpsIntervalSeconds ?? (flaskInfo.gpsIntervalMinutes * 60)}秒ごとに位置情報を自動記録します。{"\n"}
              休憩中は追跡が一時停止されます。
            </Text>
            <View style={[styles.gpsStatusRow, { borderTopColor: colors.border }]}>
              <View style={[styles.gpsStatusDot, {
                backgroundColor: attendance?.status === "working" ? colors.success :
                  attendance?.status === "break" ? colors.warning : colors.muted
              }]} />
              <Text style={[styles.gpsStatusText, { color: colors.muted }]}>
                {attendance?.status === "working" ? "追跡中" :
                  attendance?.status === "break" ? "一時停止中（休憩）" : "停止中"}
              </Text>
            </View>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerGreeting: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "500",
  },
  headerName: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  cardDate: {
    fontSize: 13,
    marginBottom: 16,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  timeDivider: {
    width: 1,
    height: 40,
  },
  timeLabel: {
    fontSize: 12,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
  },
  quickActionCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  quickActionSub: {
    fontSize: 12,
  },
  gpsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  gpsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gpsCardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  gpsCardDesc: {
    fontSize: 13,
    lineHeight: 20,
  },
  gpsStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    marginTop: 4,
  },
  gpsStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gpsStatusText: {
    fontSize: 13,
  },
  loginCard: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    gap: 16,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  loginButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
});
