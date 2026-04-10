import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import {
  getFlaskStaffInfo,
  loginToFlask,
  clearFlaskStaffInfo,
  type FlaskStaffInfo,
} from "@/lib/flask-api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { BACKGROUND_LOCATION_TASK, isBackgroundTaskAvailable, STORAGE_KEYS } from "@/lib/background-location-task";
import { getFlaskTodayAttendance } from "@/lib/flask-api-client";

export default function SettingsScreen() {
  const colors = useColors();
  const { user, isAuthenticated, logout } = useAuth();
  const logoutMutation = trpc.auth.logout.useMutation();

  // Flask接続設定
  const [flaskInfo, setFlaskInfo] = useState<FlaskStaffInfo | null>(null);
  const [showFlaskForm, setShowFlaskForm] = useState(false);
  const [flaskApiUrl, setFlaskApiUrl] = useState("");
  const [flaskMobileApiKey, setFlaskMobileApiKey] = useState("");
  const [flaskLoginId, setFlaskLoginId] = useState("");
  const [flaskPassword, setFlaskPassword] = useState("");
  const [flaskTenantSlug, setFlaskTenantSlug] = useState("");
  const [flaskConnecting, setFlaskConnecting] = useState(false);

  // QRスキャン
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrScanned, setQrScanned] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // バックグラウンドGPS状態
  const [bgLocationRunning, setBgLocationRunning] = useState(false);
  const [locationPermission, setLocationPermission] = useState<string>("unknown");

  // GPS状態を更新する関数
  const refreshGpsStatus = useCallback(async () => {
    if (Platform.OS === "web") return;
    const { status } = await Location.getForegroundPermissionsAsync();
    setLocationPermission(status);
    if (isBackgroundTaskAvailable) {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        setBgLocationRunning(running);
      } catch {
        setBgLocationRunning(false);
      }
    }
  }, []);

  // Flask出勤状態を確認してGPSを自動開始する関数
  const checkAndStartGps = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const info = await getFlaskStaffInfo();
      if (!info) return;
      const result = await getFlaskTodayAttendance(info);
      if (!result.ok || !result.attendance) return;
      const flaskStatus = result.attendance.status;
      console.log(`[Settings] flask=${flaskStatus}`);
      if (flaskStatus === "working") {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (!running) {
          console.log("[Settings] 出勤中だがGPS停止中 → 自動開始");
          const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
          if (fgStatus !== "granted") return;
          const isAvailable = await Location.isBackgroundLocationAvailableAsync();
          if (!isAvailable) return;
          if (result.attendance.id) {
            await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_ATTENDANCE_ID, String(result.attendance.id));
          }
          const intervalSec = info.gpsIntervalSeconds ?? ((info.gpsIntervalMinutes || 5) * 60);
          const intervalMs = intervalSec * 1000;
          const accuracy = intervalMs <= 1000 ? Location.Accuracy.BestForNavigation
            : intervalMs <= 5000 ? Location.Accuracy.Highest
            : intervalMs <= 30000 ? Location.Accuracy.High
            : Location.Accuracy.Balanced;
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy,
            timeInterval: intervalMs,
            distanceInterval: 0,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: "勤怠GPS追跡中",
              notificationBody: "出勤中の位置情報を記録しています",
              notificationColor: "#1a56db",
            },
          });
          console.log("[Settings] バックグラウンドGPS追跡開始成功");
          setBgLocationRunning(true);
        }
      } else if (flaskStatus === "finished" || flaskStatus === "off") {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (running) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          setBgLocationRunning(false);
        }
      }
    } catch (err) {
      console.warn("[Settings] GPS自動開始エラー:", err);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    (async () => {
      const info = await getFlaskStaffInfo();
      setFlaskInfo(info);
      if (info) setFlaskApiUrl(info.apiUrl);
      await refreshGpsStatus();
      await checkAndStartGps();
    })();
  }, []);

  // 画面フォーカス時に毎回GPS状態を更新＋自動開始チェック
  useFocusEffect(
    useCallback(() => {
      refreshGpsStatus();
      checkAndStartGps();
      // 10秒ごとに状態を更新
      const timer = setInterval(() => {
        refreshGpsStatus();
        checkAndStartGps();
      }, 10000);
      return () => clearInterval(timer);
    }, [refreshGpsStatus, checkAndStartGps])
  );

  // AppState変化時（バックグラウンドから復帰）にも更新
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshGpsStatus();
        checkAndStartGps();
      }
    });
    return () => sub.remove();
  }, []);

  const handleLogout = () => {
    Alert.alert("ログアウト", "ログアウトしますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: async () => {
          try {
            await logoutMutation.mutateAsync();
            logout();
          } catch {
            logout();
          }
        },
      },
    ]);
  };

  const handleFlaskConnect = async () => {
    if (!flaskApiUrl || !flaskMobileApiKey || !flaskLoginId || !flaskPassword || !flaskTenantSlug) {
      Alert.alert("入力エラー", "すべての項目を入力してください");
      return;
    }
    setFlaskConnecting(true);
    try {
      const result = await loginToFlask({
        apiUrl: flaskApiUrl,
        mobileApiKey: flaskMobileApiKey,
        loginId: flaskLoginId,
        password: flaskPassword,
        tenantSlug: flaskTenantSlug,
      });
      if (result.ok && result.staffInfo) {
        await AsyncStorage.setItem("mobileApiKey", flaskMobileApiKey);
        setFlaskInfo(result.staffInfo);
        setShowFlaskForm(false);
        setFlaskPassword("");
        Alert.alert(
          "接続成功",
          `${result.staffInfo.name} としてログインしました\n\nバックグラウンドGPS追跡が有効になりました。出勤ボタンを押すと位置情報の記録が開始されます。`
        );
      } else {
        Alert.alert("接続失敗", result.error ?? "接続に失敗しました");
      }
    } catch (e) {
      Alert.alert("エラー", String(e));
    } finally {
      setFlaskConnecting(false);
    }
  };

  const handleFlaskDisconnect = () => {
    Alert.alert("接続解除", "顧問先管理アプリとの連携を解除しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "解除",
        style: "destructive",
        onPress: async () => {
          await clearFlaskStaffInfo();
          await AsyncStorage.removeItem("mobileApiKey");
          setFlaskInfo(null);
          setShowFlaskForm(false);
        },
      },
    ]);
  };

  const handleRequestPermission = async () => {
    if (Platform.OS === "web") return;
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus === "granted") {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      setLocationPermission(fgStatus);
      if (bgStatus === "granted") {
        Alert.alert("権限許可", "位置情報（バックグラウンド含む）が許可されました");
      } else {
        Alert.alert(
          "バックグラウンド権限",
          "フォアグラウンドの位置情報は許可されましたが、バックグラウンドは許可されていません。\n\n設定アプリから「常に許可」に変更してください。"
        );
      }
    } else {
      Alert.alert("権限拒否", "位置情報の権限が拒否されました。設定アプリから許可してください。");
    }
  };

  const handleOpenQrScanner = async () => {
    if (Platform.OS === "web") {
      Alert.alert("非対応", "QRスキャンはAndroid/iOSのみ対応しています");
      return;
    }
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert("カメラ権限", "QRコードをスキャンするにはカメラの権限が必要です");
        return;
      }
    }
    setQrScanned(false);
    setShowQrScanner(true);
  };

  const handleQrScanned = ({ data }: { data: string }) => {
    if (qrScanned) return;
    setQrScanned(true);
    setShowQrScanner(false);
    try {
      const parsed = JSON.parse(data);
      if (parsed.apiUrl && parsed.mobileApiKey && parsed.tenantSlug) {
        setFlaskApiUrl(parsed.apiUrl);
        setFlaskMobileApiKey(parsed.mobileApiKey);
        setFlaskTenantSlug(parsed.tenantSlug);
        setShowFlaskForm(true);
        Alert.alert(
          "QR読み取り完了",
          `接続先URL・APIキー・テナントスラッグを自動入力しました。\n\nログインIDとパスワードを入力して接続してください。`
        );
      } else {
        Alert.alert("QRコードエラー", "このQRコードは対応していません");
      }
    } catch {
      Alert.alert("QRコードエラー", "QRコードの読み取りに失敗しました");
    }
  };

  return (
    <ScreenContainer>
      {/* ヘッダー */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Text style={styles.headerTitle}>設定</Text>
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* ユーザー情報 */}
          {isAuthenticated && user && (
            <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.avatarContainer, { backgroundColor: colors.primary + "20" }]}>
                <IconSymbol name="person.fill" size={32} color={colors.primary} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: colors.foreground }]}>
                  {user.name ?? "スタッフ"}
                </Text>
                <Text style={[styles.profileEmail, { color: colors.muted }]}>
                  {user.email ?? ""}
                </Text>
                <View style={[styles.roleBadge, { backgroundColor: colors.primary + "15" }]}>
                  <Text style={[styles.roleText, { color: colors.primary }]}>スタッフ</Text>
                </View>
              </View>
            </View>
          )}

          {/* バックグラウンドGPS状態 */}
          {Platform.OS !== "web" && (
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>バックグラウンドGPS</Text>
              <Text style={[styles.sectionDesc, { color: colors.muted }]}>
                アプリを閉じていても出勤中は位置情報を記録します。
              </Text>

              <View style={[styles.statusRow, { borderBottomColor: colors.border }]}>
                <View style={styles.statusLeft}>
                  <IconSymbol name="location.fill" size={16} color={colors.muted} />
                  <Text style={[styles.statusLabel, { color: colors.foreground }]}>位置情報権限</Text>
                </View>
                <View style={styles.statusRight}>
                  <View style={[styles.statusDot, { backgroundColor: locationPermission === "granted" ? colors.success : colors.error }]} />
                  <Text style={[styles.statusValue, { color: locationPermission === "granted" ? colors.success : colors.error }]}>
                    {locationPermission === "granted" ? "許可済み" : "未許可"}
                  </Text>
                </View>
              </View>

              <View style={[styles.statusRow, { borderBottomColor: colors.border }]}>
                <View style={styles.statusLeft}>
                  <IconSymbol name="location.fill" size={16} color={colors.muted} />
                  <Text style={[styles.statusLabel, { color: colors.foreground }]}>バックグラウンド追跡</Text>
                </View>
                <View style={styles.statusRight}>
                  <View style={[styles.statusDot, { backgroundColor: bgLocationRunning ? colors.success : colors.muted }]} />
                  <Text style={[styles.statusValue, { color: bgLocationRunning ? colors.success : colors.muted }]}>
                    {bgLocationRunning ? "動作中" : "停止中"}
                  </Text>
                </View>
              </View>

              {locationPermission !== "granted" && (
                <TouchableOpacity
                  style={[styles.permissionButton, { backgroundColor: colors.primary }]}
                  onPress={handleRequestPermission}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="location.fill" size={16} color="#ffffff" />
                  <Text style={styles.permissionButtonText}>位置情報の権限を許可する</Text>
                </TouchableOpacity>
              )}

              {locationPermission === "granted" && (
                <View style={[styles.infoBox, { backgroundColor: colors.success + "10", borderColor: colors.success + "30" }]}>
                  <Text style={[styles.infoText, { color: colors.success }]}>
                    ✓ バックグラウンドGPSが有効です。出勤ボタンを押すと位置記録が開始されます。
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* 顧問先管理アプリ連携 */}
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>顧問先管理アプリ連携</Text>

            {flaskInfo ? (
              /* 接続済み */
              <>
                <View style={[styles.connectedBadge, { backgroundColor: colors.success + "15", borderColor: colors.success + "40" }]}>
                  <IconSymbol name="checkmark.circle.fill" size={18} color={colors.success} />
                  <Text style={[styles.connectedText, { color: colors.success }]}>接続済み</Text>
                </View>
                <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.settingLeft}>
                    <IconSymbol name="person.fill" size={16} color={colors.muted} />
                    <Text style={[styles.settingLabel, { color: colors.foreground }]}>スタッフ名</Text>
                  </View>
                  <Text style={[styles.settingValue, { color: colors.muted }]}>{flaskInfo.name}</Text>
                </View>
                <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.settingLeft}>
                    <IconSymbol name="building.2.fill" size={16} color={colors.muted} />
                    <Text style={[styles.settingLabel, { color: colors.foreground }]}>テナント</Text>
                  </View>
                  <Text style={[styles.settingValue, { color: colors.muted }]}>{flaskInfo.tenantSlug}</Text>
                </View>
                <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.settingLeft}>
                    <IconSymbol name="location.fill" size={16} color={colors.muted} />
                    <Text style={[styles.settingLabel, { color: colors.foreground }]}>GPS記録間隔</Text>
                  </View>
                  <Text style={[styles.settingValue, { color: colors.muted }]}>
                    {flaskInfo.gpsIntervalSeconds
                      ? flaskInfo.gpsIntervalSeconds >= 60
                        ? `${Math.floor(flaskInfo.gpsIntervalSeconds / 60)}分${flaskInfo.gpsIntervalSeconds % 60 > 0 ? `${flaskInfo.gpsIntervalSeconds % 60}秒` : ""}`
                        : `${flaskInfo.gpsIntervalSeconds}秒`
                      : `${flaskInfo.gpsIntervalMinutes}分`}
                  </Text>
                </View>
                <View style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <IconSymbol name="wifi" size={16} color={colors.muted} />
                    <Text style={[styles.settingLabel, { color: colors.foreground }]}>接続先</Text>
                  </View>
                  <Text style={[styles.settingValue, { color: colors.muted }]} numberOfLines={1}>
                    {flaskInfo.apiUrl.replace(/^https?:\/\//, "").substring(0, 25)}...
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.disconnectButton, { borderColor: colors.error + "40" }]}
                  onPress={handleFlaskDisconnect}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.disconnectText, { color: colors.error }]}>連携を解除する</Text>
                </TouchableOpacity>
              </>
            ) : showFlaskForm ? (
              /* 接続フォーム */
              <>
                {/* QRスキャンボタン */}
                {Platform.OS !== "web" && (
                  <TouchableOpacity
                    style={[styles.qrButton, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}
                    onPress={handleOpenQrScanner}
                    activeOpacity={0.8}
                  >
                    <IconSymbol name="qrcode.viewfinder" size={22} color={colors.primary} />
                    <View style={styles.qrButtonTextContainer}>
                      <Text style={[styles.qrButtonTitle, { color: colors.primary }]}>QRコードをスキャン</Text>
                      <Text style={[styles.qrButtonSub, { color: colors.muted }]}>管理画面のQRコードを読み取ると自動入力されます</Text>
                    </View>
                  </TouchableOpacity>
                )}

                <Text style={[styles.formDivider, { color: colors.muted }]}>または手動で入力</Text>

                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.foreground }]}>アプリURL</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={flaskApiUrl}
                    onChangeText={setFlaskApiUrl}
                    placeholder="https://your-app.example.com"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    keyboardType="url"
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.foreground }]}>モバイルAPIキー</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={flaskMobileApiKey}
                    onChangeText={setFlaskMobileApiKey}
                    placeholder="管理者から取得したAPIキー"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    secureTextEntry
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.foreground }]}>テナントスラッグ</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={flaskTenantSlug}
                    onChangeText={setFlaskTenantSlug}
                    placeholder="your-tenant"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.foreground }]}>ログインID</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={flaskLoginId}
                    onChangeText={setFlaskLoginId}
                    placeholder="ログインID"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.foreground }]}>パスワード</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={flaskPassword}
                    onChangeText={setFlaskPassword}
                    placeholder="パスワード"
                    placeholderTextColor={colors.muted}
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={handleFlaskConnect}
                  />
                </View>
                <View style={styles.formButtons}>
                  <TouchableOpacity
                    style={[styles.cancelButton, { borderColor: colors.border }]}
                    onPress={() => setShowFlaskForm(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cancelButtonText, { color: colors.muted }]}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.connectButton, { backgroundColor: colors.primary }, flaskConnecting && { opacity: 0.6 }]}
                    onPress={handleFlaskConnect}
                    disabled={flaskConnecting}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.connectButtonText}>
                      {flaskConnecting ? "接続中..." : "接続する"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              /* 未接続 */
              <>
                <Text style={[styles.sectionDesc, { color: colors.muted }]}>
                  顧問先管理アプリと連携することで、出勤・退勤・GPS位置情報を記録できます。
                </Text>

                {/* QRスキャンで一発設定 */}
                {Platform.OS !== "web" && (
                  <TouchableOpacity
                    style={[styles.qrButton, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}
                    onPress={handleOpenQrScanner}
                    activeOpacity={0.8}
                  >
                    <IconSymbol name="qrcode.viewfinder" size={28} color={colors.primary} />
                    <View style={styles.qrButtonTextContainer}>
                      <Text style={[styles.qrButtonTitle, { color: colors.primary }]}>QRコードで一発設定</Text>
                      <Text style={[styles.qrButtonSub, { color: colors.muted }]}>管理画面のQRコードをスキャンするだけで設定完了</Text>
                    </View>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.manualButton, { borderColor: colors.border }]}
                  onPress={() => setShowFlaskForm(true)}
                  activeOpacity={0.8}
                >
                  <IconSymbol name="wifi" size={16} color={colors.muted} />
                  <Text style={[styles.manualButtonText, { color: colors.muted }]}>手動で設定する</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* ログアウト */}
          {isAuthenticated && (
            <TouchableOpacity
              style={[styles.logoutButton, { backgroundColor: colors.error + "10", borderColor: colors.error + "30" }]}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark.circle.fill" size={18} color={colors.error} />
              <Text style={[styles.logoutText, { color: colors.error }]}>ログアウト</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.version, { color: colors.muted }]}>スタッフ勤怠GPS v{Constants.expoConfig?.version ?? '1.0.8'}</Text>
        </View>
      </ScrollView>

      {/* QRスキャナーモーダル */}
      <Modal visible={showQrScanner} animationType="slide" onRequestClose={() => setShowQrScanner(false)}>
        <View style={styles.qrModal}>
          <View style={[styles.qrHeader, { backgroundColor: colors.primary }]}>
            <Text style={styles.qrHeaderTitle}>QRコードをスキャン</Text>
            <TouchableOpacity onPress={() => setShowQrScanner(false)} activeOpacity={0.7}>
              <IconSymbol name="xmark.circle.fill" size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <CameraView
            style={styles.qrCamera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={qrScanned ? undefined : handleQrScanned}
          />
          <View style={[styles.qrOverlay, { backgroundColor: colors.surface }]}>
            <Text style={[styles.qrInstruction, { color: colors.foreground }]}>
              管理画面「GPS設定」のQRコードを枠内に合わせてください
            </Text>
          </View>
        </View>
      </Modal>
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
  content: {
    padding: 16,
    gap: 16,
  },
  profileCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
  },
  profileEmail: {
    fontSize: 13,
  },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
  },
  roleText: {
    fontSize: 12,
    fontWeight: "600",
  },
  section: {
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusLabel: {
    fontSize: 14,
  },
  statusRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  permissionButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  infoBox: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  connectedText: {
    fontSize: 13,
    fontWeight: "600",
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingLabel: {
    fontSize: 14,
  },
  settingValue: {
    fontSize: 13,
    maxWidth: 160,
  },
  disconnectButton: {
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    marginTop: 4,
  },
  disconnectText: {
    fontSize: 14,
    fontWeight: "600",
  },
  qrButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  qrButtonTextContainer: {
    flex: 1,
    gap: 3,
  },
  qrButtonTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  qrButtonSub: {
    fontSize: 12,
    lineHeight: 18,
  },
  formDivider: {
    textAlign: "center",
    fontSize: 12,
    marginVertical: 4,
  },
  manualButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  manualButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  formHint: {
    fontSize: 13,
    lineHeight: 20,
  },
  formGroup: {
    gap: 6,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  formButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  connectButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  connectButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "600",
  },
  version: {
    fontSize: 12,
    textAlign: "center",
    paddingBottom: 8,
  },
  // QRスキャナーモーダル
  qrModal: {
    flex: 1,
    backgroundColor: "#000",
  },
  qrHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  qrHeaderTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  qrCamera: {
    flex: 1,
  },
  qrOverlay: {
    padding: 20,
  },
  qrInstruction: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
});
