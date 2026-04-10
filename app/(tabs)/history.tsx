/**
 * トラック運行管理 - 運行履歴画面
 */
import React, { useState, useCallback } from "react";
import {
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  getTruckDriverInfo,
  getOperationHistory,
  type TruckOperation,
} from "@/lib/truck-api-client";

const STATUS_LABELS: Record<string, string> = {
  off: "待機中",
  driving: "運行中",
  break: "休憩中",
  loading: "荷積み中",
  unloading: "荷下ろし中",
  finished: "運行完了",
};

const STATUS_COLORS: Record<string, string> = {
  off: "#64748b",
  driving: "#16a34a",
  break: "#d97706",
  loading: "#2563eb",
  unloading: "#7c3aed",
  finished: "#64748b",
};

export default function HistoryScreen() {
  const colors = useColors();
  const [operations, setOperations] = useState<TruckOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasDriver, setHasDriver] = useState(false);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const info = await getTruckDriverInfo();
    if (!info) {
      setHasDriver(false);
      setLoading(false);
      return;
    }
    setHasDriver(true);
    const result = await getOperationHistory(info, { year: selectedYear, month: selectedMonth });
    if (result.ok && result.operations) {
      setOperations(result.operations);
    } else {
      setOperations([]);
    }
    setLoading(false);
  }, [selectedYear, selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "--:--";
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return `${d.getMonth() + 1}/${d.getDate()}（${days[d.getDay()]}）`;
  };

  const calcDuration = (startTime: string | null, endTime: string | null) => {
    if (!startTime || !endTime) return null;
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return null;
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
  };

  const prevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(y => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    const n = new Date();
    if (selectedYear > n.getFullYear() || (selectedYear === n.getFullYear() && selectedMonth >= n.getMonth() + 1)) return;
    if (selectedMonth === 12) {
      setSelectedYear(y => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

  if (!hasDriver && !loading) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <IconSymbol name="doc.text.fill" size={48} color={colors.muted} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>履歴がありません</Text>
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          設定画面でログインしてください
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Text style={styles.headerTitle}>運行履歴</Text>
      </View>

      <View style={[styles.monthSelector, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.monthArrow} onPress={prevMonth}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: colors.foreground }]}>
          {selectedYear}年{selectedMonth}月
        </Text>
        <TouchableOpacity
          style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}
          onPress={nextMonth}
          disabled={isCurrentMonth}
        >
          <IconSymbol name="chevron.right" size={20} color={isCurrentMonth ? colors.border : colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>読み込み中...</Text>
        </View>
      ) : operations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol name="doc.text" size={48} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>運行記録なし</Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {selectedYear}年{selectedMonth}月の運行記録はありません
          </Text>
        </View>
      ) : (
        <FlatList
          data={operations}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const statusColor = STATUS_COLORS[item.status] ?? colors.muted;
            const statusLabel = STATUS_LABELS[item.status] ?? item.status;
            const duration = calcDuration(item.startTime, item.endTime);

            return (
              <View style={[styles.operationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={styles.cardDateContainer}>
                    <Text style={[styles.cardDate, { color: colors.foreground }]}>
                      {formatDate(item.operationDate)}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <View style={styles.infoItem}>
                      <IconSymbol name="truck.box.fill" size={16} color={colors.muted} />
                      <Text style={[styles.infoLabel, { color: colors.muted }]}>トラック</Text>
                    </View>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>
                      {item.truckName ?? "---"} ({item.truckNumber ?? "---"})
                    </Text>
                  </View>

                  {item.routeName ? (
                    <View style={styles.infoRow}>
                      <View style={styles.infoItem}>
                        <IconSymbol name="road.lanes" size={16} color={colors.muted} />
                        <Text style={[styles.infoLabel, { color: colors.muted }]}>ルート</Text>
                      </View>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{item.routeName}</Text>
                    </View>
                  ) : null}

                  <View style={[styles.timeRow, { borderTopColor: colors.border }]}>
                    <View style={styles.timeItem}>
                      <Text style={[styles.timeLabel, { color: colors.muted }]}>開始</Text>
                      <Text style={[styles.timeValue, { color: colors.foreground }]}>
                        {formatTime(item.startTime)}
                      </Text>
                    </View>
                    <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.timeItem}>
                      <Text style={[styles.timeLabel, { color: colors.muted }]}>終了</Text>
                      <Text style={[styles.timeValue, { color: colors.foreground }]}>
                        {formatTime(item.endTime)}
                      </Text>
                    </View>
                    {duration ? (
                      <>
                        <View style={[styles.timeDivider, { backgroundColor: colors.border }]} />
                        <View style={styles.timeItem}>
                          <Text style={[styles.timeLabel, { color: colors.muted }]}>運行時間</Text>
                          <Text style={[styles.timeValue, { color: colors.primary }]}>{duration}</Text>
                        </View>
                      </>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  headerTitle: { color: "#ffffff", fontSize: 22, fontWeight: "700" },
  monthSelector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  monthArrow: { padding: 8 },
  monthArrowDisabled: { opacity: 0.3 },
  monthText: { fontSize: 16, fontWeight: "600" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 15 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  listContent: { padding: 16, gap: 12, paddingBottom: 32 },
  operationCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTop: { padding: 14, paddingBottom: 10 },
  cardDateContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardDate: { fontSize: 16, fontWeight: "700" },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: "600" },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "600" },
  timeRow: { flexDirection: "row", alignItems: "center", paddingTop: 10, marginTop: 4, borderTopWidth: 1 },
  timeItem: { flex: 1, alignItems: "center", gap: 3 },
  timeDivider: { width: 1, height: 32 },
  timeLabel: { fontSize: 11 },
  timeValue: { fontSize: 16, fontWeight: "700" },
});
