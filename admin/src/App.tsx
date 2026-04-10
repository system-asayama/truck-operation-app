import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getAdminInfo } from "./lib/api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Trucks from "./pages/Trucks";
import Drivers from "./pages/Drivers";
import Layout from "./components/Layout";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const info = getAdminInfo();
  if (!info) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<Login onLogin={() => window.location.replace("/")} />}
        />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/trucks" element={<Trucks />} />
                  <Route path="/drivers" element={<Drivers />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
