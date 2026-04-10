import { useEffect, useState, useCallback } from "react";
import {
  getAdminInfo,
  getTodayOperations,
  getTrucks,
  getDrivers,
  type TruckOperation,
  type Truck,
  type Driver,
  formatStatus,
  getStatusColor,
  calcDuration,
} from "../lib/api";

export default function Dashboard() {
  const [operations, setOperations] = useState<TruckOperation[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const info = getAdminInfo();
    if (!info) return;
    setLoading(true);
    setError("");
    try {
      const [opRes, truckRes, driverRes] = await Promise.all([
        getTodayOperations(info),
        getTrucks(info),
        getDrivers(info),
      ]);
      if (opRes.ok) setOperations(opRes.operations ?? []);
      else setError(opRes.error ?? "データ取得失敗");
      if (truckRes.ok) setTrucks(truckRes.trucks ?? []);
      if (driverRes.ok) setDrivers(driverRes.drivers ?? []);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000); // 1分ごとに自動更新
    return () => clearInterval(timer);
  }, [load]);

  const statusCounts = {
    driving: operations.filter(o => o.status === "driving").length,
    break: operations.filter(o => o.status === "break").length,
    loading: operations.filter(o => o.status === "loading").length,
    unloading: operations.filter(o => o.status === "unloading").length,
    finished: operations.filter(o => o.status === "finished").length,
    off: operations.filter(o => o.status === "off").length,
  };

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>本日の運行状況</h2>
          <p style={styles.date}>{today}</p>
        </div>
        <div style={styles.headerRight}>
          {lastUpdated && (
            <span style={styles.updated}>最終更新: {lastUpdated.toLocaleTimeString("ja-JP")}</span>
          )}
          <button style={styles.refreshBtn} onClick={load} disabled={loading}>
            {loading ? "更新中..." : "🔄 更新"}
          </button>
        </div>
      </div>

      {/* サマリーカード */}
      <div style={styles.summaryGrid}>
        <SummaryCard label="運行中" count={statusCounts.driving} color="#16a34a" icon="🚛" />
        <SummaryCard label="休憩中" count={statusCounts.break} color="#d97706" icon="☕" />
        <SummaryCard label="荷積み中" count={statusCounts.loading} color="#2563eb" icon="📦" />
        <SummaryCard label="荷下ろし中" count={statusCounts.unloading} color="#7c3aed" icon="📤" />
        <SummaryCard label="運行終了" count={statusCounts.finished} color="#dc2626" icon="🏁" />
        <SummaryCard label="未出発" count={statusCounts.off} color="#6b7280" icon="⏸" />
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* 運行一覧テーブル */}
      <div style={styles.tableCard}>
        <h3 style={styles.tableTitle}>運行一覧 ({operations.length}件)</h3>
        {loading && operations.length === 0 ? (
          <div style={styles.loading}>読み込み中...</div>
        ) : operations.length === 0 ? (
          <div style={styles.empty}>本日の運行記録はありません</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  <th style={styles.th}>ステータス</th>
                  <th style={styles.th}>ドライバー</th>
                  <th style={styles.th}>トラック</th>
                  <th style={styles.th}>ルート</th>
                  <th style={styles.th}>出発時刻</th>
                  <th style={styles.th}>経過時間</th>
                </tr>
              </thead>
              <tbody>
                {operations.map(op => {
                  const driver = drivers.find(d => d.id === op.driverStaffId);
                  return (
                    <tr key={op.id} style={styles.tr}>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, background: getStatusColor(op.status) }}>
                          {formatStatus(op.status)}
                        </span>
                      </td>
                      <td style={styles.td}>{op.driverName ?? driver?.name ?? `ID:${op.driverStaffId}`}</td>
                      <td style={styles.td}>{op.truckName ?? `ID:${op.truckId}`}</td>
                      <td style={styles.td}>{op.routeName ?? "-"}</td>
                      <td style={styles.td}>{op.startTime ? new Date(op.startTime).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                      <td style={styles.td}>{calcDuration(op.startTime, op.endTime)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* トラック・ドライバー概要 */}
      <div style={styles.bottomGrid}>
        <div style={styles.listCard}>
          <h3 style={styles.tableTitle}>トラック一覧 ({trucks.length}台)</h3>
          {trucks.length === 0 ? (
            <div style={styles.empty}>データなし</div>
          ) : (
            <div style={styles.listItems}>
              {trucks.map(t => (
                <div key={t.id} style={styles.listItem}>
                  <span style={styles.listItemName}>🚛 {t.truckName}</span>
                  <span style={styles.listItemSub}>{t.truckNumber}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={styles.listCard}>
          <h3 style={styles.tableTitle}>ドライバー一覧 ({drivers.length}名)</h3>
          {drivers.length === 0 ? (
            <div style={styles.empty}>データなし</div>
          ) : (
            <div style={styles.listItems}>
              {drivers.map(d => (
                <div key={d.id} style={styles.listItem}>
                  <span style={styles.listItemName}>👤 {d.name}</span>
                  <span style={styles.listItemSub}>{d.loginId}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, count, color, icon }: { label: string; count: number; color: string; icon: string }) {
  return (
    <div style={{ ...styles.summaryCard, borderTop: `4px solid ${color}` }}>
      <div style={styles.summaryIcon}>{icon}</div>
      <div style={{ ...styles.summaryCount, color }}>{count}</div>
      <div style={styles.summaryLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" },
  title: { fontSize: "22px", fontWeight: "700", color: "#0f2744", margin: "0 0 4px" },
  date: { fontSize: "14px", color: "#6b7280", margin: 0 },
  headerRight: { display: "flex", alignItems: "center", gap: "12px" },
  updated: { fontSize: "12px", color: "#9ca3af" },
  refreshBtn: {
    background: "#1a3a5c", color: "#fff", border: "none", borderRadius: "8px",
    padding: "8px 16px", fontSize: "14px", cursor: "pointer",
  },
  summaryGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: "16px", marginBottom: "24px",
  },
  summaryCard: {
    background: "#fff", borderRadius: "12px", padding: "20px 16px",
    textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  summaryIcon: { fontSize: "28px", marginBottom: "8px" },
  summaryCount: { fontSize: "32px", fontWeight: "800", lineHeight: 1 },
  summaryLabel: { fontSize: "13px", color: "#6b7280", marginTop: "6px" },
  error: {
    background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px",
    padding: "12px 16px", color: "#dc2626", fontSize: "14px", marginBottom: "16px",
  },
  tableCard: {
    background: "#fff", borderRadius: "12px", padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "24px",
  },
  tableTitle: { fontSize: "16px", fontWeight: "700", color: "#0f2744", margin: "0 0 16px" },
  loading: { textAlign: "center", padding: "40px", color: "#9ca3af" },
  empty: { textAlign: "center", padding: "40px", color: "#9ca3af", fontSize: "14px" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#f9fafb" },
  th: { padding: "10px 14px", textAlign: "left", fontSize: "13px", fontWeight: "600", color: "#6b7280", borderBottom: "1px solid #e5e7eb" },
  tr: { borderBottom: "1px solid #f3f4f6" },
  td: { padding: "12px 14px", fontSize: "14px", color: "#374151" },
  badge: {
    display: "inline-block", padding: "3px 10px", borderRadius: "20px",
    color: "#fff", fontSize: "12px", fontWeight: "600",
  },
  bottomGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  listCard: {
    background: "#fff", borderRadius: "12px", padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  listItems: { display: "flex", flexDirection: "column", gap: "8px" },
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f3f4f6" },
  listItemName: { fontSize: "14px", color: "#374151", fontWeight: "500" },
  listItemSub: { fontSize: "12px", color: "#9ca3af" },
};
