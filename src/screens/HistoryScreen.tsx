import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { getTodayLocations } from '../services/api';

interface LocationItem {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  is_background: boolean;
  recorded_at: string;
}

export default function HistoryScreen() {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [count, setCount] = useState(0);

  const loadLocations = useCallback(async () => {
    try {
      const result = await getTodayLocations();
      if (result.ok) {
        setLocations(result.locations || []);
        setCount(result.count || 0);
      }
    } catch (e) {
      console.error('位置情報取得エラー:', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadLocations();
      setLoading(false);
    })();
  }, [loadLocations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLocations();
    setRefreshing(false);
  }, [loadLocations]);

  const renderItem = ({ item, index }: { item: LocationItem; index: number }) => (
    <View style={styles.locationItem}>
      <View style={styles.locationIndex}>
        <Text style={styles.indexText}>{count - index}</Text>
      </View>
      <View style={styles.locationContent}>
        <View style={styles.locationHeader}>
          <Text style={styles.locationTime}>{item.recorded_at}</Text>
          {item.is_background && (
            <View style={styles.bgBadge}>
              <Text style={styles.bgBadgeText}>BG</Text>
            </View>
          )}
        </View>
        <Text style={styles.locationCoords}>
          緯度: {item.latitude.toFixed(6)}  経度: {item.longitude.toFixed(6)}
        </Text>
        {item.accuracy !== null && (
          <Text style={styles.locationAccuracy}>精度: ±{Math.round(item.accuracy)}m</Text>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a3a5c" />
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ヘッダー情報 */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>本日のGPS記録</Text>
        <Text style={styles.summaryCount}>{count}件</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Text style={styles.refreshButtonText}>更新</Text>
        </TouchableOpacity>
      </View>

      {locations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyText}>本日のGPS記録はありません</Text>
          <Text style={styles.emptySubText}>運行を開始するとGPS位置が記録されます</Text>
        </View>
      ) : (
        <FlatList
          data={[...locations].reverse()} // 新しい順に表示
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
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
  summaryCard: {
    backgroundColor: '#1a3a5c',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  summaryCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#a0c4e8',
    marginRight: 12,
  },
  refreshButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
  },
  locationItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  locationIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a3a5c',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  indexText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  locationContent: {
    flex: 1,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  locationTime: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a3a5c',
    flex: 1,
  },
  bgBadge: {
    backgroundColor: '#888',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bgBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  locationCoords: {
    fontSize: 13,
    color: '#555',
    marginBottom: 2,
  },
  locationAccuracy: {
    fontSize: 12,
    color: '#888',
  },
  separator: {
    height: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});
