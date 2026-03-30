/**
 * ホーム画面（運行ダッシュボード）
 * 出発ボタンを押すと顔認証画面を表示し、認証成功後に出発打刻を行う。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { getTodayAttendance, clockIn, clockOut, breakStart, breakEnd } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useGpsTracking } from '../hooks/useGpsTracking';
import { AttendanceStatus } from '../types';
import FaceAuthScreen from './FaceAuthScreen';

function getStatusLabel(status: AttendanceStatus): string {
  switch (status) {
    case 'not_started': return '運行前';
    case 'working': return '運行中';
    case 'on_break': return '休憩中';
    case 'finished': return '運行終了';
  }
}

function getStatusColor(status: AttendanceStatus): string {
  switch (status) {
    case 'not_started': return '#888';
    case 'working': return '#27ae60';
    case 'on_break': return '#f39c12';
    case 'finished': return '#2980b9';
  }
}

function parseAttendanceStatus(rec: any): AttendanceStatus {
  if (!rec || !rec.clock_in) return 'not_started';
  if (rec.clock_out) return 'finished';
  if (rec.break_start && !rec.break_end) return 'on_break';
  return 'working';
}

export default function HomeScreen() {
  const { auth } = useAuth();
  const [attendance, setAttendance] = useState<any>(null);
  const [status, setStatus] = useState<AttendanceStatus>('not_started');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // 顔認証モーダル制御
  const [showFaceAuth, setShowFaceAuth] = useState(false);

  const { isTracking, lastLocation, startTracking, stopTracking } = useGpsTracking({
    enabled: auth.gpsEnabled,
    intervalSeconds: auth.gpsIntervalSeconds,
    attendanceId: attendance?.id,
  });

  // 現在時刻の更新
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadAttendance = useCallback(async () => {
    try {
      const result = await getTodayAttendance();
      if (result.ok) {
        setAttendance(result.attendance || null);
        setStatus(parseAttendanceStatus(result.attendance));
      }
    } catch (e) {
      console.error('勤怠情報取得エラー:', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAttendance();
      setLoading(false);
    })();
  }, [loadAttendance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAttendance();
    setRefreshing(false);
  }, [loadAttendance]);

  // 出発ボタン押下 → 顔認証モーダルを表示
  const handleClockInPress = () => {
    setShowFaceAuth(true);
  };

  // 顔認証成功 → 実際の出発打刻処理
  const handleFaceAuthSuccess = async () => {
    setShowFaceAuth(false);
    setActionLoading(true);
    try {
      const result = await clockIn();
      if (result.ok) {
        await loadAttendance();
        if (auth.gpsEnabled) {
          await startTracking();
        }
        Alert.alert('出発しました', `出発時刻: ${result.clock_in}`);
      } else {
        Alert.alert('エラー', result.error || '出発処理に失敗しました');
      }
    } catch (e: any) {
      Alert.alert('エラー', 'サーバーに接続できません');
    } finally {
      setActionLoading(false);
    }
  };

  // 顔認証キャンセル
  const handleFaceAuthCancel = () => {
    setShowFaceAuth(false);
  };

  // 帰着（退勤）
  const handleClockOut = async () => {
    Alert.alert(
      '帰着確認',
      '帰着（運行終了）しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '帰着する',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const result = await clockOut();
              if (result.ok) {
                await stopTracking();
                await loadAttendance();
                Alert.alert('帰着しました', `帰着時刻: ${result.clock_out}`);
              } else {
                Alert.alert('エラー', result.error || '帰着処理に失敗しました');
              }
            } catch (e) {
              Alert.alert('エラー', 'サーバーに接続できません');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // 休憩開始
  const handleBreakStart = async () => {
    setActionLoading(true);
    try {
      const result = await breakStart();
      if (result.ok) {
        await loadAttendance();
        Alert.alert('休憩開始', `休憩開始時刻: ${result.break_start}`);
      } else {
        Alert.alert('エラー', result.error || '休憩開始に失敗しました');
      }
    } catch (e) {
      Alert.alert('エラー', 'サーバーに接続できません');
    } finally {
      setActionLoading(false);
    }
  };

  // 休憩終了
  const handleBreakEnd = async () => {
    setActionLoading(true);
    try {
      const result = await breakEnd();
      if (result.ok) {
        await loadAttendance();
        Alert.alert('休憩終了', `休憩時間: ${result.break_minutes}分`);
      } else {
        Alert.alert('エラー', result.error || '休憩終了に失敗しました');
      }
    } catch (e) {
      Alert.alert('エラー', 'サーバーに接続できません');
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '--:--';
    return timeStr;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a3a5c" />
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 現在時刻 */}
        <View style={styles.timeCard}>
          <Text style={styles.currentTime}>
            {currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
          <Text style={styles.currentDate}>
            {currentTime.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
          </Text>
        </View>

        {/* ドライバー情報 */}
        <View style={styles.driverCard}>
          <Text style={styles.driverLabel}>ドライバー</Text>
          <Text style={styles.driverName}>{auth.name || 'ドライバー'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
            <Text style={styles.statusText}>{getStatusLabel(status)}</Text>
          </View>
        </View>

        {/* 運行情報 */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>本日の運行記録</Text>
          <View style={styles.timeRow}>
            <View style={styles.timeItem}>
              <Text style={styles.timeLabel}>🚀 出発</Text>
              <Text style={styles.timeValue}>{formatTime(attendance?.clock_in)}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeItem}>
              <Text style={styles.timeLabel}>🏁 帰着</Text>
              <Text style={styles.timeValue}>{formatTime(attendance?.clock_out)}</Text>
            </View>
          </View>
          <View style={styles.breakRow}>
            <Text style={styles.breakLabel}>休憩時間</Text>
            <Text style={styles.breakValue}>{attendance?.break_minutes || 0}分</Text>
          </View>
        </View>

        {/* GPS状態 */}
        {auth.gpsEnabled && (
          <View style={styles.gpsCard}>
            <View style={styles.gpsHeader}>
              <Text style={styles.cardTitle}>GPS追跡</Text>
              <View style={[styles.gpsBadge, { backgroundColor: isTracking ? '#27ae60' : '#888' }]}>
                <Text style={styles.gpsBadgeText}>{isTracking ? '追跡中' : '停止中'}</Text>
              </View>
            </View>
            {lastLocation && (
              <Text style={styles.gpsInfo}>
                最終取得: {lastLocation.timestamp ? new Date(lastLocation.timestamp).toLocaleTimeString('ja-JP') : '--'}
                {'\n'}緯度: {lastLocation.latitude.toFixed(6)}
                {'\n'}経度: {lastLocation.longitude.toFixed(6)}
              </Text>
            )}
            <Text style={styles.gpsInterval}>
              送信間隔: {auth.gpsIntervalSeconds}秒
            </Text>
          </View>
        )}

        {/* アクションボタン */}
        <View style={styles.actionArea}>
          {status === 'not_started' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.clockInButton]}
              onPress={handleClockInPress}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Text style={styles.actionButtonIcon}>🚛</Text>
                  <Text style={styles.actionButtonText}>出発する</Text>
                  <Text style={styles.actionButtonSubText}>（顔認証あり）</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {status === 'working' && (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.breakButton, styles.halfButton]}
                onPress={handleBreakStart}
                disabled={actionLoading}
              >
                {actionLoading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Text style={styles.actionButtonIcon}>☕</Text>
                    <Text style={styles.actionButtonText}>休憩開始</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.clockOutButton, styles.halfButton]}
                onPress={handleClockOut}
                disabled={actionLoading}
              >
                {actionLoading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Text style={styles.actionButtonIcon}>🏁</Text>
                    <Text style={styles.actionButtonText}>帰着する</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {status === 'on_break' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.breakEndButton]}
              onPress={handleBreakEnd}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Text style={styles.actionButtonIcon}>▶️</Text>
                  <Text style={styles.actionButtonText}>休憩終了・運行再開</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {status === 'finished' && (
            <View style={styles.finishedCard}>
              <Text style={styles.finishedIcon}>✅</Text>
              <Text style={styles.finishedText}>本日の運行は終了しました</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 顔認証モーダル */}
      <Modal
        visible={showFaceAuth}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleFaceAuthCancel}
      >
        <FaceAuthScreen
          onSuccess={handleFaceAuthSuccess}
          onCancel={handleFaceAuthCancel}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
  },
  timeCard: {
    backgroundColor: '#1a3a5c',
    padding: 24,
    alignItems: 'center',
  },
  currentTime: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 2,
  },
  currentDate: {
    fontSize: 16,
    color: '#a0c4e8',
    marginTop: 4,
  },
  driverCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  driverLabel: {
    fontSize: 14,
    color: '#888',
    marginRight: 8,
  },
  driverName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a3a5c',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  infoCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a3a5c',
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeItem: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a3a5c',
  },
  timeDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#eee',
  },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  breakLabel: {
    fontSize: 14,
    color: '#888',
  },
  breakValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f39c12',
  },
  gpsCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  gpsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gpsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  gpsBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  gpsInfo: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
    marginBottom: 4,
  },
  gpsInterval: {
    fontSize: 12,
    color: '#888',
  },
  actionArea: {
    margin: 16,
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  halfButton: {
    flex: 1,
  },
  clockInButton: {
    backgroundColor: '#27ae60',
  },
  clockOutButton: {
    backgroundColor: '#e74c3c',
  },
  breakButton: {
    backgroundColor: '#f39c12',
  },
  breakEndButton: {
    backgroundColor: '#2980b9',
  },
  actionButtonIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionButtonSubText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  finishedCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  finishedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  finishedText: {
    fontSize: 18,
    color: '#2980b9',
    fontWeight: 'bold',
  },
});
