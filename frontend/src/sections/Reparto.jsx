import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Fix iconos leaflet (Vite)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// -----------------------------
// Centros por HUB
// -----------------------------
const HUB_CENTER = {
  "Madrid Puerta Toledo": [40.4055, -3.711],
  "Hub Cordoba": [37.8882, -4.7794],
  "Hub Cadiz": [36.5298, -6.2926],
  "Hub caceres": [39.4765, -6.3722],
  "Hub Vitoria": [42.8467, -2.6716],
  "Hub Cartagena": [37.6257, -0.9966],
  "Hub Dibecesa": [40.3432, -3.7637],
};

// -----------------------------
// Iconos por estado
// -----------------------------
const iconPendiente = new L.DivIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:999px;background:#dc2626;border:2px solid white;box-shadow:0 2px 10px rgba(0,0,0,.25)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});
const iconEntregado = new L.DivIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:999px;background:#16a34a;border:2px solid white;box-shadow:0 2px 10px rgba(0,0,0,.25)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});
const iconAnulado = new L.DivIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:999px;background:#111827;border:2px solid white;box-shadow:0 2px 10px rgba(0,0,0,.25)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});
const iconCambiadoDia = new L.DivIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:999px;background:#f59e0b;border:2px solid white;box-shadow:0 2px 10px rgba(0,0,0,.25)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Moto (stub)
const iconMoto = new L.DivIcon({
  className: "",
  html: `<div style="padding:4px 6px;border-radius:999px;background:#0ea5e9;color:white;font-weight:900;font-size:12px;box-shadow:0 6px 16px rgba(0,0,0,.25)">🏍️</div>`,
  iconSize: [36, 20],
  iconAnchor: [18, 10],
});

function RecenterMap({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.setView(center, zoom ?? map.getZoom(), { animate: true });
    setTimeout(() => map.invalidateSize(), 80);
  }, [center?.[0], center?.[1], zoom, map]);
  return null;
}

function iconByEstado(estado) {
  const s = String(estado || "").toLowerCase();
  if (s === "entregado") return iconEntregado;
  if (s === "anulado") return iconAnulado;
  if (s === "cambiado_dia") return iconCambiadoDia;
  return iconPendiente;
}

export default function Reparto({ hub, notify }) {
  const token = useMemo(() => localStorage.getItem("token"), []);

  // ✅ SOLO PARA FETCH (igual que en Compras)
  const base = import.meta.env.VITE_API_URL || "";

  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState("");

  const [clientes, setClientes] = useState([]);
  const [motos, setMotos] = useState([]);

  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [loadingMotos, setLoadingMotos] = useState(false);
  const [error, setError] = useState("");

  const [showPendientes, setShowPendientes] = useState(true);
  const [showEntregados, setShowEntregados] = useState(true);
  const [showAnulados, setShowAnulados] = useState(true);
  const [showCambiados, setShowCambiados] = useState(true);

  // ✅ form: ahora dirección es lo importante
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  // lat/lng opcionales (por si lo pones manual)
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const itemRefs = useRef({});

  const centerDefault = useMemo(() => HUB_CENTER[hub] || [40.4168, -3.7038], [hub]);
  const mapKey = useMemo(() => `map:${hub}`, [hub]);

  function normalizeRoutes(list) {
    const safe = Array.isArray(list) ? list : [];
    const cleaned = safe
      .filter((x) => x && typeof x === "object" && x.id != null)
      .map((x) => ({
        id: x.id,
        code: x.code ?? x.ruta ?? x.name ?? String(x.id),
      }));
    cleaned.sort((a, b) => String(a.code).localeCompare(String(b.code)));
    return cleaned;
  }

  function estadoLabel(e) {
    const s = String(e || "").toLowerCase();
    if (s === "entregado") return "✅ Entregado";
    if (s === "anulado") return "⛔ Anulado";
    if (s === "cambiado_dia") return "🟨 Cambiado de día";
    return "🔴 Pendiente";
  }

  function allowByEstado(estado) {
    const s = String(estado || "").toLowerCase();
    if (s === "entregado") return showEntregados;
    if (s === "anulado") return showAnulados;
    if (s === "cambiado_dia") return showCambiados;
    return showPendientes;
  }

  function isHtml(text) {
    const t = (text || "").trim().toLowerCase();
    return t.startsWith("<!doctype") || t.startsWith("<html");
  }

  function selectCliente(c) {
    setSelectedId(c.id);
    setTimeout(() => {
      const el = itemRefs.current[c.id];
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  async function loadRoutes() {
    if (!hub) return;
    setLoadingRoutes(true);
    setError("");
    try {
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/liquidaciones/routes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      if (isHtml(text)) throw new Error("Backend no respondió JSON. Revisa proxy /api o backend.");

      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando rutas");

      const list = normalizeRoutes(json.routes ?? json.items ?? json);
      setRoutes(list);
      if (list.length > 0) {
        const first = String(list[0].id);
        setRouteId((prev) => (prev ? prev : first));
      } else {
        setRouteId("");
      }
    } catch (e) {
      setRoutes([]);
      setRouteId("");
      setError(e.message || "Error");
    } finally {
      setLoadingRoutes(false);
    }
  }

  async function loadClientes(routeIdArg) {
    if (!hub) return;
    const rid = routeIdArg ?? routeId;
    if (!rid) {
      setClientes([]);
      return;
    }

    setLoadingClientes(true);
    setError("");
    try {
      const qs = new URLSearchParams({ route_id: String(rid) }).toString();
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/reparto/clientes?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      if (isHtml(text)) throw new Error("Backend no respondió JSON. Revisa proxy /api o backend.");

      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando clientes");

      setClientes(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setClientes([]);
      setError(e.message || "Error");
    } finally {
      setLoadingClientes(false);
    }
  }

  async function loadMotos() {
    if (!hub) return;
    setLoadingMotos(true);
    try {
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/reparto/motos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      if (isHtml(text)) {
        setMotos([]);
        return;
      }
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando motos");
      setMotos(Array.isArray(json.items) ? json.items : []);
    } catch {
      setMotos([]);
    } finally {
      setLoadingMotos(false);
    }
  }

  // ✅ AGREGAR: dirección obligatoria; lat/lng opcional
  async function addCliente() {
    const n = String(nombre).trim();
    if (!n) return setError("Nombre obligatorio");

    const dir = String(direccion).trim();
    if (!dir) return setError("Dirección obligatoria (se usa para ubicar en el mapa)");

    if (!routeId) return setError("Selecciona una ruta");

    // lat/lng opcionales (si se ponen, el backend los usa; si no, geocodifica)
    const la = String(lat).trim().replace(",", ".");
    const ln = String(lng).trim().replace(",", ".");
    const hasCoords = la !== "" && ln !== "" && !Number.isNaN(Number(la)) && !Number.isNaN(Number(ln));

    setError("");
    try {
      const payload = {
        route_id: Number(routeId),
        nombre: n,
        direccion: dir,
        estado: "pendiente",
        ...(hasCoords ? { lat: Number(la), lng: Number(ln) } : {}),
      };

      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/reparto/clientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (isHtml(text)) throw new Error("Backend no respondió JSON. Revisa proxy /api o backend.");

      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude agregar");

      const it = json.item || json;
      if (String(it.route_id ?? payload.route_id) === String(routeId)) {
        setClientes((prev) => [it, ...prev]);
      }

      setNombre("");
      setDireccion("");
      setLat("");
      setLng("");

      notify?.({ type: "Reparto", title: "Cliente agregado", message: `${hub}: ${it.nombre}` });
    } catch (e) {
      setError(e.message || "Error");
    }
  }

  async function cycleEstado(c) {
    const s = String(c.estado || "pendiente").toLowerCase();
    const next =
      s === "pendiente" ? "entregado" : s === "entregado" ? "anulado" : s === "anulado" ? "cambiado_dia" : "pendiente";

    setError("");
    try {
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/reparto/clientes/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: next }),
      });

      const text = await res.text();
      if (isHtml(text)) throw new Error("Backend no respondió JSON. Revisa proxy /api o backend.");

      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude actualizar");

      const updated = json.item || json;
      setClientes((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } catch (e) {
      setError(e.message || "Error");
    }
  }

  async function deleteCliente(c) {
    const ok = window.confirm(`¿Eliminar cliente "${c.nombre}"?`);
    if (!ok) return;

    setError("");
    try {
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/reparto/clientes/${c.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      if (isHtml(text)) throw new Error("Backend no respondió JSON. Revisa proxy /api o backend.");

      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude eliminar");

      setClientes((prev) => prev.filter((x) => x.id !== c.id));
      if (selectedId === c.id) setSelectedId(null);
    } catch (e) {
      setError(e.message || "Error");
    }
  }

  useEffect(() => {
    setRoutes([]);
    setRouteId("");
    setClientes([]);
    setMotos([]);
    setSelectedId(null);
    setError("");
    loadRoutes();
    loadMotos();

    const t = setInterval(loadMotos, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);

  useEffect(() => {
    setSelectedId(null);
    if (!routeId) {
      setClientes([]);
      return;
    }
    loadClientes(routeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // ✅ solo marcadores con coords válidas (cuando backend las tenga)
  const clientesConCoords = useMemo(() => {
    return clientes.filter((c) => {
      const okLat = typeof c.lat === "number" && Number.isFinite(c.lat);
      const okLng = typeof c.lng === "number" && Number.isFinite(c.lng);
      return okLat && okLng && allowByEstado(c.estado);
    });
  }, [clientes, showPendientes, showEntregados, showAnulados, showCambiados]);

  const resumen = useMemo(() => {
    const total = clientes.length;
    const entregados = clientes.filter((x) => String(x.estado).toLowerCase() === "entregado").length;
    const anulados = clientes.filter((x) => String(x.estado).toLowerCase() === "anulado").length;
    const cambiados = clientes.filter((x) => String(x.estado).toLowerCase() === "cambiado_dia").length;
    const pendientes = total - entregados - anulados - cambiados;
    return { total, pendientes, entregados, anulados, cambiados };
  }, [clientes]);

  const activeRoute = routes.find((r) => String(r.id) === String(routeId));

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.kicker}>REPARTO · MAPA</div>
          <h3 style={styles.h3}>Mapa de entregas y motos</h3>
          <div style={styles.sub}>
            HUB seleccionado: <b>{hub}</b>
          </div>
        </div>

        <div style={styles.headerBtns}>
          <button style={styles.btn} onClick={loadRoutes} disabled={loadingRoutes}>
            {loadingRoutes ? "Cargando..." : "Refrescar rutas"}
          </button>
          <button style={styles.btn} onClick={() => loadClientes(routeId)} disabled={loadingClientes || !routeId}>
            {loadingClientes ? "Cargando..." : "Refrescar clientes"}
          </button>
          <button style={styles.btn} onClick={loadMotos} disabled={loadingMotos}>
            {loadingMotos ? "Cargando..." : "Refrescar motos"}
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        {/* Panel lateral */}
        <div style={styles.side}>
          <div style={styles.card}>
            <div style={styles.cardTitleRow}>
              <b>Ruta</b>
              <span style={{ fontSize: 12, opacity: 0.75 }}>desde Liquidaciones</span>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <select
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                style={styles.select}
                disabled={loadingRoutes || routes.length === 0}
              >
                {routes.length === 0 ? (
                  <option value="">No hay rutas</option>
                ) : (
                  routes.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.code}
                    </option>
                  ))
                )}
              </select>

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Seleccionada: <b>{activeRoute?.code || "—"}</b>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitleRow}>
              <b>Resumen</b>
              <div style={{ display: "flex", gap: 10, fontSize: 12, opacity: 0.85, flexWrap: "wrap" }}>
                <span>Total: <b>{resumen.total}</b></span>
                <span>P: <b>{resumen.pendientes}</b></span>
                <span>E: <b>{resumen.entregados}</b></span>
                <span>A: <b>{resumen.anulados}</b></span>
                <span>🟨: <b>{resumen.cambiados}</b></span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <label style={styles.check}>
                <input type="checkbox" checked={showPendientes} onChange={(e) => setShowPendientes(e.target.checked)} />
                Pendientes
              </label>
              <label style={styles.check}>
                <input type="checkbox" checked={showEntregados} onChange={(e) => setShowEntregados(e.target.checked)} />
                Entregados
              </label>
              <label style={styles.check}>
                <input type="checkbox" checked={showAnulados} onChange={(e) => setShowAnulados(e.target.checked)} />
                Anulados
              </label>
              <label style={styles.check}>
                <input type="checkbox" checked={showCambiados} onChange={(e) => setShowCambiados(e.target.checked)} />
                Cambiado día
              </label>
            </div>
          </div>

          <div style={styles.card}>
            <b>Agregar cliente (por dirección)</b>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre cliente" style={styles.input} />
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección (obligatoria)" style={styles.input} />

              {/* opcional */}
              <details style={{ marginTop: 4 }}>
                <summary style={{ fontWeight: 900, cursor: "pointer", opacity: 0.85 }}>Opcional: poner lat/lng manual</summary>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat (opcional)" style={styles.input} />
                  <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Lng (opcional)" style={styles.input} />
                </div>
              </details>

              <button style={styles.btnOrange} onClick={addCliente} disabled={!routeId}>
                Agregar (Ruta {activeRoute?.code || "—"})
              </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              * Si no pones lat/lng, el backend debe geocodificar con la dirección.
            </div>
          </div>

          <div style={styles.card}>
            <b>Listado</b>
            <div style={{ marginTop: 10, display: "grid", gap: 8, maxHeight: 360, overflow: "auto" }}>
              {clientes.length === 0 ? (
                <div style={{ opacity: 0.7 }}>{loadingClientes ? "Cargando..." : "No hay clientes."}</div>
              ) : (
                clientes.map((c) => {
                  const selected = selectedId === c.id;
                  const tieneCoords =
                    typeof c.lat === "number" && Number.isFinite(c.lat) && typeof c.lng === "number" && Number.isFinite(c.lng);

                  return (
                    <div
                      key={c.id}
                      ref={(el) => (itemRefs.current[c.id] = el)}
                      style={{
                        ...styles.listItem,
                        ...(selected ? styles.listItemSelected : {}),
                        opacity: allowByEstado(c.estado) ? 1 : 0.55,
                      }}
                      onClick={() => selectCliente(c)}
                      role="button"
                      tabIndex={0}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 950 }}>{c.nombre}</div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCliente(c);
                          }}
                          style={styles.smallDanger}
                        >
                          Eliminar
                        </button>
                      </div>

                      <div style={{ fontSize: 12, opacity: 0.8 }}>{c.direccion || "—"}</div>

                      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>
                        {tieneCoords ? "📍 Ubicado en el mapa" : "⏳ Sin coords aún (pendiente geocoding)"}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontSize: 12, opacity: 0.9 }}>{estadoLabel(c.estado)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cycleEstado(c);
                          }}
                          style={styles.smallBtn}
                        >
                          Cambiar estado
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {error && <div style={styles.err}>{error}</div>}
        </div>

        {/* Mapa */}
        <div style={styles.mapCard}>
          <MapContainer key={mapKey} center={centerDefault} zoom={12} style={{ height: "100%", width: "100%", borderRadius: 14 }}>
            <RecenterMap center={centerDefault} zoom={12} />

            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {/* ✅ solo clientes con coords */}
            {clientesConCoords.map((c) => (
              <Marker key={`c-${c.id}`} position={[c.lat, c.lng]} icon={iconByEstado(c.estado)} eventHandlers={{ click: () => selectCliente(c) }}>
                <Popup>
                  <div style={{ fontWeight: 950 }}>{c.nombre}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{c.direccion || "—"}</div>
                  <div style={{ marginTop: 6 }}>
                    Estado: <b>{estadoLabel(c.estado)}</b>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                    Ruta: <b>{activeRoute?.code || c.route_id || "—"}</b>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Motos (stub) */}
            {motos.map((m) => (
              <Marker key={`m-${m.vehiculo_id}`} position={[m.lat, m.lng]} icon={iconMoto}>
                <Popup>
                  <div style={{ fontWeight: 950 }}>{m.vehiculo?.matricula || `Moto ${m.vehiculo_id}`}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{m.vehiculo?.tipo || "—"}</div>
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    Última señal: <b>{m.ts || "—"}</b>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: { display: "grid", gap: 12 },

  header: {
    background: "white",
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,.10)",
    boxShadow: "0 10px 26px rgba(0,0,0,.08)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  kicker: {
    display: "inline-block",
    fontWeight: 950,
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#ecfeff",
    color: "#0e7490",
  },
  h3: { margin: "6px 0 0", fontSize: 18, fontWeight: 950 },
  sub: { marginTop: 6, opacity: 0.8, fontSize: 13 },
  headerBtns: { display: "flex", gap: 8, flexWrap: "wrap" },

  grid: {
    display: "grid",
    gridTemplateColumns: "380px 1fr",
    gap: 12,
    minHeight: 620,
    alignItems: "stretch",
  },

  side: { display: "grid", gap: 12 },

  card: {
    background: "white",
    borderRadius: 14,
    padding: 12,
    border: "1px solid rgba(0,0,0,.10)",
  },
  cardTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "baseline",
  },

  mapCard: {
    background: "white",
    borderRadius: 14,
    padding: 8,
    border: "1px solid rgba(0,0,0,.10)",
    overflow: "hidden",
    minHeight: 620,
  },

  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d9dde6",
    background: "white",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d9dde6",
    background: "white",
    boxSizing: "border-box",
    fontWeight: 900,
  },

  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#203a43",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  btnOrange: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#f97316",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
    width: "100%",
  },

  check: { display: "flex", gap: 8, alignItems: "center", fontWeight: 900, fontSize: 13, opacity: 0.9 },

  listItem: {
    border: "1px solid rgba(0,0,0,.10)",
    borderRadius: 12,
    padding: 10,
    background: "white",
    cursor: "pointer",
    userSelect: "none",
  },
  listItemSelected: {
    border: "2px solid rgba(14, 116, 144, .55)",
    boxShadow: "0 10px 24px rgba(0,0,0,.10)",
    background: "rgba(236,254,255,.6)",
  },

  smallBtn: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.15)",
    background: "white",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 12,
  },
  smallDanger: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "none",
    background: "#dc2626",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 12,
  },

  err: {
    padding: 10,
    borderRadius: 10,
    background: "#fdecea",
    color: "#922b21",
    border: "1px solid #f5c6cb",
    fontWeight: 900,
  },
};


