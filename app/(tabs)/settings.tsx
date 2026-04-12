/**
 * トラック運行管理 - 設定画面
 * ログイン・サーバー接続設定
 */
import React, { useState, useCallback } from "react";
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Linking,
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemeContext } from "@/lib/theme-provider";
import {
  getTruckDriverInfo,
  loginTruckDriver,
  clearTruckDriverInfo,
  saveTruckDriverInfo,
  type TruckDriverInfo,
  DEFAULT_API_URL,
  DEFAULT_TENANT_SLUG,
  DEFAULT_MOBILE_API_KEY,
  TRUCK_STORAGE_KEYS,
} from "@/lib/truck-api-client";

export default function SettingsScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const { setColorScheme } = useThemeContext();

  const [driverInfo, setDriverInfo] = useState<TruckDriverInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);

  // ログインフォーム
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [tenantSlug, setTenantSlug] = useState(DEFAULT_TENANT_SLUG);
  const [mobileApiKey, setMobileApiKey] = useState(DEFAULT_MOBILE_API_KEY);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadDriverInfo = useCallback(async () => {
    const info = await getTruckDriverInfo();
    setDriverInfo(info);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDriverInfo();
    }, [loadDriverInfo])
  );

  const handleLogin = async () => {
    if (!loginId.trim() || !password.trim()) {
      Alert.alert("入力エラー", "ログインIDとパスワードを入力してください");
      return;
    }
    setLoginLoading(true);
    const result = await loginTruckDriver({
      apiUrl: apiUrl.trim(),
      mobileApiKey: mobileApiKey.trim(),
      tenantSlug: tenantSlug.trim(),
      loginId: loginId.trim(),
      password: password.trim(),
    });
    if (result.ok && result.driverInfo) {
      // mobileApiKeyをSTORAGE_KEYSにも保存
      await AsyncStorage.setItem(TRUCK_STORAGE_KEYS.MOBILE_API_KEY, mobileApiKey.trim());
      setDriverInfo(result.driverInfo);
      setPassword("");
      Alert.alert("ログイン成功", `${result.driverInfo.name} さん、ようこそ！`);
    } else {
      Alert.alert("ログイン失敗", result.error ?? "ログインに失敗しました。\nIDとパスワードを確認してください。");
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    Alert.alert("ログアウト", "ログアウトしますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: async () => {
          await clearTruckDriverInfo();
          setDriverInfo(null);
          setLoginId("");
          setPassword("");
        },
      },
    ]);
  };

  const isDark = colorScheme === "dark";

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Text style={styles.headerTitle}>設定</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ログイン状態 */}
        {driverInfo ? (
          <>
            {/* ログイン中のユーザー情報 */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.avatarContainer, { backgroundColor: colors.primary }]}>
                  <IconSymbol name="person.fill" size={28} color="#ffffff" />
                </View>
                <View style={styles.userInfo}>
                  <Text style={[styles.userName, { color: colors.foreground }]}>{driverInfo.name}</Text>
                  <Text style={[styles.userRole, { color: colors.muted }]}>ドライバー</Text>
                </View>
                <View style={[styles.loggedInBadge, { backgroundColor: colors.success + "20" }]}>
                  <View style={[styles.loggedInDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.loggedInText, { color: colors.success }]}>接続中</Text>
                </View>
              </View>
            </View>

            {/* サーバー情報 */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>サーバー情報</Text>
              <View style={styles.infoList}>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.muted }]}>サーバーURL</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
                    {driverInfo.apiUrl}
                  </Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.muted }]}>テナント</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>{driverInfo.tenantSlug}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.muted }]}>スタッフID</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>{driverInfo.staffId}</Text>
                </View>
              </View>
            </View>

            {/* ログアウトボタン */}
            <TouchableOpacity
              style={[styles.logoutButton, { borderColor: colors.error }]}
              onPress={handleLogout}
            >
              <IconSymbol name="arrow.right.square.fill" size={20} color={colors.error} />
              <Text style={[styles.logoutButtonText, { color: colors.error }]}>ログアウト</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* ログインフォーム */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.logoSmall, { backgroundColor: colors.primary }]}>
                  <IconSymbol name="truck.box.fill" size={20} color="#ffffff" />
                </View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>サーバーにログイン</Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.muted }]}>ログインID</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  value={loginId}
                  onChangeText={setLoginId}
                  placeholder="ログインID"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.muted }]}>パスワード</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="パスワード"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </View>

              <TouchableOpacity
                style={[styles.loginButton, { backgroundColor: colors.primary }]}
                onPress={handleLogin}
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.loginButtonText}>ログイン</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* 詳細設定（折りたたみ） */}
            <TouchableOpacity
              style={[styles.advancedToggle, { borderColor: colors.border }]}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text style={[styles.advancedToggleText, { color: colors.muted }]}>詳細設定</Text>
              <IconSymbol
                name={showAdvanced ? "chevron.left" : "chevron.right"}
                size={16}
                color={colors.muted}
              />
            </TouchableOpacity>

            {showAdvanced && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>サーバー設定</Text>
                <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
                  通常は変更不要です
                </Text>

                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>サーバーURL</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={apiUrl}
                    onChangeText={setApiUrl}
                    placeholder="https://example.com"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>テナントスラッグ</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={tenantSlug}
                    onChangeText={setTenantSlug}
                    placeholder="テナントスラッグ"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>モバイルAPIキー</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={mobileApiKey}
                    onChangeText={setMobileApiKey}
                    placeholder="APIキー"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            )}
          </>
        )}

        {/* 表示設定 */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>表示設定</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <IconSymbol name="gear" size={18} color={colors.muted} />
              <Text style={[styles.settingLabel, { color: colors.foreground }]}>ダークモード</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={(val) => setColorScheme(val ? "dark" : "light")}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* APKダウンロード（Androidのみ表示） */}
        {Platform.OS === "android" && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.logoSmall, { backgroundColor: "#3ddc84" }]}>
                <IconSymbol name="arrow.down.circle.fill" size={20} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>アプリ更新</Text>
                <Text style={[styles.cardSubtitle, { color: colors.muted }]}>最新版のAPKをダウンロード</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.downloadButton, { backgroundColor: "#3ddc84" }]}
              onPress={() => {
                // ログイン済みの場合はサーバーエンドポイントを使用、未ログインの場合はデフォルトURLを使用
                const currentApiUrl = driverInfo?.apiUrl ?? DEFAULT_API_URL;
                const currentTenantSlug = driverInfo?.tenantSlug ?? DEFAULT_TENANT_SLUG;
                const currentApiKey = driverInfo?.mobileApiKey ?? DEFAULT_MOBILE_API_KEY;
                // サーバーエンドポイント（永続 URL）を構築
                // 注意: ブラウザからのダウンロードのため、APIKeyはクエリパラメータで渡す
                const downloadUrl = `${currentApiUrl}/api/mobile/truck_apk_download?tenant_slug=${currentTenantSlug}&api_key=${encodeURIComponent(currentApiKey)}`;
                Alert.alert(
                  "APKダウンロード",
                  "最新版のAndroidアプリをダウンロードします。\nブラウザが開きますので、APKファイルをダウンロードしてインストールしてください。",
                  [
                    { text: "キャンセル", style: "cancel" },
                    {
                      text: "ダウンロード",
                      onPress: () => Linking.openURL(downloadUrl),
                    },
                  ]
                );
              }}
            >
              <IconSymbol name="arrow.down.circle.fill" size={20} color="#ffffff" />
              <Text style={styles.downloadButtonText}>最新APKをダウンロード</Text>
            </TouchableOpacity>
            <Text style={[styles.downloadNote, { color: colors.muted }]}>
              ※ インストール前に「提供元不明のアプリ」を許可してください
            </Text>
          </View>
        )}

        {/* アプリ情報 */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>アプリ情報</Text>
          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>アプリ名</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>トラック運行管理</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>バージョン</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>1.0.0</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  headerTitle: { color: "#ffffff", fontSize: 22, fontWeight: "700" },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardSubtitle: { fontSize: 12, marginTop: -8 },
  avatarContainer: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: "700" },
  userRole: { fontSize: 13, marginTop: 2 },
  loggedInBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, gap: 5 },
  loggedInDot: { width: 6, height: 6, borderRadius: 3 },
  loggedInText: { fontSize: 12, fontWeight: "600" },
  infoList: { gap: 0 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  divider: { height: 1 },
  logoSmall: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  formGroup: { gap: 6 },
  formLabel: { fontSize: 13, fontWeight: "500" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  loginButton: { paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 4 },
  loginButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  logoutButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, gap: 8 },
  logoutButtonText: { fontSize: 15, fontWeight: "600" },
  advancedToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  advancedToggleText: { fontSize: 14, fontWeight: "500" },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  settingInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  settingLabel: { fontSize: 15 },
  downloadButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, gap: 8 },
  downloadButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  downloadNote: { fontSize: 12, textAlign: "center", lineHeight: 18 },
});
