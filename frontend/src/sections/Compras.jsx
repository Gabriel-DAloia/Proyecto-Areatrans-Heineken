import { useEffect, useMemo, useState } from "react";

export default function Compras({ hub, notify }) {
  const token = useMemo(() => localStorage.getItem("token"), []);
  const [items, setItems] = useState([]);

  const [item, setItem] = useState("");
  const [descripcion, setDescripcion] = useState(""); // ahora se muestra como "Especificaciones"
  const [donde, setDonde] = useState("");
  const [precio, setPrecio] = useState("");
  const [cantidad, setCantidad] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");

  // edición inline
  const [editId, setEditId] = useState(null);
  const [editItem, setEditItem] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editDonde, setEditDonde] = useState("");
  const [editPrecio, setEditPrecio] = useState("");
  const [editCantidad, setEditCantidad] = useState("");
  const [editComprado, setEditComprado] = useState(false);

  function toFloatOrNull(v) {
    const s = String(v ?? "").trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function toIntOrNull(v) {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }

  // regla: si precio vacío => 1
  function parsePrecioOrDefault(v) {
    const n = toFloatOrNull(v);
    if (n === null) return 1;
    return n;
  }

  // cantidad default = 1 si vacío
  function parseCantidadOrDefault(v) {
    const n = toIntOrNull(v);
    if (n === null) return 1;
    return n;
  }

  function format2(n) {
    const num = Number(n || 0);
    return num.toFixed(2);
  }

  function calcTotal(precioValue, cantidadValue) {
    const p = Number(precioValue || 0);
    const c = Number(cantidadValue || 0);
    return p * c;
  }

  function clearForm() {
    setItem("");
    setDescripcion("");
    setDonde("");
    setPrecio("");
    setCantidad("");
  }

  function startEdit(it) {
    setError("");
    setEditId(it.id);
    setEditItem(String(it.item || ""));
    setEditDescripcion(String(it.especificaciones || it.descripcion || ""));
    setEditDonde(String(it.donde || ""));
    setEditPrecio(String(it.precio ?? ""));
    setEditCantidad(String(it.cantidad ?? 1));
    setEditComprado(Boolean(it.comprado));
  }

  function cancelEdit() {
    setEditId(null);
    setEditItem("");
    setEditDescripcion("");
    setEditDonde("");
    setEditPrecio("");
    setEditCantidad("");
    setEditComprado(false);
  }

  async function loadCompras() {
    setLoading(true);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/compras`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando compras");

      const list = Array.isArray(json.items) ? json.items : [];
      // normalizar defaults por si el backend no manda cantidad/precio
      const normalized = list.map((x) => ({
        ...x,
        cantidad: x.cantidad ?? 1,
        precio: x.precio ?? 1,
      }));
      setItems(normalized);
    } catch (e) {
      setItems([]);
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function addCompra() {
    const name = String(item).trim();
    if (!name) {
      setError("El campo 'Qué comprar' es obligatorio.");
      return;
    }

    const p = parsePrecioOrDefault(precio);
    const c = parseCantidadOrDefault(cantidad);

    if (p < 0) {
      setError("Precio inválido.");
      return;
    }
    if (c <= 0) {
      setError("Cantidad inválida.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        item: name,
        descripcion: String(descripcion || "").trim(), // se muestra como "Especificaciones"
        donde: String(donde || "").trim(),
        precio: p,
        cantidad: c,
      };

      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/compras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude agregar");

      const it = json.item || json;
      const normalized = { ...it, cantidad: it.cantidad ?? c, precio: it.precio ?? p };

      setItems((prev) => [normalized, ...prev]);
      clearForm();

      notify?.({
        type: "Compras",
        title: "Agregado",
        message: `${hub} · ${normalized.item}`,
      });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(it) {
    const name = String(editItem).trim();
    if (!name) {
      setError("El campo 'Qué comprar' es obligatorio.");
      return;
    }

    const p = parsePrecioOrDefault(editPrecio);
    const c = parseCantidadOrDefault(editCantidad);

    if (p < 0) {
      setError("Precio inválido.");
      return;
    }
    if (c <= 0) {
      setError("Cantidad inválida.");
      return;
    }

    setUpdatingId(it.id);
    setError("");
    try {
      const payload = {
        item: name,
        descripcion: String(editDescripcion || "").trim(),
        donde: String(editDonde || "").trim(),
        precio: p,
        cantidad: c,
        comprado: Boolean(editComprado),
      };

      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/compras/${it.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude actualizar");

      const updated = json.item || json;
      const normalized = { ...updated, cantidad: updated.cantidad ?? c, precio: updated.precio ?? p };

      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, ...normalized } : x)));
      cancelEdit();

      notify?.({
        type: "Compras",
        title: "Actualizado",
        message: `${hub} · ${normalized.item || it.item}`,
      });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleComprado(it) {
    setUpdatingId(it.id);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/compras/${it.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ comprado: !it.comprado }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude actualizar");

      const updated = json.item || json;
      setItems((prev) =>
        prev.map((x) =>
          x.id === it.id
            ? {
                ...x,
                ...updated,
                cantidad: updated.cantidad ?? x.cantidad ?? 1,
                precio: updated.precio ?? x.precio ?? 1,
              }
            : x
        )
      );
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteCompra(it) {
    const ok = window.confirm(`¿Eliminar "${it.item}"?`);
    if (!ok) return;

    setDeletingId(it.id);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/compras/${it.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude eliminar");

      setItems((prev) => prev.filter((x) => x.id !== it.id));
      notify?.({ type: "Compras", title: "Eliminado", message: `${hub} · ${it.item}` });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    setItems([]);
    setError("");
    cancelEdit();
    clearForm();
    loadCompras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);

  const resumen = useMemo(() => {
    const normalized = items.map((x) => ({
      ...x,
      precio: x.precio ?? 1,
      cantidad: x.cantidad ?? 1,
    }));

    const total = normalized.reduce((acc, x) => acc + calcTotal(Number(x.precio) || 0, Number(x.cantidad) || 0), 0);
    const totalItems = normalized.length;
    const totalUnidades = normalized.reduce((acc, x) => acc + (Number(x.cantidad) || 0), 0);

    return { total, totalItems, totalUnidades };
  }, [items]);

  const newPrecioPreview = useMemo(() => parsePrecioOrDefault(precio), [precio]);
  const newCantidadPreview = useMemo(() => parseCantidadOrDefault(cantidad), [cantidad]);
  const newTotalPreview = useMemo(() => calcTotal(newPrecioPreview, newCantidadPreview), [newPrecioPreview, newCantidadPreview]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.kicker}>COMPRAS</div>
          <h3 style={styles.h3}>Listado de compras por HUB</h3>
          <div style={styles.sub}>
            HUB seleccionado: <b>{hub}</b>
          </div>
        </div>

        <div style={styles.filters}>
          <button style={styles.btn} onClick={loadCompras} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>
      </div>

      <div style={styles.summaryCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h4 style={{ margin: 0 }}>Resumen</h4>
          <div style={{ fontSize: 13, opacity: 0.8, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>
              Items: <b>{resumen.totalItems}</b>
            </span>
            <span>
              Unidades: <b>{resumen.totalUnidades}</b>
            </span>
            <span>
              Total estimado: <b>{format2(resumen.total)}</b>
            </span>
          </div>
        </div>
      </div>

      <div style={styles.formCard}>
        <div style={styles.formGrid}>
          <div>
            <div style={styles.label}>Qué comprar</div>
            <input value={item} onChange={(e) => setItem(e.target.value)} style={styles.input} placeholder="Ej: cinta embalar" />
          </div>

          <div>
            <div style={styles.label}>Especificaciones</div>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={styles.input} placeholder="Ej: 48mm x 66m" />
          </div>

          <div>
            <div style={styles.label}>Dónde comprar</div>
            <input value={donde} onChange={(e) => setDonde(e.target.value)} style={styles.input} placeholder="Ej: Amazon / proveedor" />
          </div>

          <div>
            <div style={styles.label}>Precio (vacío = 1)</div>
            <input value={precio} onChange={(e) => setPrecio(e.target.value)} style={styles.input} inputMode="decimal" placeholder="1,00" />
          </div>

          <div>
            <div style={styles.label}>Cantidad</div>
            <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={styles.input} inputMode="numeric" placeholder="1" />
          </div>

          <div>
            <div style={styles.label}>Total</div>
            <div style={styles.totalBox}>{format2(newTotalPreview)}</div>
          </div>

          <div style={{ display: "flex", alignItems: "end", gridColumn: "1 / -1" }}>
            <button style={styles.btnOrange} onClick={addCompra} disabled={saving}>
              {saving ? "Agregando..." : "Agregar"}
            </button>
          </div>
        </div>

        {error && <div style={styles.err}>{error}</div>}
      </div>

      <div style={styles.tableWrap}>
        <div style={styles.tableTitle}>
          <b>Lista</b> <span style={{ opacity: 0.7 }}>· {items.length} items</span>
        </div>

        {items.length === 0 ? (
          <div style={styles.empty}>{loading ? "Cargando..." : "No hay compras aún."}</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>OK</th>
                <th style={styles.th}>Qué comprar</th>
                <th style={styles.th}>Especificaciones</th>
                <th style={styles.th}>Dónde</th>
                <th style={styles.th}>Precio</th>
                <th style={styles.th}>Cant.</th>
                <th style={styles.th}>Total</th>
                <th style={{ ...styles.th, width: 260 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const isEditing = editId === it.id;

                const pView = it.precio ?? 1;
                const cView = it.cantidad ?? 1;
                const totalRow = calcTotal(Number(pView) || 0, Number(cView) || 0);

                const editPPreview = parsePrecioOrDefault(editPrecio);
                const editCPreview = parseCantidadOrDefault(editCantidad);
                const editTotalPreview = calcTotal(editPPreview, editCPreview);

                return (
                  <tr key={it.id} style={it.comprado ? { opacity: 0.65 } : undefined}>
                    <td style={styles.td}>
                      <input
                        type="checkbox"
                        checked={!!it.comprado}
                        disabled={updatingId === it.id || deletingId === it.id || isEditing}
                        onChange={() => toggleComprado(it)}
                      />
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editItem} onChange={(e) => setEditItem(e.target.value)} style={styles.inlineInput} />
                      ) : (
                        <b>{it.item}</b>
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} style={styles.inlineInput} />
                      ) : (
                        it.especificaciones || it.descripcion || "—"
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editDonde} onChange={(e) => setEditDonde(e.target.value)} style={styles.inlineInput} />
                      ) : (
                        it.donde || "—"
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editPrecio} onChange={(e) => setEditPrecio(e.target.value)} style={styles.inlineInputSmall} inputMode="decimal" />
                      ) : (
                        format2(pView)
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editCantidad} onChange={(e) => setEditCantidad(e.target.value)} style={styles.inlineInputSmall} inputMode="numeric" />
                      ) : (
                        cView
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? <b>{format2(editTotalPreview)}</b> : <b>{format2(totalRow)}</b>}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button style={styles.btnBlue} onClick={() => saveEdit(it)} disabled={updatingId === it.id || deletingId === it.id}>
                            {updatingId === it.id ? "Guardando..." : "Guardar"}
                          </button>
                          <button style={styles.btnGray} onClick={cancelEdit} disabled={updatingId === it.id}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button style={styles.btnBlue} onClick={() => startEdit(it)} disabled={deletingId === it.id || updatingId === it.id}>
                            Editar
                          </button>
                          <button style={styles.btnDanger} onClick={() => deleteCompra(it)} disabled={deletingId === it.id || updatingId === it.id}>
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

  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#203a43",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  summaryCard: {
    background: "white",
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,.10)",
  },

  formCard: {
    background: "white",
    borderRadius: 14,
    padding: 14,
    border: "1px solid rgba(0,0,0,.10)",
  },
  formGrid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "1.2fr 1.2fr 1.2fr 180px 140px 160px",
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

  totalBox: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.10)",
    background: "#f8fafc",
    boxSizing: "border-box",
    fontWeight: 950,
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
    maxWidth: 120,
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
