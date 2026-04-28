/**
 * 写真撮影・コメント入力モーダル
 * 運行中に任意のタイミングで写真を撮影し、コメントを付けてサーバーにアップロードする
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  FlatList,
  Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  uploadOperationPhoto,
  getOperationPhotos,
  type TruckDriverInfo,
  type OperationPhoto,
} from "@/lib/truck-api-client";

interface PhotoCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  driverInfo: TruckDriverInfo;
  operationId: number;
  apiBaseUrl: string;
}

type ModalScreen = "camera" | "preview" | "photos";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const THUMB_SIZE = (SCREEN_WIDTH - 48) / 3;

export function PhotoCaptureModal({
  visible,
  onClose,
  driverInfo,
  operationId,
  apiBaseUrl,
}: PhotoCaptureModalProps) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [screen, setScreen] = useState<ModalScreen>("camera");
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<OperationPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // モーダルを開くたびにカメラ画面に戻す
  useEffect(() => {
    if (visible) {
      setScreen("camera");
      setCapturedUri(null);
      setComment("");
    }
  }, [visible]);

  // 写真一覧を読み込む
  const loadPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    const result = await getOperationPhotos(driverInfo, operationId);
    if (result.ok && result.photos) {
      setPhotos(result.photos);
    }
    setLoadingPhotos(false);
  }, [driverInfo, operationId]);

  useEffect(() => {
    if (visible && screen === "photos") {
      loadPhotos();
    }
  }, [visible, screen, loadPhotos]);

  const handleTakePicture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
        setScreen("preview");
      }
    } catch (e) {
      Alert.alert("エラー", "写真の撮影に失敗しました");
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!capturedUri) return;
    setUploading(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const result = await uploadOperationPhoto(driverInfo, {
      operationId,
      photoUri: capturedUri,
      comment: comment.trim() || undefined,
    });
    setUploading(false);
    if (result.ok) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("保存完了", "写真を運行記録に保存しました", [
        {
          text: "続けて撮影",
          onPress: () => {
            setCapturedUri(null);
            setComment("");
            setScreen("camera");
          },
        },
        {
          text: "一覧を見る",
          onPress: () => {
            setCapturedUri(null);
            setComment("");
            setScreen("photos");
          },
        },
        { text: "閉じる", onPress: onClose },
      ]);
    } else {
      Alert.alert("エラー", result.error ?? "アップロードに失敗しました");
    }
  }, [capturedUri, comment, driverInfo, operationId, onClose]);

  const handleRetake = useCallback(() => {
    setCapturedUri(null);
    setComment("");
    setScreen("camera");
  }, []);

  // カメラ権限がまだ確認されていない
  if (!permission) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {/* ヘッダー */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
            <IconSymbol name="xmark" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {screen === "camera" ? "写真撮影" : screen === "preview" ? "確認・コメント" : "撮影済み写真"}
          </Text>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => {
              if (screen !== "photos") {
                setScreen("photos");
                loadPhotos();
              } else {
                setScreen("camera");
              }
            }}
          >
            <IconSymbol
              name={screen === "photos" ? "camera.fill" : "photo.fill"}
              size={22}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>

        {/* カメラ画面 */}
        {screen === "camera" && (
          <View style={styles.cameraContainer}>
            {!permission.granted ? (
              <View style={[styles.permissionView, { backgroundColor: colors.background }]}>
                <IconSymbol name="camera.fill" size={48} color={colors.muted} />
                <Text style={[styles.permissionText, { color: colors.foreground }]}>
                  カメラへのアクセスが必要です
                </Text>
                <TouchableOpacity
                  style={[styles.permissionBtn, { backgroundColor: colors.primary }]}
                  onPress={requestPermission}
                >
                  <Text style={styles.permissionBtnText}>許可する</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing={facing}
                />
                {/* カメラコントロール */}
                <View style={styles.cameraControls}>
                  {/* フリップボタン */}
                  <TouchableOpacity
                    style={styles.flipBtn}
                    onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
                  >
                    <IconSymbol name="arrow.clockwise" size={26} color="#fff" />
                  </TouchableOpacity>
                  {/* シャッターボタン */}
                  <TouchableOpacity style={styles.shutterBtn} onPress={handleTakePicture}>
                    <View style={styles.shutterInner} />
                  </TouchableOpacity>
                  {/* 一覧ボタン（右側スペース確保用） */}
                  <View style={styles.flipBtn} />
                </View>
              </>
            )}
          </View>
        )}

        {/* プレビュー・コメント入力画面 */}
        {screen === "preview" && capturedUri && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              style={{ flex: 1, backgroundColor: colors.background }}
              contentContainerStyle={styles.previewContent}
              keyboardShouldPersistTaps="handled"
            >
              <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="cover" />

              <View style={styles.commentSection}>
                <Text style={[styles.commentLabel, { color: colors.foreground }]}>
                  コメント（任意）
                </Text>
                <TextInput
                  style={[
                    styles.commentInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder="例: 荷積み完了、現場到着など"
                  placeholderTextColor={colors.muted}
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                  returnKeyType="done"
                />
                <Text style={[styles.charCount, { color: colors.muted }]}>
                  {comment.length}/200
                </Text>
              </View>

              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={[styles.retakeBtn, { borderColor: colors.border }]}
                  onPress={handleRetake}
                  disabled={uploading}
                >
                  <IconSymbol name="arrow.clockwise" size={20} color={colors.foreground} />
                  <Text style={[styles.retakeBtnText, { color: colors.foreground }]}>
                    撮り直す
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: colors.primary }, uploading && styles.disabledBtn]}
                  onPress={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <IconSymbol name="checkmark.circle.fill" size={20} color="#fff" />
                      <Text style={styles.uploadBtnText}>保存する</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* 撮影済み写真一覧 */}
        {screen === "photos" && (
          <View style={[styles.photosContainer, { backgroundColor: colors.background }]}>
            {loadingPhotos ? (
              <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} size="large" />
            ) : photos.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <IconSymbol name="photo.fill" size={48} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  まだ写真がありません
                </Text>
                <TouchableOpacity
                  style={[styles.goShootBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setScreen("camera")}
                >
                  <IconSymbol name="camera.fill" size={18} color="#fff" />
                  <Text style={styles.goShootBtnText}>撮影する</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={photos}
                keyExtractor={(item) => String(item.id)}
                numColumns={3}
                contentContainerStyle={styles.photoGrid}
                renderItem={({ item }) => (
                  <PhotoThumbnail
                    photo={item}
                    apiBaseUrl={apiBaseUrl}
                    colors={colors}
                  />
                )}
                ListHeaderComponent={
                  <Text style={[styles.photosCount, { color: colors.muted }]}>
                    {photos.length}枚の写真
                  </Text>
                }
              />
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

function PhotoThumbnail({
  photo,
  apiBaseUrl,
  colors,
}: {
  photo: OperationPhoto;
  apiBaseUrl: string;
  colors: ReturnType<typeof useColors>;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const fullUrl = photo.photoUrl.startsWith("http")
    ? photo.photoUrl
    : `${apiBaseUrl}${photo.photoUrl}`;

  const takenAt = photo.takenAt
    ? new Date(photo.takenAt).toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <>
      <TouchableOpacity
        style={[styles.thumbContainer, { borderColor: colors.border }]}
        onPress={() => setShowDetail(true)}
      >
        <Image source={{ uri: fullUrl }} style={styles.thumb} resizeMode="cover" />
        {photo.comment ? (
          <View style={styles.thumbCommentBadge}>
            <IconSymbol name="text.bubble.fill" size={10} color="#fff" />
          </View>
        ) : null}
      </TouchableOpacity>

      {/* 詳細モーダル */}
      <Modal visible={showDetail} transparent animationType="fade">
        <TouchableOpacity
          style={styles.detailOverlay}
          activeOpacity={1}
          onPress={() => setShowDetail(false)}
        >
          <View style={[styles.detailCard, { backgroundColor: colors.background }]}>
            <Image source={{ uri: fullUrl }} style={styles.detailImage} resizeMode="contain" />
            {photo.comment ? (
              <View style={[styles.detailComment, { backgroundColor: colors.surface }]}>
                <IconSymbol name="text.bubble.fill" size={16} color={colors.primary} />
                <Text style={[styles.detailCommentText, { color: colors.foreground }]}>
                  {photo.comment}
                </Text>
              </View>
            ) : null}
            {takenAt ? (
              <Text style={[styles.detailTime, { color: colors.muted }]}>{takenAt}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  // Camera
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  permissionView: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  permissionText: { fontSize: 16, textAlign: "center" },
  permissionBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  permissionBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cameraControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 48,
    paddingHorizontal: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  flipBtn: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
  // Preview
  previewContent: { paddingBottom: 40 },
  previewImage: {
    width: "100%",
    height: SCREEN_WIDTH,
  },
  commentSection: { padding: 16, gap: 8 },
  commentLabel: { fontSize: 15, fontWeight: "600" },
  commentInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: { fontSize: 12, textAlign: "right" },
  previewActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  retakeBtnText: { fontSize: 15, fontWeight: "600" },
  uploadBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  uploadBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  disabledBtn: { opacity: 0.6 },
  // Photos list
  photosContainer: { flex: 1 },
  photoGrid: { padding: 12, gap: 4 },
  photosCount: { fontSize: 13, marginBottom: 8, paddingHorizontal: 4 },
  thumbContainer: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    margin: 2,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
  },
  thumb: { width: "100%", height: "100%" },
  thumbCommentBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    padding: 3,
  },
  emptyPhotos: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 40,
  },
  emptyText: { fontSize: 15 },
  goShootBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  goShootBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  // Detail
  detailOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  detailCard: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  detailImage: {
    width: "100%",
    height: SCREEN_WIDTH - 32,
  },
  detailComment: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
  },
  detailCommentText: { flex: 1, fontSize: 14, lineHeight: 20 },
  detailTime: { fontSize: 12, textAlign: "right", padding: 8 },
});
