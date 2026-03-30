import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';

interface Props {
  onLogout: () => void;
}

export default function SettingsScreen({ onLogout }: Props) {
  const { auth, logout } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleLogout = () => {
    Alert.alert(
      'ログアウト',
      'ログアウトしますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'ログアウト',
          style: 'destructive',
          onPress: async () => {
            await logout();
            onLogout();
          },
        },
      ]
    );
  };

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* アカウント情報 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>アカウント情報</Text>
        <View style={styles.card}>
          <InfoRow label="ドライバー名" value={auth.name || '---'} />
          <View style={styles.divider} />
          <InfoRow label="スタッフID" value={String(auth.staffId || '---')} />
          <View style={styles.divider} />
          <InfoRow label="テナントID" value={String(auth.tenantId || '---')} />
          <View style={styles.divider} />
          <InfoRow label="スタッフ種別" value={auth.staffType === 'employee' ? '従業員' : '管理者'} />
        </View>
      </View>

      {/* サーバー設定 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>サーバー設定</Text>
        <View style={styles.card}>
          <InfoRow label="サーバーURL" value={auth.baseUrl || '---'} />
          <View style={styles.divider} />
          <InfoRow label="テナントスラッグ" value={auth.tenantSlug || '---'} />
        </View>
      </View>

      {/* GPS設定 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>GPS設定</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>GPS追跡</Text>
            <Text style={[styles.infoValue, { color: auth.gpsEnabled ? '#27ae60' : '#888' }]}>
              {auth.gpsEnabled ? '有効' : '無効'}
            </Text>
          </View>
          <View style={styles.divider} />
          <InfoRow
            label="送信間隔"
            value={auth.gpsEnabled ? `${auth.gpsIntervalSeconds}秒` : '---'}
          />
        </View>
      </View>

      {/* 通知設定 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>通知設定</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>プッシュ通知</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#ddd', true: '#1a3a5c' }}
              thumbColor={notificationsEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>
      </View>

      {/* アプリ情報 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>アプリ情報</Text>
        <View style={styles.card}>
          <InfoRow label="アプリ名" value="トラック運行管理" />
          <View style={styles.divider} />
          <InfoRow label="バージョン" value="1.0.0" />
          <View style={styles.divider} />
          <InfoRow label="開発元" value="Asayama System" />
        </View>
      </View>

      {/* ログアウトボタン */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>ログアウト</Text>
        </TouchableOpacity>
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
  section: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLabel: {
    fontSize: 15,
    color: '#333',
  },
  infoValue: {
    fontSize: 15,
    color: '#666',
    maxWidth: '60%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginLeft: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  switchLabel: {
    fontSize: 15,
    color: '#333',
  },
  logoutButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    height: 40,
  },
});
