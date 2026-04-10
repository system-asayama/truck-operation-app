import { useEffect, useState, useCallback } from "react";
import { getAdminInfo, getDrivers, type Driver } from "../lib/api";

export default function Drivers() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const info = getAdminInfo();
    if (!info) return;
    setLoading(true);
    setError("");
    try {
      const res = await getDrivers(info);
      if (res.ok) setDrivers(res.drivers ?? []);
      else setError(res.error ?? "データ取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>ドライバー管理</h2>
        <button style={styles.refreshBtn} onClick={load} disabled={loading}>🔄 更新</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>読み込み中...</div>
      ) : drivers.length === 0 ? (
        <div style={styles.empty}>ドライバーが登録されていません</div>
      ) : (
        <div style={styles.tableCard}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.th}>名前</th>
                <th style={styles.th}>ログインID</th>
                <th style={styles.th}>種別</th>
                <th style={styles.th}>状態</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={styles.driverName}>
                      <span style={styles.avatar}>{d.name.charAt(0)}</span>
                      {d.name}
                    </div>
                  </td>
                  <td style={styles.td}>{d.loginId}</td>
                  <td style={styles.td}>{d.staffType === "employee" ? "従業員" : "管理者"}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: d.active ? "#16a34a" : "#6b7280" }}>
                      {d.active ? "有効" : "無効"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  tableCard: { background: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#f9fafb" },
  th: { padding: "10px 14px", textAlign: "left", fontSize: "13px", fontWeight: "600", color: "#6b7280", borderBottom: "1px solid #e5e7eb" },
  tr: { borderBottom: "1px solid #f3f4f6" },
  td: { padding: "12px 14px", fontSize: "14px", color: "#374151" },
  driverName: { display: "flex", alignItems: "center", gap: "10px" },
  avatar: {
    width: "32px", height: "32px", borderRadius: "50%",
    background: "linear-gradient(135deg, #1a3a5c, #2563eb)",
    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "14px", fontWeight: "700", flexShrink: 0,
  },
  badge: { display: "inline-block", padding: "3px 10px", borderRadius: "20px", color: "#fff", fontSize: "12px", fontWeight: "600" },
};
