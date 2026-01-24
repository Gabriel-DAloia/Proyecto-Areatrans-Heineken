import { useEffect, useMemo, useState } from "react";

const TIPOS = ["Moto", "Camion", "Trailer", "Carrozado", "Mus", "Furgoneta"];

export default function Flota({ hub, notify }) {
  const token = useMemo(() => localStorage.getItem("token"), []);

  const [vehicles, setVehicles] = useState([]); // [{id, matricula, tipo}]
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const [matricula, setMatricula] = useState("");
  const [tipo, setTipo] = useState("Furgoneta");

  function normalizeMatricula(s) {
    return String(s || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }

  function normalizeVehicles(list) {
    const safe = Array.isArray(list) ? list : [];
    const cleaned = safe.filter((v) => v && typeof v === "object" && v.matricula);
    cleaned.sort((a, b) => String(a.matricula).localeCompare(String(b.matricula)));
    return cleaned;
  }

  async function loadFlota() {
    setLoading(true);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/flota`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando flota");

      setVehicles(normalizeVehicles(json.vehicles));
    } catch (e) {
      setVehicles([]);
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function addVehicle() {
    const m = normalizeMatricula(matricula);
    if (!m) return;

    setSaving(true);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/flota`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ matricula: m, tipo }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude agregar el vehículo");

      // ✅ tolerante a respuestas del backend: {vehicle}, {vehiculo} o el objeto plano
      const v = json.vehicle || json.vehiculo || json;
      if (!v || !v.matricula) throw new Error("Respuesta inválida del servidor");

      setVehicles((prev) => {
        const baseList = normalizeVehicles(prev);
        const exists = baseList.some((x) => x?.id === v.id || x?.matricula === v.matricula);
        const next = exists ? baseList : [...baseList, v];
        return normalizeVehicles(next);
      });

      setMatricula("");
      notify?.({ type: "Flota", title: "Vehículo agregado", message: `${hub}: ${v.matricula} · ${v.tipo}` });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVehicle(v) {
    // ✅ evita crash si llega algo raro en el array
    if (!v || !v.id) return;

    const ok = window.confirm(`¿Desea usted borrar el vehículo ${v.matricula}?`);
    if (!ok) return;

    setDeletingId(v.id);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/flota/${v.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude borrar el vehículo");

      setVehicles((prev) => normalizeVehicles(prev).filter((x) => x.id !== v.id));
      notify?.({ type: "Flota", title: "Vehículo eliminado", message: `${hub}: ${v.matricula}` });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    setVehicles([]);
    setError("");
    setMatricula("");
    setTipo("Furgoneta");
    loadFlota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.kicker}>FLOTA</div>
          <h3 style={styles.h3}>Vehículos por HUB</h3>
          <div style={styles.sub}>
            HUB seleccionado: <b>{hub}</b>
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.btn} onClick={loadFlota} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>
      </div>

      <div style={styles.formCard}>
        <div style={styles.formGrid}>
          <div>
            <div style={styles.label}>Matrícula</div>
            <input
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              placeholder="Ej: 1234 ABC"
              style={styles.input}
            />
          </div>

          <div>
            <div style={styles.label}>Tipo</div>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={styles.select}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "end" }}>
            <button style={styles.btnOrange} onClick={addVehicle} disabled={saving || !normalizeMatricula(matricula)}>
              {saving ? "Agregando..." : "Agregar vehículo"}
            </button>
          </div>
        </div>

        {error && <div style={styles.err}>{error}</div>}
      </div>

      <div style={styles.tableWrap}>
        <div style={styles.tableTitle}>
          <b>Listado</b>{" "}
          <span style={{ opacity: 0.7 }}>
            ({vehicles.length} {vehicles.length === 1 ? "vehículo" : "vehículos"})
          </span>
        </div>

        {vehicles.length === 0 ? (
          <div style={styles.empty}>{loading ? "Cargando..." : "No hay vehículos en este HUB."}</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Matrícula</th>
                <th style={styles.th}>Tipo</th>
                <th style={{ ...styles.th, width: 140 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {normalizeVehicles(vehicles).map((v) => (
                <tr key={v.id}>
                  <td style={styles.td}>
                    <b>{v.matricula}</b>
                  </td>
                  <td style={styles.td}>{v.tipo}</td>
                  <td style={styles.td}>
                    <button
                      style={styles.btnDanger}
                      onClick={() => deleteVehicle(v)}
                      disabled={deletingId === v.id}
                      title="Eliminar"
                    >
                      {deletingId === v.id ? "Borrando..." : "Eliminar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

  actions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },

  formCard: {
    background: "white",
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,.10)",
  },
  formGrid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "1fr 220px 220px",
  },
  label: { fontSize: 12, fontWeight: 900, opacity: 0.8, marginBottom: 6 },

  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d9dde6",
    background: "white",
    boxSizing: "border-box",
  },
  select: { padding: "10px 12px", borderRadius: 10, border: "1px solid #d9dde6", background: "white" },

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
  btnDanger: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#dc2626",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    width: "100%",
  },

  err: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    background: "#fdecea",
    color: "#922b21",
    border: "1px solid #f5c6cb",
  },

  tableWrap: {
    overflow: "hidden",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.10)",
    background: "white",
  },
  tableTitle: { padding: 12, borderBottom: "1px solid #eee" },
  empty: { padding: 12, opacity: 0.75 },

  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    background: "#f1f5f9",
    borderBottom: "1px solid #eee",
    padding: 10,
    fontSize: 12,
    textAlign: "left",
    fontWeight: 950,
  },
  td: { borderBottom: "1px solid #f2f2f2", padding: 10, fontSize: 13 },
};
