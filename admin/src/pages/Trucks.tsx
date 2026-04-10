import { useEffect, useState, useCallback } from "react";
import { getAdminInfo, getTrucks, type Truck } from "../lib/api";

export default function Trucks() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const info = getAdminInfo();
    if (!info) return;
    setLoading(true);
    setError("");
    try {
      const res = await getTrucks(info);
      if (res.ok) setTrucks(res.trucks ?? []);
      else setError(res.error ?? "データ取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { available: "待機中", in_use: "使用中", maintenance: "整備中", inactive: "停止中" };
    return map[s] ?? s;
  };
  const statusColor = (s: string) => {
    const map: Record<string, string> = { available: "#16a34a", in_use: "#2563eb", maintenance: "#d97706", inactive: "#6b7280" };
    return map[s] ?? "#6b7280";
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>トラック管理</h2>
        <button style={styles.refreshBtn} onClick={load} disabled={loading}>🔄 更新</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>読み込み中...</div>
      ) : trucks.length === 0 ? (
        <div style={styles.empty}>トラックが登録されていません</div>
      ) : (
        <div style={styles.grid}>
          {trucks.map(t => (
            <div key={t.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.truckIcon}>🚛</span>
                <span style={{ ...styles.statusBadge, background: statusColor(t.status) }}>
                  {statusLabel(t.status)}
                </span>
              </div>
              <div style={styles.truckName}>{t.truckName}</div>
              <div style={styles.truckNumber}>{t.truckNumber}</div>
              {t.capacity && (
                <div style={styles.capacity}>積載量: {t.capacity}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" },
  title: { fontSize: "22px", fontWeight: "700", color: "#0f2744", margin: 0 },
  refreshBtn: { background: "#1a3a5c", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", fontSize: "14px", cursor: "pointer" },
  error: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", color: "#dc2626", fontSize: "14px", marginBottom: "16px" },
  loading: { textAlign: "center", padding: "60px", color: "#9ca3af" },
  empty: { textAlign: "center", padding: "60px", color: "#9ca3af", fontSize: "14px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" },
  card: { background: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" },
  truckIcon: { fontSize: "32px" },
  statusBadge: { display: "inline-block", padding: "3px 10px", borderRadius: "20px", color: "#fff", fontSize: "12px", fontWeight: "600" },
  truckName: { fontSize: "16px", fontWeight: "700", color: "#0f2744", marginBottom: "4px" },
  truckNumber: { fontSize: "14px", color: "#6b7280", marginBottom: "4px" },
  capacity: { fontSize: "13px", color: "#9ca3af" },
};
