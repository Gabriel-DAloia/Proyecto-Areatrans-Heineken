import { useEffect, useMemo, useState, Fragment } from "react";

const WEEKDAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Ajusta estas alturas si cambias paddings/fuentes
const HEADER_ROW_1_H = 42; // fila "Ruta 002"
const HEADER_ROW_2_H = 36; // fila "Repartidor / Metálico / ..."

export default function Liquidaciones({ hub, notify }) {
  const token = useMemo(() => localStorage.getItem("token"), []);

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [routes, setRoutes] = useState([]); // [{id, code}]
  const [loadingRoutes, setLoadingRoutes] = useState(false);

  // dataByRoute[code] = { rows:[{day,repartidor,metalico,ingreso,comment}] }
  const [dataByRoute, setDataByRoute] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // crear nueva ruta
  const [newRouteCode, setNewRouteCode] = useState("");
  const [creatingRoute, setCreatingRoute] = useState(false);

  // =========================
  // Helpers texto / fechas
  // =========================
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function ymd(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function weekdayLabel(y, m, d) {
    return WEEKDAYS_ES[new Date(y, m - 1, d).getDay()];
  }

  function isWeekend(y, m, d) {
    const wd = new Date(y, m - 1, d).getDay();
    return wd === 0 || wd === 6;
  }

  function normalizeName(value) {
    // minúsculas + espacios normales
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  // =========================
  // Helpers números ES
  // =========================
  function parseMoneyES(str) {
    if (!str) return 0;
    const s = String(str).trim().replace(/\./g, "").replace(",", ".");
    const v = Number(s);
    return Number.isFinite(v) ? v : 0;
  }

  function formatMoneyES(num) {
    const sign = num < 0 ? "-" : "";
    const abs = Math.abs(num);
    const parts = abs.toFixed(2).split(".");
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const dec = parts[1];
    return `${sign}${int},${dec}`;
  }

  // + = depositó de menos (debe)
  // - = depositó de más (a favor)
  function diffValue(metalicoStr, ingresoStr) {
    return parseMoneyES(metalicoStr) - parseMoneyES(ingresoStr);
  }

  function diffLabel(num) {
    if (!num) return "—";
    return `${formatMoneyES(num)} €`;
  }

  // =========================
  // días del mes
  // =========================
  const days = useMemo(() => {
    const dim = daysInMonth(year, month);
    return Array.from({ length: dim }, (_, i) => i + 1);
  }, [year, month]);

  // =========================
  // Autocompletado repartidores
  // =========================
  const repartidoresList = useMemo(() => {
    const set = new Set();
    for (const r of routes) {
      const code = String(r.code);
      const rows = dataByRoute?.[code]?.rows || [];
      for (const row of rows) {
        const name = normalizeName(row.repartidor);
        if (name) set.add(name);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [routes, dataByRoute]);

  // =========================
  // API
  // =========================
  async function loadRoutes() {
    setLoadingRoutes(true);
    setError("");
    try {
      const res = await fetch(`/api/hubs/${encodeURIComponent(hub)}/liquidaciones/routes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando rutas");
      const list = (json.routes || []).map((x) => ({ ...x, code: String(x.code) }));
      setRoutes(list);
      return list;
    } catch (e) {
      setRoutes([]);
      throw e;
    } finally {
      setLoadingRoutes(false);
    }
  }

  async function loadMonthForRoute(code) {
    const url = `/api/hubs/${encodeURIComponent(hub)}/liquidaciones?year=${year}&month=${month}&route_code=${encodeURIComponent(
      code
    )}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(json?.error || `Error cargando ruta ${code}`);
    return json;
  }

  async function loadAllRoutesMonth(list) {
    setLoading(true);
    setError("");
    try {
      const codes = (list || routes).map((r) => String(r.code));

      const results = await Promise.all(
        codes.map(async (code) => {
          const data = await loadMonthForRoute(code);
          return [code, data];
        })
      );

      const obj = {};
      for (const [code, data] of results) obj[code] = data;

      setDataByRoute(obj);
      setPending(false);
    } catch (e) {
      setDataByRoute({});
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function createRoute() {
    const code = newRouteCode.trim();
    if (!code) return;

    setCreatingRoute(true);
    setError("");
    try {
      const res = await fetch(`/api/hubs/${encodeURIComponent(hub)}/liquidaciones/routes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude crear la ruta");

      notify?.({ type: "Liquidaciones", title: "Ruta creada", message: `${hub}: ${code}` });
      setNewRouteCode("");

      const list = await loadRoutes();
      await loadAllRoutesMonth(list);
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setCreatingRoute(false);
    }
  }

  // =========================
  // Estado tabla
  // =========================
  function getRow(routeCode, dayYmd) {
    const data = dataByRoute[routeCode];
    const rows = data?.rows || [];
    return (
      rows.find((r) => r.day === dayYmd) || {
        day: dayYmd,
        repartidor: "",
        metalico: "",
        ingreso: "",
        comment: "",
      }
    );
  }

  function updateCell(routeCode, dayYmd, patch) {
    setDataByRoute((prev) => {
      const copy = { ...prev };
      const data = copy[routeCode] || { rows: [] };
      const rows = [...(data.rows || [])];

      const idx = rows.findIndex((r) => r.day === dayYmd);
      const base =
        idx >= 0 ? rows[idx] : { day: dayYmd, repartidor: "", metalico: "", ingreso: "", comment: "" };

      const next = { ...base, ...patch };

      if (Object.prototype.hasOwnProperty.call(patch, "repartidor")) {
        next.repartidor = normalizeName(patch.repartidor);
      }

      if (idx >= 0) rows[idx] = next;
      else rows.push(next);

      rows.sort((a, b) => (a.day > b.day ? 1 : -1));
      copy[routeCode] = { ...data, rows };
      return copy;
    });

    setPending(true);
  }

  async function saveAll() {
    if (!pending) return;
    setSavingAll(true);
    setError("");
    try {
      const codes = routes.map((r) => String(r.code));

      for (const code of codes) {
        const data = dataByRoute[code];
        if (!data) continue;

        const res = await fetch(`/api/hubs/${encodeURIComponent(hub)}/liquidaciones`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            year,
            month,
            route_code: code,
            rows: (data.rows || []).map((r) => ({
              ...r,
              repartidor: normalizeName(r.repartidor),
              comment: String(r.comment || "").trim(),
            })),
          }),
        });

        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) throw new Error(json?.error || `No pude guardar ruta ${code}`);
      }

      setPending(false);
      notify?.({ type: "Liquidaciones", title: "Guardado", message: `${hub} · ${pad2(month)}/${year}` });
    } catch (e) {
      setError(e.message || "Error guardando");
    } finally {
      setSavingAll(false);
    }
  }

  // =========================
  // Carga inicial / cambios
  // =========================
  useEffect(() => {
    (async () => {
      try {
        setError("");
        setDataByRoute({});
        setPending(false);
        const list = await loadRoutes();
        if (list.length > 0) await loadAllRoutesMonth(list);
      } catch (e) {
        setError(e.message || "Error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);

  useEffect(() => {
    (async () => {
      if (routes.length === 0) return;
      await loadAllRoutesMonth(routes);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // =========================
  // Resumen por repartidor (con comentarios)
  // =========================
  const resumen = useMemo(() => {
    // name -> { total, comments:Set }
    const map = new Map();

    for (const r of routes) {
      const code = String(r.code);
      const data = dataByRoute[code];
      if (!data?.rows) continue;

      for (const row of data.rows) {
        const name = normalizeName(row.repartidor);
        if (!name) continue;

        const diff = diffValue(row.metalico, row.ingreso);
        const comment = String(row.comment || "").trim();

        if (!map.has(name)) map.set(name, { total: 0, comments: new Set() });

        const acc = map.get(name);
        acc.total += diff;
        if (comment) acc.comments.add(comment);
      }
    }

    return Array.from(map.entries())
      .map(([name, v]) => ({ name, total: v.total, comments: Array.from(v.comments) }))
      .filter((x) => Math.abs(x.total) > 0.00001 || (x.comments?.length || 0) > 0)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [routes, dataByRoute]);

  // =========================
  // Resumen por ruta del mes + descuadres (día / quién / comentario)
  // =========================
  const resumenRutas = useMemo(() => {
    const arr = [];

    for (const r of routes) {
      const code = String(r.code);
      const data = dataByRoute[code];
      const rows = data?.rows || [];

      let totalMetalico = 0;
      let totalIngreso = 0;
      let totalDiff = 0;

      const descuadres = [];

      for (const row of rows) {
        const metal = parseMoneyES(row.metalico);
        const ing = parseMoneyES(row.ingreso);
        const diff = metal - ing;

        totalMetalico += metal;
        totalIngreso += ing;
        totalDiff += diff;

        if (diff !== 0) {
          descuadres.push({
            day: row.day,
            repartidor: normalizeName(row.repartidor),
            diff,
            comment: String(row.comment || "").trim(),
          });
        }
      }

      arr.push({
        code,
        totalMetalico,
        totalIngreso,
        totalDiff,
        descuadres: descuadres.sort((a, b) => (a.day > b.day ? 1 : -1)),
      });
    }

    return arr.sort((a, b) => Math.abs(b.totalDiff) - Math.abs(a.totalDiff));
  }, [routes, dataByRoute]);

  // =========================
  // Render
  // =========================
  return (
    <div style={styles.wrap}>
      <div style={styles.headerCard}>
        <div>
          <div style={styles.kicker}>LIQUIDACIONES</div>
          <h3 style={styles.h3}>Mes a mes · Por rutas</h3>
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

          <button onClick={() => loadAllRoutesMonth(routes)} style={styles.btn}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>

          <button
            onClick={saveAll}
            style={{ ...styles.btnOrange, ...(pending ? {} : styles.btnDisabled) }}
            disabled={!pending || savingAll}
          >
            {savingAll ? "Guardando..." : "Guardar todo"}
          </button>
        </div>
      </div>

      <div style={styles.createRow}>
        <input
          style={styles.inputGrow}
          placeholder="Nueva ruta (ej: 103, 143, 310...)"
          value={newRouteCode}
          onChange={(e) => setNewRouteCode(e.target.value)}
        />
        <button style={styles.btn} onClick={createRoute} disabled={creatingRoute}>
          {creatingRoute ? "Creando..." : "Crear ruta"}
        </button>
      </div>

      {error && <div style={styles.err}>{error}</div>}
      {pending && <div style={styles.pendingBar}>Tienes cambios sin guardar.</div>}

      <div style={styles.sheetWrap}>
        <div style={styles.sheetScroll}>
          <table style={styles.sheetTable}>
            <thead>
              {/* ====== HEADER ROW 1 (sticky top:0) ====== */}
              <tr>
                <th style={styles.thStickyDateTop}>FECHA</th>

                {routes.map((r) => (
                  <th key={`hdr-${r.code}`} colSpan={5} style={styles.thRouteGroupSticky}>
                    Ruta {r.code}
                  </th>
                ))}
              </tr>

              {/* ====== HEADER ROW 2 (sticky top: altura fila 1) ====== */}
              <tr>
                <th style={styles.thStickyDateTop2}></th>

                {routes.map((r) => (
                  <Fragment key={`subhdr-${r.code}`}>
                    <th style={styles.thSubSticky}>REPARTIDOR</th>
                    <th style={styles.thSubSticky}>METÁLICO</th>
                    <th style={styles.thSubSticky}>INGRESO</th>
                    <th style={styles.thSubSticky}>DIFERENCIA</th>
                    <th style={styles.thSubSticky}>COMENTARIO</th>
                  </Fragment>
                ))}
              </tr>
            </thead>

            <tbody>
              {days.map((d) => {
                const dayYmd = ymd(year, month, d);
                const wk = weekdayLabel(year, month, d);
                const weekend = isWeekend(year, month, d);

                return (
                  <tr key={dayYmd} style={weekend ? styles.weekendRow : undefined}>
                    <td style={{ ...styles.tdStickyDate, ...(weekend ? styles.weekendDateCell : {}) }}>
                      <div style={styles.dateNum}>{dayYmd}</div>
                      <div style={styles.dateWk}>{wk}</div>
                    </td>

                    {routes.map((r) => {
                      const code = String(r.code);
                      const row = getRow(code, dayYmd);

                      const diff = diffValue(row.metalico, row.ingreso);
                      const diffStyle =
                        diff > 0 ? styles.diffPositive : diff < 0 ? styles.diffNegative : styles.diffZero;

                      return (
                        <Fragment key={`${code}-${dayYmd}`}>
                          <td style={styles.td}>
                            <input
                              style={styles.cellInput}
                              value={row.repartidor || ""}
                              onChange={(e) => updateCell(code, dayYmd, { repartidor: e.target.value })}
                              placeholder="ej: gabriel"
                              list="repartidores-list"
                            />
                          </td>

                          <td style={styles.td}>
                            <input
                              style={styles.cellInput}
                              value={row.metalico || ""}
                              onChange={(e) => updateCell(code, dayYmd, { metalico: e.target.value })}
                              placeholder="0,00"
                              inputMode="decimal"
                            />
                          </td>

                          <td style={styles.td}>
                            <input
                              style={styles.cellInput}
                              value={row.ingreso || ""}
                              onChange={(e) => updateCell(code, dayYmd, { ingreso: e.target.value })}
                              placeholder="0,00"
                              inputMode="decimal"
                            />
                          </td>

                          <td style={{ ...styles.td, ...styles.diffCell, ...diffStyle }}>
                            {diff === 0 ? "—" : diffLabel(diff)}
                          </td>

                          <td style={styles.td}>
                            <input
                              style={styles.cellInput}
                              value={row.comment || ""}
                              onChange={(e) => updateCell(code, dayYmd, { comment: e.target.value })}
                              placeholder="nota..."
                            />
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <datalist id="repartidores-list">
        {repartidoresList.map((name) => (
          <option key={`rep-${name}`} value={name} />
        ))}
      </datalist>

      <div style={styles.summaryCard}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h4 style={{ margin: 0 }}>Resumen por repartidor</h4>
          <div style={{ fontSize: 13, opacity: 0.75 }}>(+ debe · − a favor)</div>
        </div>

        {resumen.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.75 }}>No hay diferencias registradas.</div>
        ) : (
          <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={styles.sumTh}>Repartidor</th>
                <th style={styles.sumTh}>Estado</th>
                <th style={styles.sumThRight}>Total</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((x) => {
                const total = x.total;
                const estado =
                  total > 0
                    ? `debe depositar ${formatMoneyES(total)} €`
                    : total < 0
                    ? `tiene ${formatMoneyES(Math.abs(total))} € a su favor`
                    : "sin descuadre";

                return (
                  <tr key={`sum-${x.name}`}>
                    <td style={styles.sumTd}>
                      <b>{x.name}</b>
                      {x.comments?.length > 0 && (
                        <div style={styles.sumComments}>
                          {x.comments.map((c, i) => (
                            <div key={`c-${x.name}-${i}`} style={styles.sumCommentItem}>
                              • {c}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={styles.sumTd}>{estado}</td>
                    <td style={styles.sumTdRight}>
                      <b style={total > 0 ? styles.txtPos : total < 0 ? styles.txtNeg : undefined}>
                        {diffLabel(total)}
                      </b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ===== Resumen por ruta ===== */}
        <div style={{ marginTop: 18 }}>
          <h4 style={{ margin: "0 0 8px" }}>
            Resumen por ruta ({String(month).padStart(2, "0")}/{year})
          </h4>

          <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
            “Generó” = Total Metálico del mes · Descuadre = Metálico − Ingreso
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={styles.sumTh}>Ruta</th>
                <th style={styles.sumTh}>Generó (Metálico)</th>
                <th style={styles.sumTh}>Ingresó (Banco)</th>
                <th style={styles.sumThRight}>Descuadre</th>
              </tr>
            </thead>
            <tbody>
              {resumenRutas.map((rt) => {
                const desc = rt.totalDiff;
                return (
                  <Fragment key={`rt-${rt.code}`}>
                    <tr>
                      <td style={styles.sumTd}>
                        <b>Ruta {rt.code}</b>
                      </td>
                      <td style={styles.sumTd}>{formatMoneyES(rt.totalMetalico)} €</td>
                      <td style={styles.sumTd}>{formatMoneyES(rt.totalIngreso)} €</td>
                      <td style={styles.sumTdRight}>
                        <b style={desc > 0 ? styles.txtPos : desc < 0 ? styles.txtNeg : undefined}>
                          {diffLabel(desc)}
                        </b>
                      </td>
                    </tr>

                    {rt.descuadres.length > 0 && (
                      <tr>
                        <td colSpan={4} style={styles.routeDetailCell}>
                          <div style={styles.routeDetailTitle}>
                            Descuadres detectados ({rt.descuadres.length}) — origen:
                          </div>

                          <div style={styles.routeDetailGrid}>
                            {rt.descuadres.map((it, i) => (
                              <div key={`rt-${rt.code}-d-${i}`} style={styles.routeDetailItem}>
                                <div style={styles.routeDetailLine}>
                                  <b>{it.day}</b> ·{" "}
                                  <span style={{ opacity: 0.85 }}>{it.repartidor || "—"}</span>
                                </div>
                                <div style={styles.routeDetailLine}>
                                  <span style={it.diff > 0 ? styles.txtPos : styles.txtNeg}>
                                    {diffLabel(it.diff)}
                                  </span>
                                  {it.comment ? <span style={{ opacity: 0.75 }}> · {it.comment}</span> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
          <b>Nota:</b> Diferencia = Metálico − Ingreso.{" "}
          <span style={styles.txtPos}>Positivo</span> ⇒ depositó de menos (debe).{" "}
          <span style={styles.txtNeg}>Negativo</span> ⇒ depositó de más (a favor).
        </div>
      </div>
    </div>
  );
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

  // hoja
  sheetWrap: {
    background: "white",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.10)",
    overflow: "hidden",
  },
  sheetScroll: {
    overflow: "auto",
    maxWidth: "100%",
    maxHeight: "72vh", // para que se note el sticky al hacer scroll
  },
  sheetTable: {
    width: "max-content",
    minWidth: "100%",
    borderCollapse: "collapse",
  },

  // ===== STICKY HEADERS =====
  thStickyDateTop: {
    position: "sticky",
    top: 0,
    left: 0,
    zIndex: 30,
    background: "#eef2ff",
    borderBottom: "1px solid rgba(0,0,0,.10)",
    padding: 10,
    fontSize: 12,
    fontWeight: 950,
    textAlign: "left",
    minWidth: 160,
    height: HEADER_ROW_1_H,
  },

  thRouteGroupSticky: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    background: "#dbeafe",
    color: "#1e3a8a",
    borderBottom: "1px solid rgba(0,0,0,.10)",
    padding: 10,
    fontSize: 12,
    fontWeight: 950,
    textAlign: "center",
    height: HEADER_ROW_1_H,
  },

  thStickyDateTop2: {
    position: "sticky",
    top: HEADER_ROW_1_H,
    left: 0,
    zIndex: 30,
    background: "#eef2ff",
    borderBottom: "1px solid rgba(0,0,0,.10)",
    padding: 8,
    minWidth: 160,
    height: HEADER_ROW_2_H,
  },

  thSubSticky: {
    position: "sticky",
    top: HEADER_ROW_1_H,
    zIndex: 20,
    background: "#f1f5f9",
    borderBottom: "1px solid rgba(0,0,0,.08)",
    padding: 8,
    fontSize: 11,
    fontWeight: 950,
    textAlign: "left",
    minWidth: 150,
    height: HEADER_ROW_2_H,
  },

  // columna fecha sticky
  tdStickyDate: {
    position: "sticky",
    left: 0,
    zIndex: 10,
    background: "white",
    borderBottom: "1px solid #f2f2f2",
    borderRight: "1px solid #f2f2f2",
    padding: 10,
    minWidth: 160,
    verticalAlign: "top",
  },

  td: {
    borderBottom: "1px solid #f2f2f2",
    borderRight: "1px solid #f2f2f2",
    padding: 6,
    fontSize: 12,
    background: "white",
    verticalAlign: "top",
  },

  cellInput: {
    width: "100%",
    borderRadius: 8,
    border: "1px solid #d9dde6",
    padding: "8px 10px",
    outline: "none",
    fontSize: 12,
    background: "white",
    boxSizing: "border-box",
  },

  diffCell: { fontWeight: 950, whiteSpace: "nowrap", minWidth: 130 },
  diffZero: { opacity: 0.85 },
  diffPositive: { color: "#991b1b" },
  diffNegative: { color: "#065f46" },

  dateNum: { fontWeight: 950 },
  dateWk: { fontSize: 11, opacity: 0.7, marginTop: 2 },

  weekendRow: { background: "#f3f4f6" },
  weekendDateCell: { background: "#f3f4f6" },

  summaryCard: {
    background: "white",
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,.10)",
  },
  sumTh: {
    textAlign: "left",
    fontSize: 12,
    padding: 8,
    borderBottom: "1px solid #eee",
    background: "#fff7ed",
  },
  sumThRight: {
    textAlign: "right",
    fontSize: 12,
    padding: 8,
    borderBottom: "1px solid #eee",
    background: "#fff7ed",
    whiteSpace: "nowrap",
  },
  sumTd: { padding: 8, borderBottom: "1px solid #f2f2f2", verticalAlign: "top" },
  sumTdRight: { padding: 8, borderBottom: "1px solid #f2f2f2", textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" },

  txtPos: { color: "#991b1b" },
  txtNeg: { color: "#065f46" },

  // comentarios en resumen repartidor
  sumComments: {
    marginTop: 6,
    fontSize: 12,
    opacity: 0.9,
    display: "grid",
    gap: 4,
  },
  sumCommentItem: {
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "6px 8px",
  },

  // detalle descuadres por ruta
  routeDetailCell: {
    padding: 10,
    borderBottom: "1px solid #f2f2f2",
    background: "#fafafa",
  },
  routeDetailTitle: {
    fontWeight: 900,
    fontSize: 12,
    marginBottom: 8,
  },
  routeDetailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 8,
  },
  routeDetailItem: {
    border: "1px solid #e5e7eb",
    background: "white",
    borderRadius: 10,
    padding: 10,
  },
  routeDetailLine: {
    fontSize: 12,
    lineHeight: 1.25,
  },
};
