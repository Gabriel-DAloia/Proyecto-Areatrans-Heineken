import { useEffect, useMemo, useState } from "react";

const CODE_OPTIONS = [
  { value: "", label: "—" },
  { value: "1", label: "1 (Trabajo)" },
  { value: "F", label: "F (Festivo)" },
  { value: "D", label: "D (Descanso)" },
  { value: "V", label: "V (Vacaciones)" },
  { value: "E", label: "E (Enfermedad)" },
  { value: "L", label: "L (Licencia)" },
  { value: "O", label: "O (Otros)" },
  { value: "M", label: "M (Incapacidad)" },
  { value: "C", label: "C (Comp. Horas)" },
];

const WEEKDAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function Asistencias({ hub, notify }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1); // 1-12

  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  // Crear empleado
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Confirmación de borrado
  const [confirm, setConfirm] = useState(null); // { id, name }

  // Edición (asistencia)
  const [editing, setEditing] = useState(null); // { empId, day }
  const [editValue, setEditValue] = useState("");

  // Edición (horas extra)
  const [editingHE, setEditingHE] = useState(null); // { empId, day }
  const [editHE, setEditHE] = useState("");

  // Pendientes: asistencias y horas extra
  const [pending, setPending] = useState({});

  const token = useMemo(() => localStorage.getItem("token"), []);

  function daysArray(n) {
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function dateForDay(day) {
    return `${year}-${pad2(month)}-${pad2(day)}`; // YYYY-MM-DD
  }

  function weekdayForDay(day) {
    const d = new Date(year, month - 1, day);
    return WEEKDAYS_ES[d.getDay()];
  }

  function isWeekend(day) {
    const wd = new Date(year, month - 1, day).getDay();
    return wd === 0 || wd === 6; // Dom/Sab
  }

  // ✅ Por defecto Sáb/Dom = "D" si no hay valor guardado todavía
  function defaultCodeForDay(day) {
    return isWeekend(day) ? "D" : "";
  }

  function effectiveCode(row, day) {
    const stored = row?.days?.[String(day)];
    if (stored !== undefined && stored !== null && stored !== "") return stored;
    return defaultCodeForDay(day);
  }

  function pKey(type, empId, day) {
    return `${type}|${empId}|${day}`;
  }

  function hasPending() {
    return Object.keys(pending).length > 0;
  }

  // ✅ suma HE (acepta coma o punto) + formato ES con coma
  function sumExtraHours(extraHoursMap) {
    if (!extraHoursMap) return 0;
    let total = 0;
    for (const v of Object.values(extraHoursMap)) {
      if (!v) continue;
      const num = Number(String(v).replace(",", "."));
      if (!Number.isNaN(num)) total += num;
    }
    return Math.round(total * 100) / 100;
  }

  function formatNumberES(n) {
    const s = String(n);
    return s.includes(".") ? s.replace(".", ",") : s;
  }

  function csvEscape(value) {
    const s = value == null ? "" : String(value);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadAsCSV() {
    if (!data) return;

    const days = data?.days_in_month ? daysArray(data.days_in_month) : [];

    // columnas: empleado + días + totales + HE total + HE por día
    const headers = [
      "Empleado",
      ...days.map((d) => `D${pad2(d)}`),
      "Trab",
      "Desc",
      "Vac",
      "Enf",
      "Fest",
      "HE",
      ...days.map((d) => `HE${pad2(d)}`),
    ];

    const lines = [];
    lines.push(headers.map(csvEscape).join(","));

    for (const r of data.rows || []) {
      const heSum = sumExtraHours(r.extra_hours);
      const row = [
        r.employee.name,
        ...days.map((d) => effectiveCode(r, d)),
        r.totals?.trabajo ?? "",
        r.totals?.descanso ?? "",
        r.totals?.vacaciones ?? "",
        r.totals?.enfermedad ?? "",
        r.totals?.festivos ?? "",
        formatNumberES(heSum),
        ...days.map((d) => (r.extra_hours?.[String(d)] ?? "")),
      ];
      lines.push(row.map(csvEscape).join(","));
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `Asistencias_${hub.replaceAll(" ", "_")}_${year}-${pad2(month)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const url = `${base}/api/hubs/${encodeURIComponent(hub)}/asistencias?year=${year}&month=${month}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando asistencias");

      const rows = (json.rows || []).map((r) => ({
        ...r,
        extra_hours: r.extra_hours || {},
      }));

      setData({ ...json, rows });
      setPending({});
      setEditing(null);
      setEditValue("");
      setEditingHE(null);
      setEditHE("");
    } catch (e) {
      setError(e.message || "Error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, year, month]);

  const days = data?.days_in_month ? daysArray(data.days_in_month) : [];

  async function addEmployee() {
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/employees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude crear el empleado");

      setNewName("");
      notify?.({ type: "Asistencias", title: "Empleado creado", message: `${hub}: ${name}` });
      await load();
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setCreating(false);
    }
  }

  async function deleteEmployeeConfirmed(emp) {
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(
        `${base}/api/hubs/${encodeURIComponent(hub)}/employees/${encodeURIComponent(emp.id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude eliminar el empleado");

      notify?.({ type: "Asistencias", title: "Empleado eliminado", message: `${hub}: ${emp.name}` });
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e.message || "Error");
    }
  }

  // ============ Asistencias (códigos) ============
  function openEdit(empId, day, currentCode) {
    setEditing({ empId, day });
    setEditValue(currentCode ?? "");
  }

  function closeEdit() {
    setEditing(null);
    setEditValue("");
  }

  function applyLocalAttendance(empId, day, code) {
    // ✅ si es finde y el usuario elige "—", volvemos a "D" (descanso por defecto)
    const finalCode = isWeekend(day) && code === "" ? "D" : code;

    setData((prev) => {
      if (!prev) return prev;

      const rows = prev.rows.map((r) => {
        if (r.employee.id !== empId) return r;

        const newDays = { ...r.days, [String(day)]: finalCode };
        if (finalCode === "") delete newDays[String(day)];

        const values = Object.values(newDays);
        const trabajo = values.filter((v) => v === "1" || v === "F").length;
        const festivos = values.filter((v) => v === "F").length;
        const descanso = values.filter((v) => v === "D").length;
        const vacaciones = values.filter((v) => v === "V").length;
        const enfermedad = values.filter((v) => v === "E").length;

        return {
          ...r,
          days: newDays,
          totals: { ...r.totals, trabajo, festivos, descanso, vacaciones, enfermedad },
        };
      });

      return { ...prev, rows };
    });

    setPending((prev) => ({
      ...prev,
      [pKey("A", empId, day)]: { type: "A", empId, day, code: finalCode },
    }));
  }

  // ============ Horas extra ============
  function openEditHE(empId, day, currentValue) {
    setEditingHE({ empId, day });
    setEditHE(currentValue ?? "");
  }

  function closeEditHE() {
    setEditingHE(null);
    setEditHE("");
  }

  function applyLocalExtraHours(empId, day, hoursText) {
    const clean = (hoursText ?? "").trim();

    setData((prev) => {
      if (!prev) return prev;

      const rows = prev.rows.map((r) => {
        if (r.employee.id !== empId) return r;
        const eh = { ...(r.extra_hours || {}) };
        if (!clean) delete eh[String(day)];
        else eh[String(day)] = clean;
        return { ...r, extra_hours: eh };
      });

      return { ...prev, rows };
    });

    setPending((prev) => ({
      ...prev,
      [pKey("HE", empId, day)]: { type: "HE", empId, day, hours: clean },
    }));
  }

  async function saveAllChanges() {
    if (!hasPending()) return;

    setSavingAll(true);
    setError("");

    try {
      const changes = Object.values(pending);
      const base = import.meta.env.VITE_API_URL || "";

      for (const ch of changes) {
        if (ch.type === "A") {
          const res = await fetch(
            `${base}/api/hubs/${encodeURIComponent(hub)}/asistencias/${encodeURIComponent(ch.empId)}/day`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ date: dateForDay(ch.day), code: ch.code }),
            }
          );

          const text = await res.text();
          const json = text ? JSON.parse(text) : {};
          if (!res.ok) throw new Error(json?.error || "No pude guardar asistencias");
        }

        if (ch.type === "HE") {
          const res = await fetch(
            `${base}/api/hubs/${encodeURIComponent(hub)}/asistencias/${encodeURIComponent(ch.empId)}/extra-hours`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ date: dateForDay(ch.day), hours: ch.hours }),
            }
          );

          const text = await res.text();
          const json = text ? JSON.parse(text) : {};
          if (!res.ok) throw new Error(json?.error || "No pude guardar horas extra");
        }
      }

      setPending({});
      notify?.({
        type: "Asistencias",
        title: "Cambios guardados",
        message: `${hub}: ${changes.length} cambio(s)`,
      });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.headerCard}>
        <div>
          <div style={styles.kicker}>ASISTENCIAS</div>
          <h3 style={styles.h3}>Control mensual</h3>
          <div style={styles.sub}>
            HUB: <b>{hub}</b>
          </div>
        </div>

        <div style={styles.filters}>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={styles.select}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>

          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={styles.input}
            min={2000}
            max={2100}
          />

          <button onClick={load} style={styles.btn}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>

          <button
            onClick={saveAllChanges}
            style={{ ...styles.btnOrange, ...(hasPending() ? {} : styles.btnDisabled) }}
            disabled={!hasPending() || savingAll}
            title="Guarda todos los cambios pendientes"
          >
            {savingAll ? "Guardando..." : `Guardar cambios${hasPending() ? ` (${Object.keys(pending).length})` : ""}`}
          </button>
        </div>
      </div>

      {/* Crear empleado */}
      <div style={styles.createRow}>
        <input
          style={styles.inputGrow}
          placeholder="Nombre y apellidos del nuevo empleado"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button style={styles.btn} onClick={addEmployee} disabled={creating}>
          {creating ? "Añadiendo..." : "Añadir persona"}
        </button>
      </div>

      {error && <div style={styles.err}>{error}</div>}

      {hasPending() && (
        <div style={styles.pendingBar}>
          Tienes <b>{Object.keys(pending).length}</b> cambio(s) sin guardar.
        </div>
      )}

      {data && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thStickyLeft}>Nombres y apellidos</th>

                {days.map((d) => {
                  const wk = weekdayForDay(d);
                  const weekend = isWeekend(d);

                  return (
                    <th key={d} style={{ ...styles.thDay, ...(weekend ? styles.thWeekend : {}) }}>
                      <div style={styles.thDayNum}>{String(d).padStart(2, "0")}</div>
                      <div style={styles.thDayName}>{wk}</div>
                    </th>
                  );
                })}

                <th style={styles.thTotal}>Trab.</th>
                <th style={styles.thTotal}>Desc.</th>
                <th style={styles.thTotal}>Vac.</th>
                <th style={styles.thTotal}>Enf.</th>
                <th style={styles.thTotal}>Fest.</th>
                <th style={styles.thTotal}>HE</th>
                <th style={styles.thAction}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {data.rows.map((r) => {
                const empId = r.employee.id;
                const heSum = sumExtraHours(r.extra_hours);

                return (
                  <>
                    {/* Fila Asistencias */}
                    <tr key={`A-${empId}`}>
                      <td style={styles.tdStickyLeft}>{r.employee.name}</td>

                      {days.map((d) => {
                        const codeShown = effectiveCode(r, d); // ✅ aquí aplica D por defecto en finde
                        const isEditing = editing?.empId === empId && editing?.day === d;

                        const dirty = Boolean(pending[pKey("A", empId, d)]);
                        const weekend = isWeekend(d);

                        return (
                          <td
                            key={`A-${empId}-${d}`}
                            style={{
                              ...cellStyle(codeShown, weekend),
                              ...(dirty ? styles.dirtyCell : {}),
                              ...(isEditing ? styles.editingCell : {}),
                            }}
                            onClick={() => openEdit(empId, d, codeShown)}
                            title={dirty ? "Pendiente de guardar" : "Click para editar"}
                          >
                            {isEditing ? (
                              <select
                                autoFocus
                                value={editValue ?? ""}
                                style={styles.cellSelect}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setEditValue(next);
                                  closeEdit();
                                  if (next !== (codeShown ?? "")) applyLocalAttendance(empId, d, next);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    closeEdit();
                                  }
                                }}
                              >
                                {CODE_OPTIONS.map((opt) => (
                                  <option key={opt.value || "__empty__"} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span style={styles.cellText}>{codeShown}</span>
                            )}
                          </td>
                        );
                      })}

                      <td style={styles.tdTotal}>{r.totals.trabajo}</td>
                      <td style={styles.tdTotal}>{r.totals.descanso}</td>
                      <td style={styles.tdTotal}>{r.totals.vacaciones}</td>
                      <td style={styles.tdTotal}>{r.totals.enfermedad}</td>
                      <td style={styles.tdTotal}>{r.totals.festivos}</td>
                      <td style={styles.tdTotal}>{formatNumberES(heSum)}</td>

                      <td style={styles.tdAction}>
                        <button
                          style={styles.dangerBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirm({ id: empId, name: r.employee.name });
                          }}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>

                    {/* Fila Horas Extra */}
                    <tr key={`HE-${empId}`}>
                      <td style={styles.tdStickyLeftHE}>
                        <span style={styles.heLabel}>Horas Extras</span>
                      </td>

                      {days.map((d) => {
                        const val = r.extra_hours?.[String(d)] || "";
                        const isEditingRow = editingHE?.empId === empId && editingHE?.day === d;

                        const dirty = Boolean(pending[pKey("HE", empId, d)]);
                        const weekend = isWeekend(d);

                        return (
                          <td
                            key={`HE-${empId}-${d}`}
                            style={{
                              ...styles.tdHE,
                              ...(weekend ? styles.cellWeekend : {}),
                              ...(dirty ? styles.dirtyCell : {}),
                              ...(isEditingRow ? styles.editingCell : {}),
                            }}
                            onClick={() => openEditHE(empId, d, val)}
                            title={dirty ? "Pendiente de guardar" : "Click para editar horas"}
                          >
                            {isEditingRow ? (
                              <input
                                autoFocus
                                value={editHE ?? ""}
                                style={styles.heInput}
                                placeholder="0,5"
                                onChange={(e) => setEditHE(e.target.value)}
                                onBlur={() => {
                                  const next = (editHE ?? "").trim();
                                  closeEditHE();
                                  if (next !== (val ?? "")) applyLocalExtraHours(empId, d, next);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    closeEditHE();
                                  }
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const next = (editHE ?? "").trim();
                                    closeEditHE();
                                    if (next !== (val ?? "")) applyLocalExtraHours(empId, d, next);
                                  }
                                }}
                              />
                            ) : (
                              <span style={styles.heText}>{val}</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Trab, Desc, Vac, Enf, Fest, HE, Acción => 7 */}
                      <td style={styles.tdTotalMuted} colSpan={7} />
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.legend}>
        <b>Leyenda:</b> 1=Trabajo · F=Festivo · D=Descanso · V=Vacaciones · E=Enfermedad · HE = suma horas extra.
        <div style={{ marginTop: 6 }}>
          * Sáb/Dom aparecen como <b>D</b> por defecto, pero puedes cambiarlos si el empleado trabaja.
        </div>
      </div>

      {/* ✅ Descargar plantilla */}
      <div style={styles.downloadRow}>
        <button onClick={downloadAsCSV} style={styles.btnOrange} disabled={!data}>
          Descargar plantilla (Excel)
        </button>
        <div style={styles.downloadHint}>
          Se descarga en <b>.csv</b> y se abre con Excel.
        </div>
      </div>

      {/* Modal confirmación borrar */}
      {confirm && (
        <div style={styles.modalOverlay} onMouseDown={() => setConfirm(null)}>
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h4 style={styles.modalTitle}>Confirmar eliminación</h4>
            <p style={styles.modalText}>
              ¿De verdad deseas eliminar a <b>{confirm.name}</b>?
            </p>
            <div style={styles.modalActions}>
              <button style={styles.btn} onClick={() => setConfirm(null)}>
                No
              </button>
              <button style={styles.dangerBtnBig} onClick={() => deleteEmployeeConfirmed(confirm)}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function cellStyle(code, weekend) {
  const base = { ...styles.td };
  if (weekend) base.background = styles.cellWeekend.background;

  if (code === "D") return { ...base, background: weekend ? "#5f6368" : "#52b788", color: "white", fontWeight: 900 };
  if (code === "E") return { ...base, background: weekend ? "#5f6368" : "#3b82f6", color: "white", fontWeight: 900 };
  if (code === "V") return { ...base, background: weekend ? "#5f6368" : "#fde68a", color: "#111", fontWeight: 900 };
  if (code === "F") return { ...base, background: weekend ? "#5f6368" : "#f59e0b", color: "#111", fontWeight: 900 };
  if (code === "1") return { ...base, background: weekend ? "#5f6368" : "white", color: "#111", fontWeight: 800 };
  if (code) return { ...base, background: weekend ? "#5f6368" : "#fff7ed", color: "#111", fontWeight: 900 };
  return base;
}

const styles = {
  wrap: { display: "grid", gap: 12 },

  headerCard: {
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
    background: "#fff7ed",
    color: "#c2410c",
  },
  h3: { margin: "6px 0 0", fontSize: 18, fontWeight: 950 },
  sub: { marginTop: 6, opacity: 0.8, fontSize: 13 },

  filters: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  select: { padding: "10px 12px", borderRadius: 10, border: "1px solid #d9dde6", background: "white" },
  input: { padding: "10px 12px", borderRadius: 10, border: "1px solid #d9dde6", width: 110 },
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
  },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed" },

  createRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  inputGrow: {
    flex: "1 1 320px",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d9dde6",
  },

  pendingBar: {
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.10)",
    background: "#fff7ed",
    color: "#9a3412",
    fontSize: 13,
    fontWeight: 800,
  },

  err: {
    padding: 10,
    borderRadius: 10,
    background: "#fdecea",
    color: "#922b21",
    border: "1px solid #f5c6cb",
  },

  tableWrap: {
    overflow: "auto",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.10)",
    background: "white",
  },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 1200 },

  thDay: {
    position: "sticky",
    top: 0,
    background: "#fff7ed",
    borderBottom: "1px solid #eee",
    padding: 6,
    fontSize: 12,
    minWidth: 36,
  },
  thWeekend: { background: "#d1d5db" },
  thDayNum: { fontWeight: 950, lineHeight: 1.1, color: "#111" },
  thDayName: { fontSize: 11, opacity: 0.75, marginTop: 2, color: "#111" },

  thTotal: {
    position: "sticky",
    top: 0,
    background: "#fff7ed",
    borderBottom: "1px solid #eee",
    padding: 8,
    fontSize: 12,
    width: 60,
  },
  thAction: {
    position: "sticky",
    top: 0,
    background: "#fff7ed",
    borderBottom: "1px solid #eee",
    padding: 8,
    fontSize: 12,
    width: 90,
  },
  thStickyLeft: {
    position: "sticky",
    top: 0,
    left: 0,
    zIndex: 3,
    background: "#fff7ed",
    borderBottom: "1px solid #eee",
    padding: 8,
    textAlign: "left",
    minWidth: 320,
  },

  td: {
    borderBottom: "1px solid #f2f2f2",
    borderRight: "1px solid #f2f2f2",
    padding: 6,
    textAlign: "center",
    fontSize: 12,
    minWidth: 30,
    cursor: "pointer",
    userSelect: "none",
    background: "white",
  },
  cellWeekend: { background: "#6b7280", color: "white" },

  tdStickyLeft: {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "white",
    borderBottom: "1px solid #f2f2f2",
    borderRight: "1px solid #f2f2f2",
    padding: 8,
    textAlign: "left",
    fontWeight: 900,
    minWidth: 320,
  },

  tdStickyLeftHE: {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "#fff7ed",
    borderBottom: "1px solid #f2f2f2",
    borderRight: "1px solid #f2f2f2",
    padding: 8,
    textAlign: "left",
    minWidth: 320,
  },
  heLabel: { fontWeight: 950, color: "#c2410c" },

  tdHE: {
    borderBottom: "1px solid #f2f2f2",
    borderRight: "1px solid #f2f2f2",
    padding: 6,
    textAlign: "center",
    fontSize: 12,
    minWidth: 30,
    cursor: "pointer",
    background: "#fff7ed",
  },
  heText: { fontWeight: 900, color: "#9a3412" },
  heInput: {
    width: "100%",
    borderRadius: 8,
    border: "1px solid #d9dde6",
    padding: "6px 6px",
    outline: "none",
    fontSize: 12,
    background: "white",
  },

  editingCell: { outline: "2px solid rgba(32,58,67,.35)", padding: 2 },
  cellSelect: {
    width: "100%",
    fontSize: 12,
    borderRadius: 8,
    border: "1px solid #d9dde6",
    padding: "6px 6px",
    outline: "none",
    background: "white",
  },
  cellText: { display: "inline-block", minHeight: 14 },

  dirtyCell: {
    outline: "2px solid rgba(249, 115, 22, .35)",
    boxShadow: "inset 0 0 0 1px rgba(249, 115, 22, .25)",
  },

  tdTotal: {
    borderBottom: "1px solid #f2f2f2",
    borderRight: "1px solid #f2f2f2",
    padding: 6,
    textAlign: "center",
    fontWeight: 950,
    fontSize: 12,
    background: "white",
  },
  tdTotalMuted: { borderBottom: "1px solid #f2f2f2", padding: 6, background: "#fff" },

  tdAction: { borderBottom: "1px solid #f2f2f2", padding: 6, textAlign: "center", background: "white" },

  dangerBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#922b21",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
    fontSize: 12,
  },

  legend: { fontSize: 13, opacity: 0.85 },

  downloadRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    background: "white",
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,.10)",
    boxShadow: "0 10px 26px rgba(0,0,0,.06)",
  },
  downloadHint: { fontSize: 13, opacity: 0.75 },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 9999,
  },
  modal: {
    width: "100%",
    maxWidth: 460,
    background: "white",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 15px 50px rgba(0,0,0,.35)",
  },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 950 },
  modalText: { marginTop: 10, marginBottom: 0, opacity: 0.85 },
  modalActions: { marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" },
  dangerBtnBig: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#922b21",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
  },
};

