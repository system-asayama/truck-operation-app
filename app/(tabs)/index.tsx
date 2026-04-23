/**
 * トラック運行管理 - メイン運行画面
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  AppState,
  AppStateStatus,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  getTruckDriverInfo,
  getTrucks,
  getRoutes,
  getTodayOperation,
  startOperation,
  updateOperationStatus,
  getGpsSentCount,
  type TruckDriverInfo,
  type Truck,
  type Route,
  type TruckOperation,
  type OperationStatus,
  TRUCK_STORAGE_KEYS,
} from "@/lib/truck-api-client";
import {
  BACKGROUND_LOCATION_TASK,
  isBackgroundTaskAvailable,
  STORAGE_KEYS,
} from "@/lib/background-location-task";

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

export default function OperationScreen() {
  const colors = useColors();
  const [driverInfo, setDriverInfo] = useState<TruckDriverInfo | null>(null);
  const [operation, setOperation] = useState<TruckOperation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<OperationStatus>("off");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showTruckModal, setShowTruckModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [loadingTrucks, setLoadingTrucks] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [gpsSentCount, setGpsSentCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async () => {
    const info = await getTruckDriverInfo();
    setDriverInfo(info);
    if (!info) {
      setLoading(false);
      return;
    }
    const result = await getTodayOperation(info);
    if (result.ok && result.operation) {
      setOperation(result.operation);
      setCurrentStatus(result.operation.status as OperationStatus);
      await AsyncStorage.setItem(
        TRUCK_STORAGE_KEYS.CURRENT_OPERATION_ID,
        String(result.operation.id)
      );
      // バックグラウンドタスクがステータスを参照できるようにAsyncStorageに保存
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_STATUS, result.operation.status);
    } else {
      setOperation(null);
      setCurrentStatus("off");
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_STATUS, "off");
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  // GPS送信件数をサーバーから取得（運行開始時間と整合性あり）
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const currentOperationRef = useRef<TruckOperation | null>(null);

  // currentOperationRefを常に最新の値に保つ
  useEffect(() => {
    currentOperationRef.current = currentOperation;
  }, [currentOperation]);

  useEffect(() => {
    const loadGpsCount = async () => {
      const op = currentOperationRef.current;
      const info = await getTruckDriverInfo();
      if (op && info && op.status !== 'off' && op.status !== 'finished') {
        // 運行中はサーバーから取得（運行開始時間以降の件数）
        const result = await getGpsSentCount(info, op.id);
        if (result.ok && result.count !== undefined) {
          setGpsSentCount(result.count);
        }
      } else {
        // 未運行時はAsyncStorageのローカルカウントを使用
        const countStr = await AsyncStorage.getItem(STORAGE_KEYS.GPS_SENT_COUNT);
        setGpsSentCount(countStr ? parseInt(countStr, 10) : 0);
      }
    };
    loadGpsCount();
    // 5秒ごとに更新
    const timer = setInterval(loadGpsCount, 5000);
    // AppStateの変化を監視してフォアグラウンド復帰時に即時更新
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        loadGpsCount();
      }
      appStateRef.current = nextState;
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const startGpsTracking = useCallback(async (operationId: number) => {
    if (Platform.OS === "web" || !isBackgroundTaskAvailable) return;
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== "granted") {
        Alert.alert("位置情報の許可が必要です", "設定から位置情報へのアクセスを許可してください。");
        return;
      }
      const isAvailable = await Location.isBackgroundLocationAvailableAsync();
      if (!isAvailable) return;
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== "granted") {
        Alert.alert("バックグラウンド位置情報", "バックグラウンドでの位置情報追跡が許可されていません。設定から「常に許可」に変更してください。");
      }
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_OPERATION_ID, String(operationId));
      // GPS間隔をサーバー設定から取得（デフォルト30秒）
      const gpsIntervalSec = driverInfo?.gpsIntervalSeconds ?? 30;
      const gpsIntervalMs = gpsIntervalSec * 1000;
      // 間隔に応じて精度を自動調整（従業員勤怠GPSと同じロジック）
      let accuracy: Location.Accuracy;
      if (gpsIntervalSec <= 1) {
        accuracy = Location.Accuracy.BestForNavigation;
      } else if (gpsIntervalSec <= 5) {
        accuracy = Location.Accuracy.Highest;
      } else if (gpsIntervalSec <= 30) {
        accuracy = Location.Accuracy.High;
      } else {
        accuracy = Location.Accuracy.Balanced;
      }
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (!isRunning) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy,
          timeInterval: gpsIntervalMs,
          distanceInterval: 0,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "トラック運行追跡中",
            notificationBody: `運行中の位置情報を${gpsIntervalSec}秒ごとに記録しています`,
            notificationColor: "#1a3a5c",
          },
        });
      }
    } catch (err) {
      console.warn("[OperationScreen] GPS追跡開始エラー:", err);
    }
  }, [driverInfo]);

  const stopGpsTracking = useCallback(async () => {
    if (Platform.OS === "web" || !isBackgroundTaskAvailable) return;
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (err) {
      console.warn("[OperationScreen] GPS追跡停止エラー:", err);
    }
  }, []);

  const loadTrucks = useCallback(async () => {
    if (!driverInfo) return;
    setLoadingTrucks(true);
    const result = await getTrucks(driverInfo);
    if (result.ok && result.trucks) setTrucks(result.trucks);
    setLoadingTrucks(false);
  }, [driverInfo]);

  const loadRoutes = useCallback(async () => {
    if (!driverInfo) return;
    setLoadingRoutes(true);
    const result = await getRoutes(driverInfo);
    if (result.ok && result.routes) setRoutes(result.routes);
    setLoadingRoutes(false);
  }, [driverInfo]);

  const handleStartOperation = useCallback(async () => {
    if (!driverInfo) return;
    await loadTrucks();
    setShowTruckModal(true);
  }, [driverInfo, loadTrucks]);

  const handleTruckSelected = useCallback(async (truck: Truck) => {
    setSelectedTruck(truck);
    setShowTruckModal(false);
    await loadRoutes();
    setShowRouteModal(true);
  }, [loadRoutes]);

  const handleStartWithRoute = useCallback(async (route: Route | null) => {
    setShowRouteModal(false);
    if (!driverInfo || !selectedTruck) return;
    setActionLoading(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await startOperation(driverInfo, {
      truckId: selectedTruck.id,
      routeId: route?.id,
    });
    if (result.ok && result.operationId) {
      await startGpsTracking(result.operationId);
      await loadData();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("運行開始", `${selectedTruck.truckName}（${selectedTruck.truckNumber}）で運行を開始しました。`);
    } else {
      Alert.alert("エラー", result.error ?? "運行開始に失敗しました");
    }
    setActionLoading(false);
  }, [driverInfo, selectedTruck, startGpsTracking, loadData]);

  const handleStatusUpdate = useCallback(async (newStatus: OperationStatus) => {
    if (!driverInfo || !operation) return;
    setActionLoading(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await updateOperationStatus(driverInfo, {
      operationId: operation.id,
      status: newStatus,
    });
    if (result.ok) {
      setCurrentStatus(newStatus);
      setOperation(prev => prev ? { ...prev, status: newStatus } : null);
      // バックグラウンドタスクがステータスを参照できるようにAsyncStorageに保存
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_STATUS, newStatus);
      if (newStatus === "finished") {
        await stopGpsTracking();
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("運行終了", "お疲れ様でした。本日の運行を終了しました。");
      } else {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      Alert.alert("エラー", result.error ?? "ステータス更新に失敗しました");
    }
    setActionLoading(false);
  }, [driverInfo, operation, stopGpsTracking]);

  const confirmStatusUpdate = useCallback((newStatus: OperationStatus, title: string, message: string) => {
    Alert.alert(title, message, [
      { text: "キャンセル", style: "cancel" },
      { text: "確認", onPress: () => handleStatusUpdate(newStatus) },
    ]);
  }, [handleStatusUpdate]);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "--:--";
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const formatCurrentTime = () => {
    const h = currentTime.getHours().toString().padStart(2, "0");
    const m = currentTime.getMinutes().toString().padStart(2, "0");
    const s = currentTime.getSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const formatDate = () => {
    const d = currentTime;
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
  };

  if (!loading && !driverInfo) {
    return (
      <ScreenContainer>
        <View style={[styles.loginPrompt, { backgroundColor: colors.background }]}>
          <View style={[styles.logoContainer, { backgroundColor: colors.primary }]}>
            <IconSymbol name="truck.box.fill" size={48} color="#ffffff" />
          </View>
          <Text style={[styles.appTitle, { color: colors.foreground }]}>トラック運行管理</Text>
          <Text style={[styles.appSubtitle, { color: colors.muted }]}>
            設定画面からサーバーに接続してください
          </Text>
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="info.circle.fill" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.muted }]}>
              下の「設定」タブからサーバーURLとログイン情報を入力してください
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  const statusColor = STATUS_COLORS[currentStatus] ?? colors.muted;
  const statusLabel = STATUS_LABELS[currentStatus] ?? currentStatus;

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View>
          <Text style={styles.headerDate}>{formatDate()}</Text>
          <Text style={styles.headerTime}>{formatCurrentTime()}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <View style={styles.statusDot} />
          <Text style={styles.statusBadgeText}>{statusLabel}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>読み込み中...</Text>
          </View>
        ) : (
          <>
            {operation && currentStatus !== "off" ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <IconSymbol name="truck.box.fill" size={20} color={colors.primary} />
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>本日の運行</Text>
                </View>
                <View style={styles.operationInfo}>
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.muted }]}>トラック</Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>
                      {operation.truckName ?? "---"} ({operation.truckNumber ?? "---"})
                    </Text>
                  </View>
                  {operation.routeName ? (
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.muted }]}>ルート</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{operation.routeName}</Text>
                    </View>
                  ) : null}
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.muted }]}>開始時刻</Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>{formatTime(operation.startTime)}</Text>
                  </View>
                  {operation.endTime ? (
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.muted }]}>終了時刻</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{formatTime(operation.endTime)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.actionsContainer}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {currentStatus === "off" || currentStatus === "finished" ? "運行操作" : "ステータス変更"}
              </Text>

              {(currentStatus === "off" || currentStatus === "finished") && (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: "#16a34a" }]}
                  onPress={handleStartOperation}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <IconSymbol name="truck.box.fill" size={24} color="#ffffff" />
                      <Text style={styles.primaryButtonText}>運行開始</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {currentStatus === "driving" && (
                <View style={styles.buttonGrid}>
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: "#d97706" }]}
                      onPress={() => confirmStatusUpdate("break", "休憩開始", "休憩を開始しますか？")}
                      disabled={actionLoading}
                    >
                      <IconSymbol name="pause.circle.fill" size={28} color="#ffffff" />
                      <Text style={styles.actionButtonText}>休憩開始</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: "#2563eb" }]}
                      onPress={() => confirmStatusUpdate("loading", "荷積み開始", "荷積みを開始しますか？")}
                      disabled={actionLoading}
                    >
                      <IconSymbol name="shippingbox.fill" size={28} color="#ffffff" />
                      <Text style={styles.actionButtonText}>荷積み開始</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: "#7c3aed" }]}
                      onPress={() => confirmStatusUpdate("unloading", "荷下ろし開始", "荷下ろしを開始しますか？")}
                      disabled={actionLoading}
                    >
                      <IconSymbol name="shippingbox" size={28} color="#ffffff" />
                      <Text style={styles.actionButtonText}>荷下ろし開始</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: "#dc2626" }]}
                      onPress={() => confirmStatusUpdate("finished", "運行終了", "本日の運行を終了しますか？\n終了後は再開できません。")}
                      disabled={actionLoading}
                    >
                      <IconSymbol name="flag.checkered" size={28} color="#ffffff" />
                      <Text style={styles.actionButtonText}>運行終了</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {currentStatus === "break" && (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: "#16a34a" }]}
                  onPress={() => confirmStatusUpdate("driving", "休憩終了", "休憩を終了して運行を再開しますか？")}
                  disabled={actionLoading}
                >
                  {actionLoading ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <IconSymbol name="play.circle.fill" size={24} color="#ffffff" />
                      <Text style={styles.primaryButtonText}>休憩終了・運行再開</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {currentStatus === "loading" && (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: "#16a34a" }]}
                  onPress={() => confirmStatusUpdate("driving", "荷積み完了", "荷積みが完了しました。運行を再開しますか？")}
                  disabled={actionLoading}
                >
                  {actionLoading ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <IconSymbol name="checkmark.circle.fill" size={24} color="#ffffff" />
                      <Text style={styles.primaryButtonText}>荷積み完了・運行再開</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {currentStatus === "unloading" && (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: "#16a34a" }]}
                  onPress={() => confirmStatusUpdate("driving", "荷下ろし完了", "荷下ろしが完了しました。運行を再開しますか？")}
                  disabled={actionLoading}
                >
                  {actionLoading ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <IconSymbol name="checkmark.circle.fill" size={24} color="#ffffff" />
                      <Text style={styles.primaryButtonText}>荷下ろし完了・運行再開</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {currentStatus === "finished" && (
                <View style={[styles.completedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <IconSymbol name="checkmark.circle.fill" size={40} color={colors.success} />
                  <Text style={[styles.completedText, { color: colors.foreground }]}>本日の運行が完了しました</Text>
                  <Text style={[styles.completedSubText, { color: colors.muted }]}>お疲れ様でした</Text>
                </View>
              )}
            </View>
            {currentStatus !== "off" && currentStatus !== "finished" && (
              <View style={[styles.gpsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.gpsCardHeader}>
                  <IconSymbol name="location.fill" size={18} color={colors.primary} />
                  <Text style={[styles.gpsCardTitle, { color: colors.foreground }]}>GPS追跡</Text>
                </View>
                <View style={styles.gpsStatusRow}>
                  <View style={[styles.gpsStatusDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.gpsStatusText, { color: colors.muted }]}>{driverInfo?.gpsIntervalSeconds ?? 30}秒ごとに位置情報を自動記録中</Text>
                </View>
                <View style={styles.gpsCountRow}>
                  <Text style={[styles.gpsCountLabel, { color: colors.muted }]}>出勤後の送信件数：</Text>
                  <Text style={[styles.gpsCountValue, { color: colors.primary }]}>{gpsSentCount}件</Text>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={showTruckModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>トラックを選択</Text>
            <TouchableOpacity onPress={() => setShowTruckModal(false)}>
              <IconSymbol name="xmark" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>
          {loadingTrucks ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : trucks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>利用可能なトラックがありません</Text>
              <Text style={[styles.emptySubText, { color: colors.muted }]}>管理者にトラックの登録を依頼してください</Text>
            </View>
          ) : (
            <FlatList
              data={trucks}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.listItem, { borderBottomColor: colors.border }]}
                  onPress={() => handleTruckSelected(item)}
                >
                  <IconSymbol name="truck.box.fill" size={24} color={colors.primary} />
                  <View style={styles.listItemContent}>
                    <Text style={[styles.listItemTitle, { color: colors.foreground }]}>{item.truckName}</Text>
                    <Text style={[styles.listItemSub, { color: colors.muted }]}>
                      {item.truckNumber}{item.capacity ? ` / ${item.capacity}` : ""}
                    </Text>
                  </View>
                  <IconSymbol name="chevron.right" size={20} color={colors.muted} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      <Modal visible={showRouteModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>ルートを選択</Text>
            <TouchableOpacity onPress={() => setShowRouteModal(false)}>
              <IconSymbol name="xmark" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.listItem, { borderBottomColor: colors.border }]}
            onPress={() => handleStartWithRoute(null)}
          >
            <IconSymbol name="xmark.circle.fill" size={24} color={colors.muted} />
            <View style={styles.listItemContent}>
              <Text style={[styles.listItemTitle, { color: colors.muted }]}>ルートを指定しない</Text>
            </View>
          </TouchableOpacity>
          {loadingRoutes ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
          ) : (
            <FlatList
              data={routes}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.listItem, { borderBottomColor: colors.border }]}
                  onPress={() => handleStartWithRoute(item)}
                >
                  <IconSymbol name="road.lanes" size={24} color={colors.primary} />
                  <View style={styles.listItemContent}>
                    <Text style={[styles.listItemTitle, { color: colors.foreground }]}>{item.routeName}</Text>
                    {item.description ? <Text style={[styles.listItemSub, { color: colors.muted }]}>{item.description}</Text> : null}
                    {item.estimatedMinutes ? <Text style={[styles.listItemSub, { color: colors.muted }]}>目安: 約{item.estimatedMinutes}分</Text> : null}
                  </View>
                  <IconSymbol name="chevron.right" size={20} color={colors.muted} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerDate: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "500" },
  headerTime: { color: "#ffffff", fontSize: 28, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.8)" },
  statusBadgeText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  loadingContainer: { alignItems: "center", paddingTop: 60, gap: 12 },
  loadingText: { fontSize: 15 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  operationInfo: { gap: 8 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 14, fontWeight: "600" },
  actionsContainer: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 18, borderRadius: 16, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  primaryButtonText: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  buttonGrid: { flexDirection: "column", gap: 12 },
  buttonRow: { flexDirection: "row", gap: 12 },
  actionButton: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 28, borderRadius: 16, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  actionButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  completedCard: { alignItems: "center", padding: 32, borderRadius: 16, borderWidth: 1, gap: 12 },
  completedText: { fontSize: 18, fontWeight: "700" },
  completedSubText: { fontSize: 14 },
  gpsCard: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  gpsCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  gpsCardTitle: { fontSize: 14, fontWeight: "600" },
  gpsStatusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  gpsStatusDot: { width: 8, height: 8, borderRadius: 4 },
  gpsStatusText: { fontSize: 12 },
  gpsCountRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  gpsCountLabel: { fontSize: 12 },
  gpsCountValue: { fontSize: 14, fontWeight: "700" },
  loginPrompt: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  logoContainer: { width: 100, height: 100, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  appTitle: { fontSize: 24, fontWeight: "800" },
  appSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 20 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  listItem: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, gap: 12 },
  listItemContent: { flex: 1, gap: 2 },
  listItemTitle: { fontSize: 16, fontWeight: "600" },
  listItemSub: { fontSize: 13 },
  emptyState: { alignItems: "center", padding: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptySubText: { fontSize: 13, textAlign: "center" },
});
