import { useState } from "react";
import { loginAdmin, saveAdminInfo, DEFAULT_API_URL, DEFAULT_TENANT_SLUG, DEFAULT_MOBILE_API_KEY } from "../lib/api";

interface Props {
  onLogin: () => void;
}

export default function Login({ onLogin }: Props) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [tenantSlug, setTenantSlug] = useState(DEFAULT_TENANT_SLUG);
  const [mobileApiKey, setMobileApiKey] = useState(DEFAULT_MOBILE_API_KEY);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await loginAdmin({ apiUrl, tenantSlug, mobileApiKey, loginId, password });
      if (!result.ok || !result.info) {
        setError(result.error ?? "ログインに失敗しました");
        return;
      }
      saveAdminInfo(result.info);
      onLogin();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.iconWrap}>
            <span style={styles.icon}>🚛</span>
          </div>
          <h1 style={styles.title}>トラック運行管理</h1>
          <p style={styles.subtitle}>管理者ログイン</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>ログインID</label>
            <input
              style={styles.input}
              type="text"
              value={loginId}
              onChange={e => setLoginId(e.target.value)}
              placeholder="ログインID"
              required
              autoComplete="username"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>パスワード</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="パスワード"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="button"
            style={styles.advancedToggle}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "▲ 詳細設定を閉じる" : "▼ 詳細設定"}
          </button>

          {showAdvanced && (
            <div style={styles.advanced}>
              <div style={styles.field}>
                <label style={styles.label}>サーバーURL</label>
                <input style={styles.input} type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>テナントスラッグ</label>
                <input style={styles.input} type="text" value={tenantSlug} onChange={e => setTenantSlug(e.target.value)} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Mobile API Key</label>
                <input style={styles.input} type="text" value={mobileApiKey} onChange={e => setMobileApiKey(e.target.value)} />
              </div>
            </div>
          )}

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f2744 0%, #1a3a5c 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "40px",
    width: "100%",
    maxWidth: "400px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  header: {
    textAlign: "center",
    marginBottom: "32px",
  },
  iconWrap: {
    width: "72px",
    height: "72px",
    background: "linear-gradient(135deg, #1a3a5c, #2563eb)",
    borderRadius: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
  },
  icon: { fontSize: "36px" },
  title: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#0f2744",
    margin: "0 0 4px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#6b7280",
    margin: 0,
  },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "6px" },
  label: { fontSize: "13px", fontWeight: "600", color: "#374151" },
  input: {
    padding: "10px 14px",
    border: "1.5px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "15px",
    outline: "none",
    transition: "border-color 0.2s",
  },
  advancedToggle: {
    background: "none",
    border: "none",
    color: "#6b7280",
    fontSize: "13px",
    cursor: "pointer",
    textAlign: "left",
    padding: "0",
  },
  advanced: {
    background: "#f9fafb",
    borderRadius: "8px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#dc2626",
    fontSize: "14px",
  },
  button: {
    background: "linear-gradient(135deg, #1a3a5c, #2563eb)",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "14px",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer",
    marginTop: "8px",
  },
};
