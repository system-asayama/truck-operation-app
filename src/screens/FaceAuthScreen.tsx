/**
 * 顔認証画面
 * 出発打刻前に本人確認を行う。
 * - 初回: 顔写真を登録
 * - 2回目以降: 撮影した顔とサーバー登録済み顔を照合
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
  ScrollView,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { getFaceStatus, registerFace, verifyFace } from '../services/api';

type FaceAuthMode = 'loading' | 'check_status' | 'register' | 'verify' | 'success' | 'failed';

interface FaceAuthScreenProps {
  onSuccess: () => void;   // 認証成功時のコールバック
  onCancel: () => void;    // キャンセル時のコールバック
}

export default function FaceAuthScreen({ onSuccess, onCancel }: FaceAuthScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<FaceAuthMode>('loading');
  const [facing, setFacing] = useState<CameraType>('front');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const cameraRef = useRef<CameraView>(null);

  // 顔写真の登録状況を確認
  const checkFaceStatus = useCallback(async () => {
    setMode('loading');
    try {
      const result = await getFaceStatus();
      if (result.ok) {
        setMode(result.registered ? 'verify' : 'register');
      } else {
        Alert.alert('エラー', 'サーバーとの通信に失敗しました');
        setMode('verify'); // フォールバック: 認証モードで続行
      }
    } catch (e) {
      console.error('getFaceStatus error:', e);
      setMode('verify'); // フォールバック
    }
  }, []);

  useEffect(() => {
    checkFaceStatus();
  }, [checkFaceStatus]);

  // カメラ権限の確認
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <Text style={styles.loadingText}>カメラ権限を確認中...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionTitle}>カメラへのアクセスが必要です</Text>
        <Text style={styles.permissionDesc}>
          顔認証のためにカメラを使用します。{'\n'}
          許可してください。
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

  // ローディング中
  if (mode === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <Text style={styles.loadingText}>準備中...</Text>
      </View>
    );
  }

  // 撮影実行
  const takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;
    setIsProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
        exif: false,
      });
      if (photo?.base64) {
        setCapturedImage(`data:image/jpeg;base64,${photo.base64}`);
        if (mode === 'register') {
          await handleRegister(photo.base64);
        } else {
          await handleVerify(photo.base64);
        }
      }
    } catch (e) {
      console.error('takePicture error:', e);
      Alert.alert('エラー', '撮影に失敗しました。再試行してください。');
    } finally {
      setIsProcessing(false);
    }
  };

  // 顔写真登録
  const handleRegister = async (base64: string) => {
    setIsProcessing(true);
    try {
      const result = await registerFace(base64);
      if (result.ok) {
        Alert.alert(
          '登録完了',
          '顔写真を登録しました。\n次回から顔認証で出発できます。',
          [{ text: 'OK', onPress: () => { setMode('verify'); setCapturedImage(null); } }]
        );
      } else {
        Alert.alert('登録失敗', result.message || '顔写真の登録に失敗しました');
        setCapturedImage(null);
      }
    } catch (e) {
      Alert.alert('エラー', 'サーバーとの通信に失敗しました');
      setCapturedImage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // 顔認証実行
  const handleVerify = async (base64: string) => {
    setIsProcessing(true);
    try {
      const result = await verifyFace(base64);
      if (!result.ok) {
        setResultMessage('サーバーエラーが発生しました');
        setMode('failed');
        return;
      }

      if (result.needs_registration) {
        Alert.alert(
          '顔写真未登録',
          '顔写真が登録されていません。\n先に顔写真を登録してください。',
          [
            { text: '登録する', onPress: () => { setMode('register'); setCapturedImage(null); } },
            { text: 'スキップ', onPress: onSuccess }, // 開発用スキップ
          ]
        );
        return;
      }

      setConfidence(result.confidence);
      setResultMessage(result.message);

      if (result.verified) {
        setMode('success');
        // 1.5秒後に自動で次の処理へ
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setMode('failed');
      }
    } catch (e) {
      setResultMessage('サーバーとの通信に失敗しました');
      setMode('failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // 成功画面
  if (mode === 'success') {
    return (
      <View style={styles.center}>
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>本人確認完了</Text>
        <Text style={styles.successDesc}>{resultMessage}</Text>
        {confidence !== null && (
          <Text style={styles.confidenceText}>
            類似度: {Math.round(confidence * 100)}%
          </Text>
        )}
        <ActivityIndicator size="small" color="#34a853" style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>出発処理中...</Text>
      </View>
    );
  }

  // 失敗画面
  if (mode === 'failed') {
    return (
      <View style={styles.center}>
        <View style={styles.failedIcon}>
          <Text style={styles.failedIconText}>✗</Text>
        </View>
        <Text style={styles.failedTitle}>本人確認失敗</Text>
        <Text style={styles.failedDesc}>{resultMessage}</Text>
        {confidence !== null && (
          <Text style={styles.confidenceText}>
            類似度: {Math.round(confidence * 100)}%
          </Text>
        )}
        {capturedImage && (
          <Image source={{ uri: capturedImage }} style={styles.capturedPreview} />
        )}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => { setMode('verify'); setCapturedImage(null); setConfidence(null); }}
        >
          <Text style={styles.primaryButtonText}>再撮影する</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // カメラ撮影画面（register / verify）
  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backButton}>
          <Text style={styles.backButtonText}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {mode === 'register' ? '顔写真登録' : '顔認証'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* 説明テキスト */}
      <View style={styles.instructionBox}>
        <Text style={styles.instructionText}>
          {mode === 'register'
            ? '顔写真を登録します。\n正面を向いて「撮影」ボタンを押してください。'
            : '顔認証で本人確認を行います。\n正面を向いて「撮影」ボタンを押してください。'}
        </Text>
      </View>

      {/* カメラプレビュー */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
        >
          {/* 顔ガイド枠 */}
          <View style={styles.faceGuide}>
            <View style={styles.faceGuideInner} />
          </View>
        </CameraView>
      </View>

      {/* 操作ボタン */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.flipButton}
          onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
        >
          <Text style={styles.flipButtonText}>カメラ切替</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
          onPress={takePicture}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.captureButtonText}>撮影</Text>
          )}
        </TouchableOpacity>

        {mode === 'verify' && (
          <TouchableOpacity
            style={styles.registerLinkButton}
            onPress={() => { setMode('register'); setCapturedImage(null); }}
          >
            <Text style={styles.registerLinkText}>写真を再登録</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#1a1a2e',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  instructionBox: {
    backgroundColor: 'rgba(26, 115, 232, 0.9)',
    padding: 12,
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  faceGuide: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceGuideInner: {
    width: 220,
    height: 280,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderStyle: 'dashed',
  },
  controls: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 12,
  },
  captureButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 50,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  captureButtonDisabled: {
    backgroundColor: '#666',
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  flipButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  flipButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  registerLinkButton: {
    padding: 8,
  },
  registerLinkText: {
    color: '#aaa',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  // 成功・失敗画面
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#34a853',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successIconText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#34a853',
    marginBottom: 8,
  },
  successDesc: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  failedIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ea4335',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  failedIconText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  failedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ea4335',
    marginBottom: 8,
  },
  failedDesc: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  confidenceText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  capturedPreview: {
    width: 120,
    height: 150,
    borderRadius: 8,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
});
