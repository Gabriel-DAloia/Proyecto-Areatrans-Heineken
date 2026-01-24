import { useEffect, useMemo, useState } from "react";

export default function Incidencias({ hub, notify }) {
  const token = useMemo(() => localStorage.getItem("token"), []);

  const [vehiculos, setVehiculos] = useState([]);
  const [loadingVeh, setLoadingVeh] = useState(false);

  const [activeVehId, setActiveVehId] = useState(null);
  const [openVehIds, setOpenVehIds] = useState([]);

  const [items, setItems] = useState([]);
  const [loadingInc, setLoadingInc] = useState(false);

  // form add
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState(""); // YYYY-MM-DD
  const [coste, setCoste] = useState("");
  const [km, setKm] = useState("");

  const [err, setErr] = useState("");

  // edit inline
  const [editId, setEditId] = useState(null);
  const [eTitulo, setETitulo] = useState("");
  const [eDescripcion, setEDescripcion] = useState("");
  const [eFecha, setEFecha] = useState("");
  const [eCoste, setECoste] = useState("");
  const [eKm, setEKm] = useState("");

  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  function normalizeVehicles(list) {
    const safe = Array.isArray(list) ? list : [];
    const cleaned = safe.filter((v) => v && typeof v === "object" && v.matricula);
    cleaned.sort((a, b) => String(a.matricula).localeCompare(String(b.matricula)));
    return cleaned;
  }

  function labelVeh(v) {
    if (!v) return "";
    const m = v.matricula ? String(v.matricula) : `Vehículo ${v.id}`;
    const t = v.tipo ? String(v.tipo) : "";
    return t ? `${m} · ${t}` : m;
  }

  function toFloatOrZero(v) {
    const s = String(v ?? "").trim().replace(",", ".");
    if (!s) return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function toIntOrZero(v) {
    const s = String(v ?? "").trim();
    if (!s) return 0;
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return Math.trunc(n);
  }

  function clearForm() {
    setTitulo("");
    setDescripcion("");
    setFecha("");
    setCoste("");
    setKm("");
  }

  function cancelEdit() {
    setEditId(null);
    setETitulo("");
    setEDescripcion("");
    setEFecha("");
    setECoste("");
    setEKm("");
  }

  // dd/mm/yyyy para mostrar
  function formatFechaES(value) {
    if (!value) return "—";
    const s = String(value);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    }
    return s;
  }

  function parseDate(value) {
    if (!value) return null;
    const s = String(value).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [dd, mm, yy] = s.split("/").map((x) => parseInt(x, 10));
      const d = new Date(yy, mm - 1, dd);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [yy, mm, dd] = s.split("-").map((x) => parseInt(x, 10));
      const d = new Date(yy, mm - 1, dd);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  async function loadFlota() {
    if (!hub) return;
    setLoadingVeh(true);
    setErr("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/flota`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando flota");

      const list = normalizeVehicles(json.vehicles);
      setVehiculos(list);

      if (!activeVehId && list.length > 0) {
        const firstId = list[0].id;
        setOpenVehIds([firstId]);
        setActiveVehId(firstId);
      }
    } catch (e) {
      setVehiculos([]);
      setOpenVehIds([]);
      setActiveVehId(null);
      setItems([]);
      cancelEdit();
      setErr(e.message || "Error");
    } finally {
      setLoadingVeh(false);
    }
  }

  function openVeh(vehId) {
    setOpenVehIds((prev) => (prev.includes(vehId) ? prev : [vehId, ...prev]));
    setActiveVehId(vehId);
  }

  function closeVeh(vehId) {
    setOpenVehIds((prev) => prev.filter((x) => x !== vehId));
    if (activeVehId === vehId) {
      const remaining = openVehIds.filter((x) => x !== vehId);
      const next = remaining[0] ?? null;
      setActiveVehId(next);
      setItems([]);
      cancelEdit();
    }
  }

  async function loadIncidencias(vehId) {
    if (!vehId) return;
    setLoadingInc(true);
    setErr("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/flota/${vehId}/incidencias`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando incidencias");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setItems([]);
      setErr(e.message || "Error");
    } finally {
      setLoadingInc(false);
    }
  }

  async function addIncidencia() {
    if (!activeVehId) return;
    const t = String(titulo).trim();
    if (!t) return setErr("Título obligatorio");
    if (!fecha) return setErr("Fecha obligatoria");

    setErr("");
    try {
      const payload = {
        titulo: t,
        descripcion: String(descripcion || "").trim(),
        fecha,
        coste: toFloatOrZero(coste),
        km: toIntOrZero(km),
      };

      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/flota/${activeVehId}/incidencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude guardar");

      const it = json.item || json;
      setItems((prev) => [it, ...prev]);
      clearForm();

      const v = vehiculos.find((x) => x.id === activeVehId);
      notify?.({ type: "Flota", title: "Incidencia agregada", message: `${hub}: ${labelVeh(v)} · ${t}` });
    } catch (e) {
      setErr(e.message || "Error");
    }
  }

  function startEdit(x) {
    setErr("");
    setEditId(x.id);
    setETitulo(String(x.titulo || ""));
    setEDescripcion(String(x.descripcion || ""));
    const s = String(x.fecha || "");
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [dd, mm, yy] = s.split("/");
      setEFecha(`${yy}-${mm}-${dd}`);
    } else {
      setEFecha(s);
    }
    setECoste(String(x.coste ?? ""));
    setEKm(String(x.km ?? ""));
  }

  async function saveEdit() {
    if (!activeVehId || !editId) return;
    const t = String(eTitulo).trim();
    if (!t) return setErr("Título obligatorio");
    if (!eFecha) return setErr("Fecha obligatoria");

    setSavingId(editId);
    setErr("");
    try {
      const payload = {
        titulo: t,
        descripcion: String(eDescripcion || "").trim(),
        fecha: eFecha,
        coste: toFloatOrZero(eCoste),
        km: toIntOrZero(eKm),
      };

      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/flota/${activeVehId}/incidencias/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude actualizar");

      const updated = json.item || json;
      setItems((prev) => prev.map((z) => (z.id === editId ? { ...z, ...updated } : z)));
      cancelEdit();

      notify?.({ type: "Flota", title: "Incidencia actualizada", message: `${hub}` });
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteIncidencia(x) {
    if (!activeVehId || !x?.id) return;
    const ok = window.confirm(`¿Borrar incidencia "${x.titulo}"?`);
    if (!ok) return;

    setDeletingId(x.id);
    setErr("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/flota/${activeVehId}/incidencias/${x.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude borrar");

      setItems((prev) => prev.filter((z) => z.id !== x.id));
      if (editId === x.id) cancelEdit();

      notify?.({ type: "Flota", title: "Incidencia eliminada", message: `${hub}` });
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setDeletingId(null);
    }
  }

  const resumen = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    let totalMes = 0;
    let totalAnio = 0;

    for (const it of items) {
      const d = parseDate(it.fecha);
      const c = Number(it.coste || 0);
      if (!d || !Number.isFinite(c)) continue;
      if (d.getFullYear() === y) {
        totalAnio += c;
        if (d.getMonth() === m) totalMes += c;
      }
    }
    return { totalMes, totalAnio };
  }, [items]);

  useEffect(() => {
    setVehiculos([]);
    setOpenVehIds([]);
    setActiveVehId(null);
    setItems([]);
    clearForm();
    cancelEdit();
    setErr("");
    loadFlota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);

  useEffect(() => {
    loadIncidencias(activeVehId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVehId]);

  const activeVeh = vehiculos.find((v) => v.id === activeVehId);

  const inputStyle = { padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 12, width: "100%" }}>
      {/* Left */}
      <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <b>Vehículos</b>
          <button onClick={loadFlota} disabled={loadingVeh} style={{ padding: "8px 10px", borderRadius: 10, fontWeight: 900 }}>
            {loadingVeh ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {vehiculos.length === 0 ? (
            <div style={{ opacity: 0.7 }}>{loadingVeh ? "Cargando..." : "No hay vehículos en este HUB."}</div>
          ) : (
            vehiculos.map((v) => (
              <button
                key={v.id}
                onClick={() => openVeh(v.id)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  textAlign: "left",
                  background: activeVehId === v.id ? "#f1f5f9" : "white",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                {labelVeh(v)}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right */}
      <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 12, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {openVehIds.map((id) => {
            const v = vehiculos.find((x) => x.id === id);
            const label = labelVeh(v) || `Vehículo ${id}`;
            return (
              <div
                key={id}
                onClick={() => setActiveVehId(id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  background: activeVehId === id ? "#e0f2fe" : "#fff",
                  cursor: "pointer",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontWeight: 950,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    closeVeh(id);
                  }}
                  style={{ opacity: 0.7, fontWeight: 900 }}
                >
                  ✕
                </span>
              </div>
            );
          })}
        </div>

        {!activeVehId ? (
          <div style={{ marginTop: 14, opacity: 0.7 }}>Selecciona un vehículo para ver/añadir incidencias.</div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <h3 style={{ margin: 0 }}>Incidencias · {labelVeh(activeVeh) || `Vehículo ${activeVehId}`}</h3>

            {/* resumen */}
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 12,
                border: "1px solid #eee",
                background: "#fff",
                display: "flex",
                gap: 18,
                flexWrap: "wrap",
                fontWeight: 900,
              }}
            >
              <div>
                Total coste <span style={{ opacity: 0.75 }}>este mes</span>: <b>{Number(resumen.totalMes || 0).toFixed(2)}</b>
              </div>
              <div>
                Total coste <span style={{ opacity: 0.75 }}>este año</span>: <b>{Number(resumen.totalAnio || 0).toFixed(2)}</b>
              </div>
            </div>

            {/* ✅ FORM: 2 filas (arriba titulo/desc/fecha, abajo coste/km + boton) */}
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns: "minmax(180px, 1.2fr) minmax(220px, 1.8fr) 180px",
                }}
              >
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" style={inputStyle} />
                <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción" style={inputStyle} />
                <input value={fecha} onChange={(e) => setFecha(e.target.value)} type="date" style={inputStyle} />
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns: "160px 160px 220px",
                  alignItems: "center",
                }}
              >
                <input value={coste} onChange={(e) => setCoste(e.target.value)} placeholder="Coste" inputMode="decimal" style={inputStyle} />
                <input value={km} onChange={(e) => setKm(e.target.value)} placeholder="KM" inputMode="numeric" style={inputStyle} />

                <button
                  onClick={addIncidencia}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    fontWeight: 950,
                    border: "none",
                    background: "#0ea5e9",
                    color: "white",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Agregar incidencia
                </button>
              </div>
            </div>

            {err && <div style={{ marginTop: 10, color: "#b91c1c", fontWeight: 900 }}>{err}</div>}

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              {loadingInc ? (
                <div>Cargando...</div>
              ) : items.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Sin incidencias todavía.</div>
              ) : (
                <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      <th style={{ textAlign: "left", padding: 8 }}>Fecha</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Título</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Descripción</th>
                      <th style={{ textAlign: "right", padding: 8 }}>Coste</th>
                      <th style={{ textAlign: "right", padding: 8 }}>KM</th>
                      <th style={{ textAlign: "left", padding: 8, width: 220 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((x) => {
                      const isEditing = editId === x.id;
                      return (
                        <tr key={x.id} style={{ borderTop: "1px solid #eee" }}>
                          <td style={{ padding: 8 }}>
                            {isEditing ? <input value={eFecha} onChange={(e) => setEFecha(e.target.value)} type="date" style={{ ...inputStyle, width: 170 }} /> : formatFechaES(x.fecha)}
                          </td>

                          <td style={{ padding: 8, fontWeight: 950 }}>
                            {isEditing ? <input value={eTitulo} onChange={(e) => setETitulo(e.target.value)} style={inputStyle} /> : x.titulo}
                          </td>

                          <td style={{ padding: 8 }}>
                            {isEditing ? <input value={eDescripcion} onChange={(e) => setEDescripcion(e.target.value)} style={inputStyle} /> : x.descripcion || "—"}
                          </td>

                          <td style={{ padding: 8, textAlign: "right" }}>
                            {isEditing ? <input value={eCoste} onChange={(e) => setECoste(e.target.value)} inputMode="decimal" style={{ ...inputStyle, width: 120, textAlign: "right" }} /> : Number(x.coste || 0).toFixed(2)}
                          </td>

                          <td style={{ padding: 8, textAlign: "right" }}>
                            {isEditing ? <input value={eKm} onChange={(e) => setEKm(e.target.value)} inputMode="numeric" style={{ ...inputStyle, width: 120, textAlign: "right" }} /> : x.km ?? 0}
                          </td>

                          <td style={{ padding: 8 }}>
                            {isEditing ? (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <button
                                  onClick={saveEdit}
                                  disabled={savingId === x.id}
                                  style={{ padding: "8px 10px", borderRadius: 10, border: "none", background: "#16a34a", color: "white", fontWeight: 900, cursor: "pointer" }}
                                >
                                  {savingId === x.id ? "Guardando..." : "Guardar"}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  disabled={savingId === x.id}
                                  style={{ padding: "8px 10px", borderRadius: 10, border: "none", background: "#e5e7eb", color: "#111827", fontWeight: 900, cursor: "pointer" }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <button
                                  onClick={() => startEdit(x)}
                                  style={{ padding: "8px 10px", borderRadius: 10, border: "none", background: "#2563eb", color: "white", fontWeight: 900, cursor: "pointer" }}
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => deleteIncidencia(x)}
                                  disabled={deletingId === x.id}
                                  style={{ padding: "8px 10px", borderRadius: 10, border: "none", background: "#dc2626", color: "white", fontWeight: 900, cursor: "pointer" }}
                                >
                                  {deletingId === x.id ? "Borrando..." : "Borrar"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
