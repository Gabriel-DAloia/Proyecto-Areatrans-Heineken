import { useEffect, useMemo, useState } from "react";

export default function KilosLitros({ hub, notify }) {
  const token = useMemo(() => localStorage.getItem("token"), []);

  // filtros mes/año
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // listado
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ clientes: 0, kilos: 0, litros: 0 });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");

  // formulario (alta)
  const [day, setDay] = useState(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [rutaNumero, setRutaNumero] = useState("");
  const [nombre, setNombre] = useState("");
  const [clientes, setClientes] = useState("");
  const [kilos, setKilos] = useState("");
  const [litros, setLitros] = useState("");

  // selector tipo "calendario" (histórico)
  const [selectedDay, setSelectedDay] = useState(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  // edición inline (en la misma fila)
  const [editRowId, setEditRowId] = useState(null);
  const [editRuta, setEditRuta] = useState("");
  const [editNombre, setEditNombre] = useState("");
  const [editClientes, setEditClientes] = useState("");
  const [editKilos, setEditKilos] = useState("");
  const [editLitros, setEditLitros] = useState("");

  // -------------------------
  // Helpers
  // -------------------------
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toIntOrNull(v) {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }

  function toFloatOrNull(v) {
    const s = String(v ?? "").trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function isValidDay(ymd) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || "").trim());
  }

  // ✅ nombres siempre en minúscula
  function normalizeName(s) {
    return String(s || "").trim().toLowerCase();
  }

  function normalizeList(list) {
    const safe = Array.isArray(list) ? list : [];
    const cleaned = safe.filter((x) => x && typeof x === "object" && x.id != null);
    cleaned.sort((a, b) => {
      const da = String(a.day || "");
      const db = String(b.day || "");
      if (da !== db) return da.localeCompare(db);
      const ra = Number(a.ruta_numero ?? 0);
      const rb = Number(b.ruta_numero ?? 0);
      if (ra !== rb) return ra - rb;
      return Number(a.id) - Number(b.id);
    });
    return cleaned;
  }

  function format2(n) {
    const num = Number(n || 0);
    return num.toFixed(2);
  }

  function recalcTotals(list) {
    const next = normalizeList(list);
    const tClientes = next.reduce((acc, x) => acc + (Number(x.clientes) || 0), 0);
    const tKilos = next.reduce((acc, x) => acc + (Number(x.kilos) || 0), 0);
    const tLitros = next.reduce((acc, x) => acc + (Number(x.litros) || 0), 0);
    setTotals({ clientes: tClientes, kilos: tKilos, litros: tLitros });
  }

  function clearForm({ keepDay = true } = {}) {
    if (!keepDay) {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      setDay(`${y}-${m}-${d}`);
    }
    setRutaNumero("");
    setNombre("");
    setClientes("");
    setKilos("");
    setLitros("");
  }

  function isValidForm() {
    const r = toIntOrNull(rutaNumero);
    const c = toIntOrNull(clientes);
    const k = toFloatOrNull(kilos);
    const l = toFloatOrNull(litros);
    const n = normalizeName(nombre);

    if (!isValidDay(day)) return false;
    if (!r || r <= 0) return false;
    if (!n) return false;
    if (c === null || c < 0) return false;

    const kOk = k !== null && k >= 0;
    const lOk = l !== null && l >= 0;
    if (!kOk && !lOk) return false;

    return true;
  }

  function isValidEditForm() {
    const r = toIntOrNull(editRuta);
    const n = normalizeName(editNombre);
    const c = toIntOrNull(editClientes);
    const k = toFloatOrNull(editKilos);
    const l = toFloatOrNull(editLitros);

    if (!r || r <= 0) return { ok: false, msg: "Ruta inválida." };
    if (!n) return { ok: false, msg: "Nombre inválido." };
    if (c === null || c < 0) return { ok: false, msg: "Clientes inválido." };

    const kOk = k !== null && k >= 0;
    const lOk = l !== null && l >= 0;
    if (!kOk && !lOk) return { ok: false, msg: "Debe indicar kilos o litros (>= 0)." };

    return { ok: true, r, n, c, k: k ?? 0, l: l ?? 0 };
  }

  // -------------------------
  // Export CSV (Excel)
  // -------------------------
  function exportToCSV() {
    const rows = normalizeList(items);
    const header = ["HUB", "AÑO", "MES", "DIA", "RUTA", "NOMBRE", "CLIENTES", "KILOS", "LITROS"];
    const lines = [header.join(";")];

    for (const it of rows) {
      lines.push(
        [
          hub,
          String(year),
          pad2(month),
          String(it.day || ""),
          String(it.ruta_numero ?? ""),
          String(it.nombre || ""),
          String(it.clientes ?? 0),
          String(Number(it.kilos || 0).toFixed(2)).replace(".", ","),
          String(Number(it.litros || 0).toFixed(2)).replace(".", ","),
        ].join(";")
      );
    }

    lines.push("");
    lines.push(
      [
        "TOTALES_MES",
        "",
        "",
        "",
        "",
        "",
        String(totals.clientes || 0),
        String(format2(totals.kilos)).replace(".", ","),
        String(format2(totals.litros)).replace(".", ","),
      ].join(";")
    );

    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `kilos_litros_${hub}_${year}-${pad2(month)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // -------------------------
  // API
  // -------------------------
  async function loadKilosLitros() {
    setLoading(true);
    setError("");
    try {
      const url = `/api/hubs/${encodeURIComponent(hub)}/kiloslitros?year=${year}&month=${month}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando Kilos/Litros");

      const list = normalizeList(json.items || []);
      setItems(list);

      const t = json.totals || {};
      setTotals({
        clientes: Number(t.clientes || 0),
        kilos: Number(t.kilos || 0),
        litros: Number(t.litros || 0),
      });
    } catch (e) {
      setItems([]);
      setTotals({ clientes: 0, kilos: 0, litros: 0 });
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function addItem() {
    if (!isValidForm()) return;

    const payload = {
      day,
      ruta_numero: toIntOrNull(rutaNumero),
      nombre: normalizeName(nombre),
      clientes: toIntOrNull(clientes) ?? 0,
      kilos: toFloatOrNull(kilos) ?? 0,
      litros: toFloatOrNull(litros) ?? 0,
    };

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/hubs/${encodeURIComponent(hub)}/kiloslitros`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude agregar el registro");

      const it = json.item || json;
      if (!it || it.id == null) throw new Error("Respuesta inválida del servidor");

      const next = normalizeList([...normalizeList(items), it]);
      setItems(next);
      recalcTotals(next);

      clearForm({ keepDay: true });

      notify?.({
        type: "Kilos/Litros",
        title: "Registro agregado",
        message: `${hub} · ${it.day} · Ruta ${it.ruta_numero} · ${it.nombre}`,
      });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(it) {
    if (!it || it.id == null) return;

    const ok = window.confirm(`¿Desea usted borrar el registro ${it.day} · Ruta ${it.ruta_numero} · ${it.nombre}?`);
    if (!ok) return;

    setDeletingId(it.id);
    setError("");
    try {
      const res = await fetch(`/api/hubs/${encodeURIComponent(hub)}/kiloslitros/${it.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude borrar el registro");

      const next = normalizeList(items).filter((x) => Number(x.id) !== Number(it.id));
      setItems(next);
      recalcTotals(next);

      notify?.({
        type: "Kilos/Litros",
        title: "Registro eliminado",
        message: `${hub} · ${it.day} · Ruta ${it.ruta_numero}`,
      });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setDeletingId(null);
    }
  }

  function startInlineEdit(it) {
    setError("");
    setEditRowId(it.id);
    setEditRuta(String(it.ruta_numero ?? ""));
    setEditNombre(String(it.nombre ?? ""));
    setEditClientes(String(it.clientes ?? 0));
    setEditKilos(String(it.kilos ?? 0));
    setEditLitros(String(it.litros ?? 0));
  }

  function cancelInlineEdit() {
    setEditRowId(null);
    setEditRuta("");
    setEditNombre("");
    setEditClientes("");
    setEditKilos("");
    setEditLitros("");
  }

  async function saveInlineEdit(it) {
    const v = isValidEditForm();
    if (!v.ok) {
      setError(v.msg);
      return;
    }

    setUpdatingId(it.id);
    setError("");
    try {
      const payload = {
        ruta_numero: v.r,
        nombre: v.n,
        clientes: v.c,
        kilos: v.k,
        litros: v.l,
      };

      const res = await fetch(`/api/hubs/${encodeURIComponent(hub)}/kiloslitros/${it.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude editar el registro");

      const updated = json.item || json;
      if (!updated || updated.id == null) throw new Error("Respuesta inválida del servidor");

      // ✅ reemplazar en state (comparación robusta por Number)
      const next = normalizeList(items).map((x) => (Number(x.id) === Number(it.id) ? { ...x, ...updated } : x));
      setItems(next);
      recalcTotals(next);

      cancelInlineEdit();

      notify?.({
        type: "Kilos/Litros",
        title: "Registro editado",
        message: `${hub} · ${updated.day || it.day} · Ruta ${updated.ruta_numero} · ${updated.nombre}`,
      });

      // ✅ CLAVE para que "juan" desaparezca si ya no existe:
      // re-sincroniza con backend del mes actual
      await loadKilosLitros();
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setUpdatingId(null);
    }
  }

  // -------------------------
  // Effects
  // -------------------------
  useEffect(() => {
    setItems([]);
    setTotals({ clientes: 0, kilos: 0, litros: 0 });
    setError("");
    cancelInlineEdit();
    clearForm({ keepDay: true });
    loadKilosLitros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);

  useEffect(() => {
    cancelInlineEdit();
    loadKilosLitros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // -------------------------
  // Resumen por ruta (MES)
  // -------------------------
  const resumenPorRutaMes = useMemo(() => {
    const map = new Map();

    for (const it of normalizeList(items)) {
      const key = String(it.ruta_numero ?? "");
      if (!key) continue;

      const prev = map.get(key) || { ruta_numero: it.ruta_numero, clientes: 0, kilos: 0, litros: 0 };
      prev.clientes += Number(it.clientes || 0);
      prev.kilos += Number(it.kilos || 0);
      prev.litros += Number(it.litros || 0);
      map.set(key, prev);
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => Number(a.ruta_numero || 0) - Number(b.ruta_numero || 0));
    return arr;
  }, [items]);

  // -------------------------
  // Resumen por empleado (MES) ✅ AGRUPA POR NOMBRE NORMALIZADO
  // -------------------------
  const resumenPorEmpleadoMes = useMemo(() => {
    const map = new Map();

    for (const it of normalizeList(items)) {
      const key = normalizeName(it.nombre);
      if (!key) continue;

      const prev = map.get(key) || { nombre: key, clientes: 0, kilos: 0, litros: 0 };
      prev.clientes += Number(it.clientes || 0);
      prev.kilos += Number(it.kilos || 0);
      prev.litros += Number(it.litros || 0);
      map.set(key, prev);
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => b.kilos - a.kilos);
    return arr;
  }, [items]);

  // -------------------------
  // Histórico del día seleccionado
  // -------------------------
  const rowsSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return normalizeList(items).filter((x) => String(x.day || "") === String(selectedDay));
  }, [items, selectedDay]);

  // auto-ajusta mes/año según día seleccionado
  useEffect(() => {
    if (!isValidDay(selectedDay)) return;
    const y = Number(selectedDay.slice(0, 4));
    const m = Number(selectedDay.slice(5, 7));
    if (Number.isFinite(y) && Number.isFinite(m)) {
      if (y !== year) setYear(y);
      if (m !== month) setMonth(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.kicker}>KILOS / LITROS</div>
          <h3 style={styles.h3}>Resumen mensual + histórico por día</h3>
          <div style={styles.sub}>
            HUB seleccionado: <b>{hub}</b>
          </div>
        </div>

        <div style={styles.filters}>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={styles.select}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {pad2(m)}
              </option>
            ))}
          </select>

          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={styles.inputYear} min={2000} max={2100} />

          <button style={styles.btn} onClick={loadKilosLitros} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>

          <button style={styles.btnOrangeSoft} onClick={exportToCSV} disabled={items.length === 0}>
            Exportar a Excel (CSV)
          </button>
        </div>
      </div>

      {/* Resumen mensual HUB */}
      <div style={styles.summaryCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <h4 style={{ margin: 0 }}>
            Resumen mensual · {year}-{pad2(month)}
          </h4>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Totales del HUB</div>
        </div>

        <div style={styles.summaryGrid}>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Clientes</div>
            <div style={styles.sumValue}>{totals.clientes || 0}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Kilos</div>
            <div style={styles.sumValue}>{format2(totals.kilos)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Litros</div>
            <div style={styles.sumValue}>{format2(totals.litros)}</div>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div style={styles.formCard}>
        <div style={styles.formGrid5}>
          <div>
            <div style={styles.label}>Día</div>
            <input value={day} onChange={(e) => setDay(e.target.value)} style={styles.input} type="date" />
          </div>

          <div>
            <div style={styles.label}>Ruta</div>
            <input value={rutaNumero} onChange={(e) => setRutaNumero(e.target.value)} style={styles.input} inputMode="numeric" />
          </div>

          <div>
            <div style={styles.label}>Nombre</div>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={styles.input} placeholder="Ej: gabriel" />
          </div>

          <div>
            <div style={styles.label}>Clientes</div>
            <input value={clientes} onChange={(e) => setClientes(e.target.value)} style={styles.input} inputMode="numeric" />
          </div>

          <div>
            <div style={styles.label}>Kilos</div>
            <input value={kilos} onChange={(e) => setKilos(e.target.value)} style={styles.input} inputMode="decimal" />
          </div>

          <div>
            <div style={styles.label}>Litros</div>
            <input value={litros} onChange={(e) => setLitros(e.target.value)} style={styles.input} inputMode="decimal" />
          </div>

          <div style={{ display: "flex", alignItems: "end", gridColumn: "1 / -1" }}>
            <button style={styles.btnOrange} onClick={addItem} disabled={saving || !isValidForm()}>
              {saving ? "Agregando..." : "Agregar registro"}
            </button>
          </div>
        </div>

        {error && <div style={styles.err}>{error}</div>}
      </div>

      {/* Resumen por ruta (MES) */}
      <div style={styles.tableWrap}>
        <div style={styles.tableTitle}>
          <b>Resumen por ruta (mes)</b> <span style={{ opacity: 0.7 }}>· Suma total del mes por ruta</span>
        </div>

        {resumenPorRutaMes.length === 0 ? (
          <div style={styles.empty}>{loading ? "Cargando..." : "No hay datos para este mes."}</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Ruta</th>
                <th style={styles.th}>Clientes (mes)</th>
                <th style={styles.th}>Kilos (mes)</th>
                <th style={styles.th}>Litros (mes)</th>
              </tr>
            </thead>
            <tbody>
              {resumenPorRutaMes.map((r) => (
                <tr key={`rm-${r.ruta_numero}`}>
                  <td style={styles.td}>
                    <b>{r.ruta_numero}</b>
                  </td>
                  <td style={styles.td}>{r.clientes}</td>
                  <td style={styles.td}>{format2(r.kilos)}</td>
                  <td style={styles.td}>{format2(r.litros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Resumen por empleado (MES) */}
      <div style={styles.tableWrap}>
        <div style={styles.tableTitle}>
          <b>Resumen por empleado (mes)</b> <span style={{ opacity: 0.7 }}>· Suma total del mes por nombre</span>
        </div>

        {resumenPorEmpleadoMes.length === 0 ? (
          <div style={styles.empty}>{loading ? "Cargando..." : "No hay datos para este mes."}</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Clientes (mes)</th>
                <th style={styles.th}>Kilos (mes)</th>
                <th style={styles.th}>Litros (mes)</th>
              </tr>
            </thead>
            <tbody>
              {resumenPorEmpleadoMes.map((r) => (
                <tr key={`em-${r.nombre}`}>
                  <td style={styles.td}>
                    <b>{r.nombre}</b>
                  </td>
                  <td style={styles.td}>{r.clientes}</td>
                  <td style={styles.td}>{format2(r.kilos)}</td>
                  <td style={styles.td}>{format2(r.litros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Histórico del día seleccionado */}
      <div style={styles.tableWrap}>
        <div style={styles.dayPickerCard}>
          <div style={styles.dayPickerGrid}>
            <div style={{ minWidth: 220 }}>
              <div style={styles.label}>Día</div>
              <input value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} style={styles.dayInput} type="date" />
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                Histórico del día seleccionado: <b>{selectedDay || "—"}</b>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.tableTitle}>
          <b>Histórico del día</b> <span style={{ opacity: 0.7 }}>· {selectedDay}</span>
        </div>

        {rowsSelectedDay.length === 0 ? (
          <div style={styles.empty}>{loading ? "Cargando..." : "No hay registros para ese día."}</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Ruta</th>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Clientes</th>
                <th style={styles.th}>Kilos</th>
                <th style={styles.th}>Litros</th>
                <th style={{ ...styles.th, width: 260 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rowsSelectedDay.map((it) => {
                const isEditing = Number(editRowId) === Number(it.id);

                return (
                  <tr key={it.id}>
                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editRuta} onChange={(e) => setEditRuta(e.target.value)} style={styles.inlineInputSmall} inputMode="numeric" />
                      ) : (
                        <b>{it.ruta_numero}</b>
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} style={styles.inlineInput} placeholder="nombre" />
                      ) : (
                        it.nombre
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editClientes} onChange={(e) => setEditClientes(e.target.value)} style={styles.inlineInputSmall} inputMode="numeric" />
                      ) : (
                        it.clientes ?? 0
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editKilos} onChange={(e) => setEditKilos(e.target.value)} style={styles.inlineInputSmall} inputMode="decimal" />
                      ) : (
                        format2(it.kilos)
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editLitros} onChange={(e) => setEditLitros(e.target.value)} style={styles.inlineInputSmall} inputMode="decimal" />
                      ) : (
                        format2(it.litros)
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button style={styles.btnBlue} onClick={() => saveInlineEdit(it)} disabled={updatingId === it.id || deletingId === it.id}>
                            {updatingId === it.id ? "Guardando..." : "Guardar"}
                          </button>
                          <button style={styles.btnGray} onClick={cancelInlineEdit} disabled={updatingId === it.id}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button style={styles.btnBlue} onClick={() => startInlineEdit(it)} disabled={deletingId === it.id || updatingId === it.id}>
                            Editar
                          </button>
                          <button style={styles.btnDanger} onClick={() => deleteItem(it)} disabled={deletingId === it.id || updatingId === it.id}>
                            {deletingId === it.id ? "Borrando..." : "Eliminar"}
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

  filters: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  select: { padding: "10px 12px", borderRadius: 10, border: "1px solid #d9dde6", background: "white" },
  inputYear: { padding: "10px 12px", borderRadius: 10, border: "1px solid #d9dde6", width: 110 },

  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#203a43",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  btnOrangeSoft: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#fff7ed",
    color: "#c2410c",
    fontWeight: 950,
    cursor: "pointer",
  },

  dayPickerCard: {
    background: "white",
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,.10)",
  },
  dayPickerGrid: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  dayInput: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #d9dde6",
    background: "white",
    boxSizing: "border-box",
    fontSize: 14,
  },

  summaryCard: {
    background: "white",
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,.10)",
  },
  summaryGrid: {
    marginTop: 10,
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(3, minmax(160px, 1fr))",
  },
  sumBox: {
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 12,
    padding: 12,
    background: "#f8fafc",
  },
  sumLabel: { fontSize: 12, fontWeight: 900, opacity: 0.7 },
  sumValue: { marginTop: 6, fontSize: 20, fontWeight: 950 },

  formCard: {
    background: "white",
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,.10)",
  },
  formGrid5: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "220px 140px 1fr 160px 160px 160px",
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

  inlineInput: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d9dde6",
    background: "white",
    boxSizing: "border-box",
  },
  inlineInputSmall: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d9dde6",
    background: "white",
    boxSizing: "border-box",
    maxWidth: 110,
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

  btnBlue: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    width: "100%",
  },
  btnGray: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#e5e7eb",
    color: "#111827",
    fontWeight: 900,
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



