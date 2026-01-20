import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Asistencias from "../sections/Asistencias";
import Liquidaciones from "../sections/Liquidaciones";
import Flota from "../sections/Flota";
import Incidencias from "../sections/Incidencias";
import Reparto from "../sections/Reparto";
import Compras from "../sections/Compras";
import KilosLitros from "../sections/KilosLitros";
import Contactos from "../sections/Contactos"; // ✅ NUEVO
import "leaflet/dist/leaflet.css";


const HUBS = [
  "Madrid Puerta Toledo",
  "Hub Dibecesa",
  "Hub Cadiz",
  "Hub Cordoba",
  "Hub caceres",
  "Hub Vitoria",
  "Hub Cartagena",
];

const MODULES = [
  { key: "asistencias", label: "Asistencias", subtitle: "Registro y consulta" },
  { key: "liquidaciones", label: "Liquidaciones", subtitle: "Pagos y cierres" },
  { key: "flota", label: "Flota", subtitle: "Vehículos y estado" },
  { key: "incidencias", label: "Historico de Incidencias", subtitle: "Flota" },
  { key: "reparto", label: "Reparto", subtitle: "Rutas y entregas" },
  { key: "compras", label: "Compras", subtitle: "Solicitudes y pedidos" },
  { key: "kiloslitros", label: "Kilos/Litros", subtitle: "Registro de consumos" },

  // ✅ NUEVO
  { key: "contactos", label: "Contactos", subtitle: "Lista de contactos" },
];

function lsKey(name) {
  return `areatrans:${name}`;
}

function nowIso() {
  return new Date().toISOString();
}

function formatWhen(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function Home() {
  const navigate = useNavigate();

  const [hub, setHub] = useState(HUBS[0]);
  const [moduleKey, setModuleKey] = useState("asistencias");

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(lsKey("notifications")) || "[]");
    } catch {
      return [];
    }
  });

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);

  const welcome =
    localStorage.getItem("welcome") ||
    (user?.name ? `Bienvenido, ${user.name}` : "Bienvenido");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) navigate("/");
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem(lsKey("notifications"), JSON.stringify(notifications));
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeModule = MODULES.find((m) => m.key === moduleKey);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("welcome");
    navigate("/");
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function clearNotifications() {
    setNotifications([]);
  }

  function markOneRead(id) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  function pushNotification({ type, title, message }) {
    const n = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      type,
      title,
      message,
      hub,
      createdAt: nowIso(),
      read: false,
    };
    setNotifications((prev) => [n, ...prev]);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <div style={styles.headerLeft}>
            <h1 style={styles.h1}>{welcome}</h1>
            <div style={styles.subline}>
              <span style={styles.badge}>HOME</span>
              <span style={styles.dot}>•</span>
              <span style={styles.smallText}>{user?.email ?? "Sesión activa"}</span>
            </div>
          </div>

          <div style={styles.headerRight}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              style={styles.notifBtn}
              title="Notificaciones"
            >
              🔔
              {unreadCount > 0 && <span style={styles.notifBubble}>{unreadCount}</span>}
            </button>

            <button onClick={logout} style={styles.logoutBtn}>
              Cerrar sesión
            </button>
          </div>
        </div>

        {notifOpen && (
          <div style={styles.blockCard}>
            <div style={styles.blockTitleRow}>
              <h2 style={styles.h2}>Notificaciones</h2>
              <div style={styles.notifActions}>
                <button onClick={markAllRead} style={styles.smallBtn}>
                  Marcar todas como leídas
                </button>
                <button onClick={clearNotifications} style={styles.smallBtnDanger}>
                  Borrar
                </button>
              </div>
            </div>

            {notifications.length === 0 ? (
              <div style={styles.helperText}>No hay notificaciones.</div>
            ) : (
              <div style={styles.notifList}>
                {notifications.slice(0, 20).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markOneRead(n.id)}
                    style={{ ...styles.notifItem, ...(n.read ? styles.notifItemRead : {}) }}
                    title="Click para marcar como leída"
                  >
                    <div style={styles.notifTop}>
                      <span style={styles.notifType}>{n.type || "Info"}</span>
                      <span style={styles.notifWhen}>{formatWhen(n.createdAt)}</span>
                    </div>
                    <div style={styles.notifTitleRow}>
                      <span style={styles.notifTitle}>{n.title}</span>
                      {!n.read && <span style={styles.unreadDot} />}
                    </div>
                    <div style={styles.notifMsg}>
                      <b>{n.hub}</b> — {n.message}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={styles.blockCard}>
          <div style={styles.blockTitleRow}>
            <h2 style={styles.h2}>Selecciona HUB</h2>
            <span style={styles.helperText}>Filtra todas las funciones por HUB</span>
          </div>

          <div style={styles.hubChips}>
            {HUBS.map((h) => {
              const active = h === hub;
              return (
                <button
                  key={h}
                  onClick={() => setHub(h)}
                  style={{ ...styles.chip, ...(active ? styles.chipActive : {}) }}
                  title={h}
                >
                  {h}
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.modulesGrid}>
          {MODULES.map((m) => {
            const active = m.key === moduleKey;
            return (
              <button
                key={m.key}
                onClick={() => setModuleKey(m.key)}
                style={{ ...styles.moduleCard, ...(active ? styles.moduleCardActive : {}) }}
              >
                <div style={styles.moduleTitle}>{m.label}</div>
                <div style={styles.moduleSubtitle}>{m.subtitle}</div>
              </button>
            );
          })}
        </div>

        <div style={styles.panelCard}>
          <div style={styles.panelHeader}>
            <div style={styles.panelKicker}>
              <span style={styles.kickerHub}>{hub}</span>
              <span style={styles.dot}>•</span>
              <span style={styles.kickerModule}>{activeModule?.label}</span>
            </div>
            <h2 style={styles.panelTitle}>{activeModule?.label}</h2>
          </div>

          <ModuleRenderer hub={hub} moduleKey={moduleKey} notify={pushNotification} />
        </div>
      </div>
    </div>
  );
}

function ModuleRenderer({ hub, moduleKey, notify }) {
  switch (moduleKey) {
    case "asistencias":
      return <Asistencias hub={hub} notify={notify} />;
    case "liquidaciones":
      return <Liquidaciones hub={hub} notify={notify} />;
    case "flota":
      return <Flota hub={hub} notify={notify} />;
    case "incidencias":
      return <Incidencias hub={hub} notify={notify} />;
    case "reparto":
      return <Reparto hub={hub} notify={notify} />;
    case "compras":
      return <Compras hub={hub} notify={notify} />;
    case "kiloslitros":
      return <KilosLitros hub={hub} notify={notify} />;

    // ✅ NUEVO
    case "contactos":
      return <Contactos hub={hub} notify={notify} />;

    default:
      return null;
  }
}

const styles = {
  // (igual que lo tenías; no lo toco)
  page: {
    width: "100vw",
    minHeight: "100vh",
    background: "linear-gradient(135deg,#0f2027,#203a43,#2c5364)",
    padding: 16,
    display: "flex",
    justifyContent: "center",
  },
  container: {
    width: "100%",
    maxWidth: 1100,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  headerCard: {
    background: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 15px 40px rgba(0,0,0,.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  headerLeft: { minWidth: 240 },
  headerRight: { display: "flex", gap: 10, alignItems: "center" },
  h1: { margin: 0, fontSize: 24, fontWeight: 900 },
  h2: { margin: 0, fontSize: 18, fontWeight: 900 },
  subline: {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.5,
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(32,58,67,.12)",
  },
  smallText: { fontSize: 13, opacity: 0.8 },
  dot: { opacity: 0.55 },
  notifBtn: {
    position: "relative",
    width: 44,
    height: 44,
    borderRadius: 12,
    border: "none",
    background: "#203a43",
    color: "white",
    fontSize: 18,
    cursor: "pointer",
  },
  notifBubble: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    background: "#e74c3c",
    color: "white",
    fontWeight: 900,
    fontSize: 12,
    display: "grid",
    placeItems: "center",
    padding: "0 6px",
  },
  logoutBtn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "#922b21",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  blockCard: {
    background: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 15px 40px rgba(0,0,0,.20)",
  },
  blockTitleRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  helperText: { fontSize: 13, opacity: 0.75 },
  notifActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  smallBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.12)",
    background: "white",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 12,
  },
  smallBtnDanger: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#922b21",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 12,
  },
  notifList: { display: "grid", gap: 10 },
  notifItem: {
    textAlign: "left",
    border: "1px solid rgba(0,0,0,.10)",
    background: "white",
    borderRadius: 14,
    padding: 12,
    cursor: "pointer",
  },
  notifItemRead: { opacity: 0.7 },
  notifTop: { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  notifType: { fontSize: 12, fontWeight: 950, opacity: 0.85 },
  notifWhen: { fontSize: 12, opacity: 0.65 },
  notifTitleRow: { marginTop: 4, display: "flex", alignItems: "center", gap: 8 },
  notifTitle: { fontSize: 14, fontWeight: 950 },
  unreadDot: { width: 10, height: 10, borderRadius: 999, background: "#e74c3c" },
  notifMsg: { marginTop: 6, fontSize: 13, opacity: 0.85 },
  hubChips: { display: "flex", gap: 10, flexWrap: "wrap" },
  chip: {
    border: "1px solid rgba(0,0,0,.12)",
    background: "white",
    borderRadius: 999,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  chipActive: {
    background: "#203a43",
    color: "white",
    borderColor: "#203a43",
  },
  modulesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
  },
  moduleCard: {
    textAlign: "left",
    border: "1px solid rgba(255,255,255,.25)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 10px 28px rgba(0,0,0,.18)",
    cursor: "pointer",
  },
  moduleCardActive: { outline: "3px solid rgba(32,58,67,.35)" },
  moduleTitle: { fontSize: 16, fontWeight: 950, marginBottom: 6 },
  moduleSubtitle: { fontSize: 13, opacity: 0.75 },
  panelCard: {
    background: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 15px 40px rgba(0,0,0,.25)",
  },
  panelHeader: { marginBottom: 12 },
  panelKicker: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  kickerHub: { fontSize: 13, fontWeight: 900, opacity: 0.85 },
  kickerModule: { fontSize: 13, fontWeight: 900, opacity: 0.85 },
  panelTitle: { margin: "8px 0 0", fontSize: 20, fontWeight: 950 },
};
