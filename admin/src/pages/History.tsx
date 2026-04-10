import { useEffect, useState, useCallback } from "react";
import {
  getAdminInfo,
  getOperationHistory,
  getTrucks,
  getDrivers,
  type TruckOperation,
  type Truck,
  type Driver,
  formatStatus,
  getStatusColor,
  calcDuration,
} from "../lib/api";

export default function History() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [driverId, setDriverId] = useState<number | undefined>();
  const [truckId, setTruckId] = useState<number | undefined>();
  const [operations, setOperations] = useState<TruckOperation[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMeta = useCallback(async () => {
    const info = getAdminInfo();
    if (!info) return;
    const [tr, dr] = await Promise.all([getTrucks(info), getDrivers(info)]);
    if (tr.ok) setTrucks(tr.trucks ?? []);
    if (dr.ok) setDrivers(dr.drivers ?? []);
  }, []);

  const loadHistory = useCallback(async () => {
    const info = getAdminInfo();
    if (!info) return;
    setLoading(true);
    setError("");
    try {
      const res = await getOperationHistory(info, { year, month, driverId, truckId });
      if (res.ok) setOperations(res.operations ?? []);
      else setError(res.error ?? "データ取得失敗");
    } finally {
      setLoading(false);
    }
  }, [year, month, driverId, truckId]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const totalDays = new Set(operations.map(o => o.operationDate)).size;
  const finishedOps = operations.filter(o => o.status === "finished");

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>運行履歴</h2>

      {/* フィルター */}
      <div style={styles.filterCard}>
        <div style={styles.filterRow}>
          <div style={styles.filterItem}>
            <label style={styles.label}>年</label>
            <select style={styles.select} value={year} onChange={e => setYear(Number(e.target.value))}>
              {[now.getFullYear() - 1, now.getFullYear()].map(y => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
          </div>
          <div style={styles.filterItem}>
            <label style={styles.label}>月</label>
            <select style={styles.select} value={month} onChange={e => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
          <div style={styles.filterItem}>
            <label style={styles.label}>ドライバー</label>
            <select style={styles.select} value={driverId ?? ""} onChange={e => setDriverId(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">全員</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div style={styles.filterItem}>
            <label style={styles.label}>トラック</label>
            <select style={styles.select} value={truckId ?? ""} onChange={e => setTruckId(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">全台</option>
              {trucks.map(t => <option key={t.id} value={t.id}>{t.truckName}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* サマリー */}
      <div style={styles.summaryRow}>
        <div style={styles.summaryItem}>
          <span style={styles.summaryNum}>{operations.length}</span>
          <span style={styles.summaryLabel}>総運行数</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryNum}>{finishedOps.length}</span>
          <span style={styles.summaryLabel}>完了</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryNum}>{totalDays}</span>
          <span style={styles.summaryLabel}>稼働日数</span>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* テーブル */}
      <div style={styles.tableCard}>
        {loading ? (
          <div style={styles.loading}>読み込み中...</div>
        ) : operations.length === 0 ? (
          <div style={styles.empty}>該当する運行記録がありません</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  <th style={styles.th}>日付</th>
                  <th style={styles.th}>ステータス</th>
                  <th style={styles.th}>ドライバー</th>
                  <th style={styles.th}>トラック</th>
                  <th style={styles.th}>ルート</th>
                  <th style={styles.th}>出発</th>
                  <th style={styles.th}>到着</th>
                  <th style={styles.th}>所要時間</th>
                </tr>
              </thead>
              <tbody>
                {operations.map(op => (
                  <tr key={op.id} style={styles.tr}>
                    <td style={styles.td}>{op.operationDate}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, background: getStatusColor(op.status) }}>
                        {formatStatus(op.status)}
                      </span>
                    </td>
                    <td style={styles.td}>{op.driverName ?? `ID:${op.driverStaffId}`}</td>
                    <td style={styles.td}>{op.truckName ?? `ID:${op.truckId}`}</td>
                    <td style={styles.td}>{op.routeName ?? "-"}</td>
                    <td style={styles.td}>
                      {op.startTime ? new Date(op.startTime).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td style={styles.td}>
                      {op.endTime ? new Date(op.endTime).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td style={styles.td}>{calcDuration(op.startTime, op.endTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  title: { fontSize: "22px", fontWeight: "700", color: "#0f2744", margin: "0 0 20px" },
  filterCard: { background: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "20px" },
  filterRow: { display: "flex", gap: "16px", flexWrap: "wrap" },
  filterItem: { display: "flex", flexDirection: "column", gap: "6px", minWidth: "120px" },
  label: { fontSize: "12px", fontWeight: "600", color: "#6b7280" },
  select: { padding: "8px 12px", border: "1.5px solid #d1d5db", borderRadius: "8px", fontSize: "14px", background: "#fff" },
  summaryRow: { display: "flex", gap: "16px", marginBottom: "20px" },
  summaryItem: {
    background: "#fff", borderRadius: "12px", padding: "16px 24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
  },
  summaryNum: { fontSize: "28px", fontWeight: "800", color: "#0f2744" },
  summaryLabel: { fontSize: "12px", color: "#6b7280" },
  error: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", color: "#dc2626", fontSize: "14px", marginBottom: "16px" },
  tableCard: { background: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  loading: { textAlign: "center", padding: "40px", color: "#9ca3af" },
  empty: { textAlign: "center", padding: "40px", color: "#9ca3af", fontSize: "14px" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#f9fafb" },
  th: { padding: "10px 14px", textAlign: "left", fontSize: "13px", fontWeight: "600", color: "#6b7280", borderBottom: "1px solid #e5e7eb" },
  tr: { borderBottom: "1px solid #f3f4f6" },
  td: { padding: "12px 14px", fontSize: "14px", color: "#374151" },
  badge: { display: "inline-block", padding: "3px 10px", borderRadius: "20px", color: "#fff", fontSize: "12px", fontWeight: "600" },
};
