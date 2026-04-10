import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useState, useEffect, useCallback } from "react";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getFlaskStaffInfo, type FlaskStaffInfo } from "@/lib/flask-api-client";

function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "--:--";
  const parts = timeStr.split("T");
  const timePart = parts.length > 1 ? parts[1] : parts[0];
  const [h, m] = timePart.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function calcWorkingHours(clockIn: string | null | undefined, clockOut: string | null | undefined): string {
  if (!clockIn || !clockOut) return "-";
  // Parse time strings (HH:MM:SS or ISO)
  const parseTime = (t: string) => {
    const parts = t.split("T");
    const timePart = parts.length > 1 ? parts[1] : parts[0];
    const [h, m, s] = timePart.split(":").map(Number);
    return h * 3600 + m * 60 + (s || 0);
  };
  const inSec = parseTime(clockIn);
  const outSec = parseTime(clockOut);
  const diffSec = outSec - inSec;
  if (diffSec <= 0) return "-";
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  return `${hours}h${minutes}m`;
}

function getStatusColor(status: string, colors: ReturnType<typeof useColors>): string {
  switch (status) {
    case "working": return colors.success;
    case "break": return colors.warning;
    case "finished": return colors.primary;
    default: return colors.muted;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "working": return "出勤中";
    case "break": return "休憩中";
    case "finished": return "退勤済";
    default: return "未出勤";
  }
}

function prevMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

interface FlaskMonthlyRecord {
  id: number;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  breakMinutes: number;
  status: string;
  note: string | null;
}

export default function HistoryScreen() {
  const colors = useColors();
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [loading, setLoading] = useState(true);
  const [flaskInfo, setFlaskInfo] = useState<FlaskStaffInfo | null>(null);
  const [records, setRecords] = useState<FlaskMonthlyRecord[]>([]);

  const [y, m] = yearMonth.split("-");
  const currentYearMonth = getCurrentYearMonth();
  const isCurrentMonth = yearMonth === currentYearMonth;

  // Flask接続情報を取得
  useEffect(() => {
    let cancelled = false;
    getFlaskStaffInfo().then((info) => {
      if (!cancelled) setFlaskInfo(info);
    });
    return () => { cancelled = true; };
  }, []);

  // 月次勤怠データを取得
  const loadMonthlyRecords = useCallback(async (info: FlaskStaffInfo | null, ym: string) => {
    if (!info) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const url = `${info.apiUrl.replace(/\/$/, "")}/api/mobile/attendance/monthly?year_month=${ym}`;
      const response = await fetch(url, {
        headers: {
          "X-Mobile-API-Key": info.mobileApiKey ?? "",
          "X-Staff-Token": info.staffToken,
        },
      });
      const json = await response.json();
      if (json.ok && Array.isArray(json.records)) {
        // snake_case → camelCase
        const mapped: FlaskMonthlyRecord[] = json.records.map((r: any) => ({
          id: r.id,
          workDate: r.work_date,
          clockIn: r.clock_in,
          clockOut: r.clock_out,
          breakStart: r.break_start,
          breakEnd: r.break_end,
          breakMinutes: r.break_minutes ?? 0,
          status: r.status,
          note: r.note,
        }));
        setRecords(mapped);
      } else {
        setRecords([]);
      }
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonthlyRecords(flaskInfo, yearMonth);
  }, [flaskInfo, yearMonth, loadMonthlyRecords]);

  if (!flaskInfo && !loading) {
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
      {/* ヘッダー */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Text style={styles.headerTitle}>勤怠履歴</Text>

        {/* 月切り替え */}
        <View style={styles.monthNav}>
          <TouchableOpacity
            style={styles.monthNavBtn}
            onPress={() => setYearMonth(prevMonth(yearMonth))}
            activeOpacity={0.7}
          >
            <IconSymbol name="chevron.left" size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{y}年{m}月</Text>
          <TouchableOpacity
            style={styles.monthNavBtn}
            onPress={() => setYearMonth(nextMonth(yearMonth))}
            disabled={isCurrentMonth}
            activeOpacity={0.7}
          >
            <IconSymbol name="chevron.right" size={20} color={isCurrentMonth ? "rgba(255,255,255,0.3)" : "#ffffff"} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {loading ? (
            <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>読み込み中...</Text>
          ) : records.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol name="calendar" size={48} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>この月の勤怠記録はありません</Text>
            </View>
          ) : (
            records.map((record) => (
              <View
                key={record.id}
                style={[styles.recordCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.recordHeader}>
                  <Text style={[styles.recordDate, { color: colors.foreground }]}>
                    {record.workDate}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(record.status, colors) + "15" }]}>
                    <Text style={[styles.statusBadgeText, { color: getStatusColor(record.status, colors) }]}>
                      {getStatusLabel(record.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.recordTimes}>
                  <View style={styles.recordTimeItem}>
                    <Text style={[styles.recordTimeLabel, { color: colors.muted }]}>出勤</Text>
                    <Text style={[styles.recordTimeValue, { color: colors.foreground }]}>
                      {formatTime(record.clockIn)}
                    </Text>
                  </View>
                  <View style={[styles.recordTimeDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.recordTimeItem}>
                    <Text style={[styles.recordTimeLabel, { color: colors.muted }]}>退勤</Text>
                    <Text style={[styles.recordTimeValue, { color: colors.foreground }]}>
                      {formatTime(record.clockOut)}
                    </Text>
                  </View>
                  <View style={[styles.recordTimeDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.recordTimeItem}>
                    <Text style={[styles.recordTimeLabel, { color: colors.muted }]}>勤務時間</Text>
                    <Text style={[styles.recordTimeValue, { color: colors.primary }]}>
                      {calcWorkingHours(record.clockIn, record.clockOut)}
                    </Text>
                  </View>
                </View>

                {record.breakMinutes > 0 && (
                  <Text style={[styles.breakInfo, { color: colors.muted }]}>
                    休憩: {record.breakMinutes}分
                  </Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  monthNavBtn: {
    padding: 4,
  },
  monthLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    minWidth: 80,
    textAlign: "center",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  recordCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  recordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recordDate: {
    fontSize: 15,
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  recordTimes: {
    flexDirection: "row",
    alignItems: "center",
  },
  recordTimeItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  recordTimeLabel: {
    fontSize: 12,
  },
  recordTimeValue: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  recordTimeDivider: {
    width: 1,
    height: 36,
  },
  breakInfo: {
    fontSize: 12,
    textAlign: "right",
  },
});
