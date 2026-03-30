/**
 * 顔認証画面（ライブネス検知付き）
 *
 * なりすまし防止のため、ランダムな動作指示（ウインク・左右向き・うなずき等）を
 * 複数ステップで要求し、各ステップで撮影した画像をサーバーに送信して照合する。
 *
 * フロー:
 *   1. 顔写真登録状況を確認
 *   2. 未登録 → 正面顔写真を撮影して登録
 *   3. 登録済み → ランダムな動作チャレンジ（2〜3ステップ）を実施
 *   4. 全ステップ通過 → 出発打刻へ進む
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { getFaceStatus, registerFace, verifyFace } from '../services/api';

// ─────────────────────────────────────────────
// 動作チャレンジの定義
// ─────────────────────────────────────────────

type ChallengeType =
  | 'face_front'      // 正面を向く
  | 'face_left'       // 左を向く
  | 'face_right'      // 右を向く
  | 'face_up'         // 上を向く
  | 'face_down'       // 下を向く（うなずき）
  | 'wink_left'       // 左目をウインク
  | 'wink_right'      // 右目をウインク
  | 'smile';          // 笑顔

interface Challenge {
  type: ChallengeType;
  label: string;
  icon: string;
  instruction: string;
}

const ALL_CHALLENGES: Challenge[] = [
  {
    type: 'face_front',
    label: '正面を向く',
    icon: '😐',
    instruction: 'カメラを正面から見てください',
  },
  {
    type: 'face_left',
    label: '左を向く',
    icon: '👈',
    instruction: 'ゆっくり左を向いてください',
  },
  {
    type: 'face_right',
    label: '右を向く',
    icon: '👉',
    instruction: 'ゆっくり右を向いてください',
  },
  {
    type: 'face_up',
    label: '上を向く',
    icon: '☝️',
    instruction: 'ゆっくり上を向いてください',
  },
  {
    type: 'face_down',
    label: 'うなずく',
    icon: '👇',
    instruction: 'ゆっくりうなずいてください',
  },
  {
    type: 'wink_left',
    label: '左目をウインク',
    icon: '😉',
    instruction: '左目だけ閉じてウインクしてください',
  },
  {
    type: 'wink_right',
    label: '右目をウインク',
    icon: '😜',
    instruction: '右目だけ閉じてウインクしてください',
  },
  {
    type: 'smile',
    label: '笑顔になる',
    icon: '😄',
    instruction: '大きく笑顔を見せてください',
  },
];

/** ランダムにチャレンジを選択（正面は必ず最初に含める） */
function pickChallenges(count: number = 3): Challenge[] {
  const front = ALL_CHALLENGES.find(c => c.type === 'face_front')!;
  const rest = ALL_CHALLENGES.filter(c => c.type !== 'face_front');
  // rest をシャッフル
  const shuffled = rest.sort(() => Math.random() - 0.5);
  return [front, ...shuffled.slice(0, count - 1)];
}

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

type ScreenMode =
  | 'loading'
  | 'register_intro'    // 初回登録案内
  | 'register_camera'   // 登録用撮影
  | 'challenge_intro'   // チャレンジ開始案内
  | 'challenge'         // チャレンジ実施中
  | 'processing'        // サーバー照合中
  | 'success'           // 認証成功
  | 'failed';           // 認証失敗

interface FaceAuthScreenProps {
  onSuccess: () => void;
  onCancel: () => void;
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

export default function FaceAuthScreen({ onSuccess, onCancel }: FaceAuthScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScreenMode>('loading');
  const [facing, setFacing] = useState<CameraType>('front');
  const [isCapturing, setIsCapturing] = useState(false);

  // チャレンジ管理
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);

  // 結果
  const [resultMessage, setResultMessage] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);

  // カウントダウン（撮影前の猶予）
  const [countdown, setCountdown] = useState<number | null>(null);

  // アニメーション
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const cameraRef = useRef<CameraView>(null);

  // ─── 初期化 ───
  const init = useCallback(async () => {
    setMode('loading');
    try {
      const result = await getFaceStatus();
      if (result.ok && result.registered) {
        // 登録済み → チャレンジ開始
        const picked = pickChallenges(3);
        setChallenges(picked);
        setCurrentStep(0);
        setCapturedImages([]);
        setMode('challenge_intro');
      } else {
        // 未登録 → 登録案内
        setMode('register_intro');
      }
    } catch {
      // 通信エラー時はチャレンジモードで続行
      const picked = pickChallenges(3);
      setChallenges(picked);
      setCurrentStep(0);
      setCapturedImages([]);
      setMode('challenge_intro');
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  // ─── パルスアニメーション（チャレンジ中のガイド枠） ───
  useEffect(() => {
    if (mode === 'challenge') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [mode]);

  // ─── フェードアニメーション（ステップ切替時） ───
  const fadeIn = useCallback(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (mode === 'challenge') fadeIn();
  }, [currentStep, mode]);

  // ─── カウントダウン付き撮影 ───
  const startCountdownAndCapture = useCallback(() => {
    let count = 3;
    setCountdown(count);
    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(timer);
        setCountdown(null);
        capturePhoto();
      }
    }, 1000);
  }, []);

  // ─── 写真撮影 ───
  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.75,
        exif: false,
      });
      if (!photo?.base64) throw new Error('撮影失敗');

      const base64 = photo.base64;

      if (mode === 'register_camera') {
        await handleRegister(base64);
      } else if (mode === 'challenge') {
        await handleChallengeStep(base64);
      }
    } catch (e) {
      Alert.alert('エラー', '撮影に失敗しました。再試行してください。');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, mode, currentStep, challenges, capturedImages]);

  // ─── 顔写真登録 ───
  const handleRegister = async (base64: string) => {
    setMode('processing');
    try {
      const result = await registerFace(base64);
      if (result.ok) {
        Alert.alert(
          '登録完了',
          '顔写真を登録しました。\n続けて本人確認を行います。',
          [{
            text: 'OK',
            onPress: () => {
              const picked = pickChallenges(3);
              setChallenges(picked);
              setCurrentStep(0);
              setCapturedImages([]);
              setMode('challenge_intro');
            },
          }]
        );
      } else {
        Alert.alert('登録失敗', result.message || '顔写真の登録に失敗しました');
        setMode('register_camera');
      }
    } catch {
      Alert.alert('エラー', 'サーバーとの通信に失敗しました');
      setMode('register_camera');
    }
  };

  // ─── チャレンジステップ処理 ───
  const handleChallengeStep = async (base64: string) => {
    const newImages = [...capturedImages, base64];
    setCapturedImages(newImages);

    const isLastStep = currentStep >= challenges.length - 1;

    if (!isLastStep) {
      // 次のステップへ
      setCurrentStep(prev => prev + 1);
      setMode('challenge');
    } else {
      // 全ステップ完了 → サーバーに照合リクエスト
      setMode('processing');
      await handleVerifyAll(newImages);
    }
  };

  // ─── 全ステップ画像をサーバーに送信して照合 ───
  const handleVerifyAll = async (images: string[]) => {
    try {
      // 正面（最初のステップ）の画像で照合
      const frontImage = images[0];
      const result = await verifyFace(frontImage, challenges.map(c => c.type), images);

      if (!result.ok) {
        setResultMessage('サーバーエラーが発生しました');
        setMode('failed');
        return;
      }

      if (result.needs_registration) {
        Alert.alert(
          '顔写真未登録',
          '顔写真が登録されていません。\n先に顔写真を登録してください。',
          [{ text: '登録する', onPress: () => setMode('register_intro') }]
        );
        return;
      }

      setConfidence(result.confidence);
      setResultMessage(result.message);

      if (result.verified) {
        setMode('success');
        setTimeout(() => onSuccess(), 1500);
      } else {
        setMode('failed');
      }
    } catch {
      setResultMessage('サーバーとの通信に失敗しました');
      setMode('failed');
    }
  };

  // ─── リトライ ───
  const handleRetry = () => {
    const picked = pickChallenges(3);
    setChallenges(picked);
    setCurrentStep(0);
    setCapturedImages([]);
    setConfidence(null);
    setResultMessage('');
    setMode('challenge_intro');
  };

  // ─────────────────────────────────────────────
  // レンダリング
  // ─────────────────────────────────────────────

  // カメラ権限未取得
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionTitle}>カメラへのアクセスが必要です</Text>
        <Text style={styles.permissionDesc}>
          顔認証（本人確認）のためにカメラを使用します。
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>カメラを許可する</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── ローディング ───
  if (mode === 'loading' || mode === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <Text style={styles.loadingText}>
          {mode === 'processing' ? '照合中...' : '準備中...'}
        </Text>
      </View>
    );
  }

  // ─── 登録案内 ───
  if (mode === 'register_intro') {
    return (
      <View style={styles.center}>
        <Text style={styles.introIcon}>📸</Text>
        <Text style={styles.introTitle}>顔写真の登録</Text>
        <Text style={styles.introDesc}>
          初回のみ顔写真を登録します。{'\n'}
          明るい場所で正面を向いて撮影してください。
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => setMode('register_camera')}>
          <Text style={styles.primaryButtonText}>撮影する</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── チャレンジ開始案内 ───
  if (mode === 'challenge_intro') {
    return (
      <View style={styles.center}>
        <Text style={styles.introIcon}>🔐</Text>
        <Text style={styles.introTitle}>本人確認</Text>
        <Text style={styles.introDesc}>
          なりすまし防止のため、{'\n'}
          画面の指示に従って動作してください。{'\n\n'}
          全部で {challenges.length} ステップあります。
        </Text>

        {/* チャレンジ内容のプレビュー */}
        <View style={styles.challengePreview}>
          {challenges.map((c, i) => (
            <View key={i} style={styles.challengePreviewItem}>
              <Text style={styles.challengePreviewIcon}>{c.icon}</Text>
              <Text style={styles.challengePreviewLabel}>{c.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setMode('challenge')}
        >
          <Text style={styles.primaryButtonText}>開始する</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── 成功 ───
  if (mode === 'success') {
    return (
      <View style={styles.center}>
        <View style={styles.successIcon}>
          <Text style={styles.resultIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>本人確認完了</Text>
        <Text style={styles.resultDesc}>{resultMessage}</Text>
        {confidence !== null && (
          <Text style={styles.confidenceText}>
            類似度: {Math.round(confidence * 100)}%
          </Text>
        )}
        <ActivityIndicator size="small" color="#34a853" style={{ marginTop: 20 }} />
        <Text style={styles.loadingText}>出発処理中...</Text>
      </View>
    );
  }

  // ─── 失敗 ───
  if (mode === 'failed') {
    return (
      <View style={styles.center}>
        <View style={styles.failedIcon}>
          <Text style={styles.resultIconText}>✗</Text>
        </View>
        <Text style={styles.failedTitle}>本人確認失敗</Text>
        <Text style={styles.resultDesc}>{resultMessage}</Text>
        {confidence !== null && (
          <Text style={styles.confidenceText}>
            類似度: {Math.round(confidence * 100)}%
          </Text>
        )}
        <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
          <Text style={styles.primaryButtonText}>もう一度試す</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── カメラ画面（登録 / チャレンジ） ───
  const isRegisterMode = mode === 'register_camera';
  const currentChallenge = !isRegisterMode ? challenges[currentStep] : null;

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backButton}>
          <Text style={styles.backButtonText}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isRegisterMode ? '顔写真登録' : '本人確認'}
        </Text>
        {!isRegisterMode && (
          <Text style={styles.stepIndicator}>
            {currentStep + 1} / {challenges.length}
          </Text>
        )}
        {isRegisterMode && <View style={{ width: 50 }} />}
      </View>

      {/* ステップインジケーター（チャレンジ時） */}
      {!isRegisterMode && (
        <View style={styles.stepBar}>
          {challenges.map((_, i) => (
            <View
              key={i}
              style={[
                styles.stepDot,
                i < currentStep && styles.stepDotDone,
                i === currentStep && styles.stepDotActive,
              ]}
            />
          ))}
        </View>
      )}

      {/* 動作指示（チャレンジ時） */}
      {currentChallenge && (
        <Animated.View style={[styles.instructionBox, { opacity: fadeAnim }]}>
          <Text style={styles.challengeIcon}>{currentChallenge.icon}</Text>
          <View style={styles.instructionTextBox}>
            <Text style={styles.challengeLabel}>{currentChallenge.label}</Text>
            <Text style={styles.instructionText}>{currentChallenge.instruction}</Text>
          </View>
        </Animated.View>
      )}

      {/* 登録時の案内 */}
      {isRegisterMode && (
        <View style={styles.instructionBox}>
          <Text style={styles.challengeIcon}>😐</Text>
          <View style={styles.instructionTextBox}>
            <Text style={styles.challengeLabel}>正面を向く</Text>
            <Text style={styles.instructionText}>明るい場所で正面から顔を向けてください</Text>
          </View>
        </View>
      )}

      {/* カメラプレビュー */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
        >
          {/* 顔ガイド枠（パルスアニメーション） */}
          <Animated.View
            style={[
              styles.faceGuide,
              { transform: [{ scale: pulseAnim }] },
            ]}
          />

          {/* カウントダウン表示 */}
          {countdown !== null && (
            <View style={styles.countdownOverlay}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          )}
        </CameraView>
      </View>

      {/* 操作ボタン */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.flipButton}
          onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
        >
          <Text style={styles.flipButtonText}>🔄 切替</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureButton, (isCapturing || countdown !== null) && styles.captureButtonDisabled]}
          onPress={startCountdownAndCapture}
          disabled={isCapturing || countdown !== null}
        >
          {isCapturing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : countdown !== null ? (
            <Text style={styles.captureButtonCountdown}>{countdown}</Text>
          ) : (
            <Text style={styles.captureButtonText}>撮影</Text>
          )}
        </TouchableOpacity>

        <View style={{ width: 70 }} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 28,
  },

  // ─── ヘッダー ───
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: '#0d1b2a',
  },
  backButton: { padding: 8 },
  backButtonText: { color: '#aaa', fontSize: 15 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  stepIndicator: { color: '#1a73e8', fontSize: 15, fontWeight: 'bold', minWidth: 50, textAlign: 'right' },

  // ─── ステップバー ───
  stepBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: '#0d1b2a',
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#333',
  },
  stepDotDone: { backgroundColor: '#34a853' },
  stepDotActive: { backgroundColor: '#1a73e8', width: 14, height: 14, borderRadius: 7 },

  // ─── 動作指示 ───
  instructionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 115, 232, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  challengeIcon: { fontSize: 36 },
  instructionTextBox: { flex: 1 },
  challengeLabel: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
  instructionText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },

  // ─── カメラ ───
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  faceGuide: {
    position: 'absolute',
    top: '10%',
    left: '15%',
    right: '15%',
    bottom: '15%',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(26, 115, 232, 0.9)',
    borderStyle: 'dashed',
  },
  countdownOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  countdownText: {
    fontSize: 100,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
  },

  // ─── 操作ボタン ───
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0d1b2a',
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  flipButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    width: 70,
    alignItems: 'center',
  },
  flipButtonText: { color: '#fff', fontSize: 13 },
  captureButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 50,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#1a73e8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  captureButtonDisabled: { backgroundColor: '#444' },
  captureButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  captureButtonCountdown: { color: '#fff', fontSize: 28, fontWeight: 'bold' },

  // ─── 結果画面 ───
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#34a853',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  failedIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#ea4335',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  resultIconText: { color: '#fff', fontSize: 44, fontWeight: 'bold' },
  successTitle: { fontSize: 26, fontWeight: 'bold', color: '#34a853', marginBottom: 8 },
  failedTitle: { fontSize: 26, fontWeight: 'bold', color: '#ea4335', marginBottom: 8 },
  resultDesc: { fontSize: 15, color: '#444', textAlign: 'center', marginBottom: 8, lineHeight: 22 },
  confidenceText: { fontSize: 14, color: '#888', marginBottom: 20 },

  // ─── 案内画面 ───
  introIcon: { fontSize: 64, marginBottom: 16 },
  introTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a3a5c', marginBottom: 12 },
  introDesc: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  challengePreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 28,
    backgroundColor: '#f0f4f8',
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  challengePreviewItem: { alignItems: 'center', width: 80 },
  challengePreviewIcon: { fontSize: 32, marginBottom: 4 },
  challengePreviewLabel: { fontSize: 12, color: '#555', textAlign: 'center' },

  // ─── 共通ボタン ───
  primaryButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 10,
    paddingHorizontal: 36,
    paddingVertical: 14,
    marginTop: 8,
    minWidth: 220,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#1a73e8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  cancelButton: { paddingHorizontal: 36, paddingVertical: 14, marginTop: 4 },
  cancelButtonText: { color: '#999', fontSize: 15 },

  // ─── その他 ───
  loadingText: { marginTop: 14, fontSize: 16, color: '#666' },
  permissionTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 12, textAlign: 'center' },
  permissionDesc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
});
