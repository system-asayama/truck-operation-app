import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { getTodayAttendance, clockIn, clockOut, breakStart, breakEnd } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useGpsTracking } from '../hooks/useGpsTracking';
import { AttendanceStatus } from '../types';

function parseAttendanceStatus(rec: any): AttendanceStatus {
  if (!rec || !rec.clock_in) return 'not_started';
  if (rec.clock_out) return 'finished';
  if (rec.break_start && !rec.break_end) return 'on_break';
  return 'working';
}

function calcWorkingMinutes(clockIn: string | null, clockOut: string | null, breakMinutes: number): number {
  if (!clockIn) return 0;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const inTime = new Date(`${today}T${clockIn}:00`);
  const outTime = clockOut ? new Date(`${today}T${clockOut}:00`) : now;
  const totalMinutes = Math.floor((outTime.getTime() - inTime.getTime()) / 60000);
  return Math.max(0, totalMinutes - (breakMinutes || 0));
}

export default function OperationScreen() {
  const { auth } = useAuth();
  const [attendance, setAttendance] = useState<any>(null);
  const [status, setStatus] = useState<AttendanceStatus>('not_started');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState('');
  const [workingMinutes, setWorkingMinutes] = useState(0);

  const { isTracking, lastLocation, startTracking, stopTracking, sendCurrentLocation } = useGpsTracking({
    enabled: auth.gpsEnabled,
    intervalSeconds: auth.gpsIntervalSeconds,
    attendanceId: attendance?.id,
  });

  const loadAttendance = useCallback(async () => {
    try {
      const result = await getTodayAttendance();
      if (result.ok) {
        setAttendance(result.attendance || null);
        setStatus(parseAttendanceStatus(result.attendance));
        if (result.attendance?.note) {
          setNote(result.attendance.note);
        }
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

  // 稼働時間の更新
  useEffect(() => {
    const timer = setInterval(() => {
      if (attendance?.clock_in && !attendance?.clock_out) {
        setWorkingMinutes(calcWorkingMinutes(
          attendance.clock_in,
          attendance.clock_out,
          attendance.break_minutes || 0
        ));
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [attendance]);

  useEffect(() => {
    if (attendance?.clock_in) {
      setWorkingMinutes(calcWorkingMinutes(
        attendance.clock_in,
        attendance.clock_out,
        attendance.break_minutes || 0
      ));
    }
  }, [attendance]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAttendance();
    setRefreshing(false);
  }, [loadAttendance]);

  const handleClockIn = async () => {
    setActionLoading(true);
    try {
      const result = await clockIn();
      if (result.ok) {
        await loadAttendance();
        if (auth.gpsEnabled) await startTracking();
        Alert.alert('出発しました', `出発時刻: ${result.clock_in}`);
      } else {
        Alert.alert('エラー', result.error || '出発処理に失敗しました');
      }
    } catch (e) {
      Alert.alert('エラー', 'サーバーに接続できません');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    Alert.alert('帰着確認', '帰着（運行終了）しますか？', [
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
    ]);
  };

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

  const handleManualGps = async () => {
    if (!isTracking) {
      Alert.alert('GPS未追跡', '運行中のみGPS送信が可能です');
      return;
    }
    await sendCurrentLocation(false);
    Alert.alert('送信完了', '現在位置を送信しました');
  };

  const formatHoursMinutes = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}時間${m}分`;
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
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* 運行ステータス */}
      <View style={styles.statusHeader}>
        <Text style={styles.statusTitle}>運行状況</Text>
        <View style={[
          styles.statusIndicator,
          {
            backgroundColor:
              status === 'working' ? '#27ae60' :
              status === 'on_break' ? '#f39c12' :
              status === 'finished' ? '#2980b9' : '#888'
          }
        ]}>
          <Text style={styles.statusIndicatorText}>
            {status === 'not_started' ? '運行前' :
             status === 'working' ? '運行中' :
             status === 'on_break' ? '休憩中' : '運行終了'}
          </Text>
        </View>
      </View>

      {/* タイムライン */}
      <View style={styles.timelineCard}>
        <Text style={styles.cardTitle}>タイムライン</Text>

        <View style={styles.timelineItem}>
          <View style={[styles.timelineDot, { backgroundColor: attendance?.clock_in ? '#27ae60' : '#ddd' }]} />
          <View style={styles.timelineContent}>
            <Text style={styles.timelineLabel}>🚀 出発</Text>
            <Text style={styles.timelineTime}>{attendance?.clock_in || '--:--'}</Text>
          </View>
        </View>

        {(attendance?.break_start) && (
          <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: '#f39c12' }]} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineLabel}>☕ 休憩開始</Text>
              <Text style={styles.timelineTime}>{attendance.break_start}</Text>
            </View>
          </View>
        )}

        {(attendance?.break_end) && (
          <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: '#2980b9' }]} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineLabel}>▶️ 運行再開</Text>
              <Text style={styles.timelineTime}>{attendance.break_end}</Text>
            </View>
          </View>
        )}

        {attendance?.clock_out && (
          <View style={styles.timelineItem}>
            <View style={[styles.timelineDot, { backgroundColor: '#e74c3c' }]} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineLabel}>🏁 帰着</Text>
              <Text style={styles.timelineTime}>{attendance.clock_out}</Text>
            </View>
          </View>
        )}
      </View>

      {/* 稼働時間サマリー */}
      {attendance?.clock_in && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>稼働時間</Text>
            <Text style={styles.summaryValue}>{formatHoursMinutes(workingMinutes)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>休憩時間</Text>
            <Text style={styles.summaryValue}>{attendance?.break_minutes || 0}分</Text>
          </View>
        </View>
      )}

      {/* GPS手動送信 */}
      {auth.gpsEnabled && status === 'working' && (
        <View style={styles.gpsManualCard}>
          <View style={styles.gpsManualHeader}>
            <Text style={styles.cardTitle}>GPS位置情報</Text>
            <View style={[styles.gpsStatus, { backgroundColor: isTracking ? '#27ae60' : '#888' }]}>
              <Text style={styles.gpsStatusText}>{isTracking ? '追跡中' : '停止'}</Text>
            </View>
          </View>
          {lastLocation && (
            <Text style={styles.lastLocationText}>
              最終送信: {new Date(lastLocation.timestamp).toLocaleTimeString('ja-JP')}
            </Text>
          )}
          <TouchableOpacity style={styles.manualGpsButton} onPress={handleManualGps}>
            <Text style={styles.manualGpsButtonText}>📍 現在位置を手動送信</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 備考入力 */}
      <View style={styles.noteCard}>
        <Text style={styles.cardTitle}>運行メモ</Text>
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="特記事項・報告事項を入力..."
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* アクションボタン */}
      <View style={styles.actionArea}>
        {status === 'not_started' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.clockInButton]}
            onPress={handleClockIn}
            disabled={actionLoading}
          >
            {actionLoading ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.actionButtonText}>🚛 出発する</Text>
            )}
          </TouchableOpacity>
        )}

        {status === 'working' && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.breakButton]}
              onPress={handleBreakStart}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.actionButtonText}>☕ 休憩開始</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.clockOutButton]}
              onPress={handleClockOut}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.actionButtonText}>🏁 帰着する</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {status === 'on_break' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.breakEndButton]}
            onPress={handleBreakEnd}
            disabled={actionLoading}
          >
            {actionLoading ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.actionButtonText}>▶️ 休憩終了・運行再開</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.footer} />
    </ScrollView>
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
  statusHeader: {
    backgroundColor: '#1a3a5c',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusIndicator: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusIndicatorText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  timelineCard: {
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
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  timelineContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 15,
    color: '#333',
  },
  timelineTime: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a3a5c',
  },
  summaryCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a3a5c',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#eee',
  },
  gpsManualCard: {
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
  gpsManualHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gpsStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  gpsStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  lastLocationText: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
  },
  manualGpsButton: {
    backgroundColor: '#f0f4f8',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a3a5c',
  },
  manualGpsButtonText: {
    color: '#1a3a5c',
    fontSize: 15,
    fontWeight: '600',
  },
  noteCard: {
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
  noteInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#333',
    minHeight: 100,
    backgroundColor: '#f9f9f9',
  },
  actionArea: {
    margin: 16,
    gap: 12,
  },
  actionButton: {
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
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
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footer: {
    height: 40,
  },
});
