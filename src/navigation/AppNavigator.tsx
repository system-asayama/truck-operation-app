import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import OperationScreen from '../screens/OperationScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useAuth } from '../hooks/useAuth';
import { RootStackParamList, MainTabParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '🏠',
    Operation: '🚛',
    History: '📍',
    Settings: '⚙️',
  };
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>
      {icons[name] || '●'}
    </Text>
  );
}

function MainTabs({ onLogout }: { onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: '#1a3a5c',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e0e0e0',
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#1a3a5c',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 18,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'ホーム', tabBarLabel: 'ホーム' }}
      />
      <Tab.Screen
        name="Operation"
        component={OperationScreen}
        options={{ title: '運行管理', tabBarLabel: '運行' }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'GPS履歴', tabBarLabel: '履歴' }}
      />
      <Tab.Screen
        name="Settings"
        options={{ title: '設定', tabBarLabel: '設定' }}
      >
        {() => <SettingsScreen onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { auth, loading } = useAuth();
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!loading) {
      setIsLoggedIn(!!auth.staffToken);
    }
  }, [loading, auth.staffToken]);

  if (loading || isLoggedIn === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a3a5c' }}>
        <Text style={{ fontSize: 48 }}>🚛</Text>
        <Text style={{ color: '#fff', fontSize: 20, marginTop: 12, fontWeight: 'bold' }}>
          トラック運行管理
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isLoggedIn ? (
          <Stack.Screen name="Login">
            {() => <LoginScreen onLoginSuccess={() => setIsLoggedIn(true)} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Main">
            {() => <MainTabs onLogout={() => setIsLoggedIn(false)} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
