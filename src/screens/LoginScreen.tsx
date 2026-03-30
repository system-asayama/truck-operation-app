import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';

interface Props {
  onLoginSuccess: () => void;
}

export default function LoginScreen({ onLoginSuccess }: Props) {
  const { login } = useAuth();
  const [baseUrl, setBaseUrl] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!baseUrl.trim()) {
      Alert.alert('エラー', 'サーバーURLを入力してください');
      return;
    }
    if (!tenantSlug.trim()) {
      Alert.alert('エラー', 'テナントスラッグを入力してください');
      return;
    }
    if (!loginId.trim()) {
      Alert.alert('エラー', 'ログインIDを入力してください');
      return;
    }
    if (!password) {
      Alert.alert('エラー', 'パスワードを入力してください');
      return;
    }

    setLoading(true);
    try {
      const result = await login({
        baseUrl: baseUrl.trim().replace(/\/$/, ''),
        loginId: loginId.trim(),
        password,
        tenantSlug: tenantSlug.trim(),
      });

      if (result.ok) {
        onLoginSuccess();
      } else {
        Alert.alert('ログインエラー', result.error || 'ログインに失敗しました');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.truckIcon}>🚛</Text>
          <Text style={styles.title}>トラック運行管理</Text>
          <Text style={styles.subtitle}>ドライバーログイン</Text>
        </View>

        {/* フォーム */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>サーバーURL</Text>
            <TextInput
              style={styles.input}
              value={baseUrl}
              onChangeText={setBaseUrl}
              placeholder="https://your-server.com"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>テナントスラッグ</Text>
            <TextInput
              style={styles.input}
              value={tenantSlug}
              onChangeText={setTenantSlug}
              placeholder="your-company"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>ログインID</Text>
            <TextInput
              style={styles.input}
              value={loginId}
              onChangeText={setLoginId}
              placeholder="ログインID"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>パスワード</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="パスワード"
              placeholderTextColor="#aaa"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>ログイン</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>ver 1.0.0</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a3a5c',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  truckIcon: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: '#a0c4e8',
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#f9f9f9',
  },
  loginButton: {
    backgroundColor: '#1a3a5c',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  version: {
    textAlign: 'center',
    color: '#a0c4e8',
    marginTop: 24,
    fontSize: 12,
  },
});
