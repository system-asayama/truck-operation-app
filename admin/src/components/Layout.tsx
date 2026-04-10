import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getAdminInfo, clearAdminInfo } from "../lib/api";

const NAV_ITEMS = [
  { path: "/", label: "ダッシュボード", icon: "📊" },
  { path: "/history", label: "運行履歴", icon: "📋" },
  { path: "/trucks", label: "トラック管理", icon: "🚛" },
  { path: "/drivers", label: "ドライバー管理", icon: "👤" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const info = getAdminInfo();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    clearAdminInfo();
    navigate("/login");
  };

  return (
    <div style={styles.root}>
      {/* サイドバー */}
      <aside style={{ ...styles.sidebar, transform: menuOpen ? "translateX(0)" : undefined }}>
        <div style={styles.sidebarHeader}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>🚛</span>
            <div>
              <div style={styles.logoTitle}>トラック運行</div>
              <div style={styles.logoSub}>管理システム</div>
            </div>
          </div>
        </div>

        <nav style={styles.nav}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
              onClick={() => setMenuOpen(false)}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <div style={styles.userAvatar}>{info?.name?.charAt(0) ?? "?"}</div>
            <div>
              <div style={styles.userName}>{info?.name ?? "管理者"}</div>
              <div style={styles.userTenant}>{info?.tenantSlug}</div>
            </div>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout}>ログアウト</button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <div style={styles.main}>
        {/* モバイルヘッダー */}
        <header style={styles.mobileHeader}>
          <button style={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <span style={styles.mobileTitle}>トラック運行管理</span>
        </header>

        {/* オーバーレイ（モバイル） */}
        {menuOpen && (
          <div style={styles.overlay} onClick={() => setMenuOpen(false)} />
        )}

        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: "flex", minHeight: "100vh", background: "#f3f4f6" },
  sidebar: {
    width: "240px",
    background: "linear-gradient(180deg, #0f2744 0%, #1a3a5c 100%)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    position: "fixed" as const,
    top: 0,
    left: 0,
    height: "100vh",
    zIndex: 100,
    transition: "transform 0.3s",
  },
  sidebarHeader: { padding: "24px 20px 16px" },
  logo: { display: "flex", alignItems: "center", gap: "12px" },
  logoIcon: { fontSize: "32px" },
  logoTitle: { fontSize: "16px", fontWeight: "700", color: "#fff" },
  logoSub: { fontSize: "12px", color: "rgba(255,255,255,0.6)" },
  nav: { flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", gap: "4px" },
  navItem: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "10px 12px", borderRadius: "8px",
    color: "rgba(255,255,255,0.7)", textDecoration: "none",
    fontSize: "14px", fontWeight: "500", transition: "all 0.2s",
  },
  navItemActive: {
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
  },
  navIcon: { fontSize: "18px", width: "24px", textAlign: "center" },
  sidebarFooter: { padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.1)" },
  userInfo: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" },
  userAvatar: {
    width: "36px", height: "36px", borderRadius: "50%",
    background: "rgba(255,255,255,0.2)", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "16px", fontWeight: "700", flexShrink: 0,
  },
  userName: { fontSize: "14px", fontWeight: "600", color: "#fff" },
  userTenant: { fontSize: "12px", color: "rgba(255,255,255,0.5)" },
  logoutBtn: {
    width: "100%", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)",
    border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px",
    padding: "8px", fontSize: "13px", cursor: "pointer",
  },
  main: { flex: 1, marginLeft: "240px", display: "flex", flexDirection: "column", minHeight: "100vh" },
  mobileHeader: {
    display: "none",
    alignItems: "center", gap: "12px",
    padding: "12px 16px",
    background: "#0f2744", color: "#fff",
    position: "sticky" as const, top: 0, zIndex: 50,
  },
  menuBtn: { background: "none", border: "none", color: "#fff", fontSize: "24px", cursor: "pointer", padding: "0" },
  mobileTitle: { fontSize: "16px", fontWeight: "700" },
  overlay: {
    position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99,
  },
  content: { flex: 1 },
};
