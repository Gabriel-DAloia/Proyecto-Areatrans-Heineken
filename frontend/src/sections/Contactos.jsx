import { useEffect, useMemo, useState } from "react";

export default function Contactos({ hub, notify }) {
  const token = useMemo(() => localStorage.getItem("token"), []);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // editar
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState("");
  const [editCargo, setEditCargo] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  function clearForm() {
    setNombre("");
    setCargo("");
    setTelefono("");
  }

  function startEdit(x) {
    setError("");
    setEditId(x.id);
    setEditNombre(String(x.nombre || ""));
    setEditCargo(String(x.cargo || ""));
    setEditTelefono(String(x.telefono || ""));
  }

  function cancelEdit() {
    setEditId(null);
    setEditNombre("");
    setEditCargo("");
    setEditTelefono("");
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/contactos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "Error cargando contactos");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setItems([]);
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function add() {
    const n = String(nombre || "").trim();
    const t = String(telefono || "").trim();
    if (!n) return setError("Nombre obligatorio");
    if (!t) return setError("Teléfono obligatorio");

    setSaving(true);
    setError("");
    try {
      const payload = { nombre: n, cargo: String(cargo || "").trim(), telefono: t };
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/contactos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude agregar");
      const it = json.item || json;
      setItems((prev) => [it, ...prev]);
      clearForm();
      notify?.({ type: "Contactos", title: "Contacto agregado", message: `${hub}: ${it.nombre} · ${it.telefono}` });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(x) {
    const n = String(editNombre || "").trim();
    const t = String(editTelefono || "").trim();
    if (!n) return setError("Nombre obligatorio");
    if (!t) return setError("Teléfono obligatorio");

    setUpdatingId(x.id);
    setError("");
    try {
      const payload = { nombre: n, cargo: String(editCargo || "").trim(), telefono: t };
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/contactos/${x.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude actualizar");
      const updated = json.item || json;

      setItems((prev) => prev.map((z) => (z.id === x.id ? { ...z, ...updated } : z)));
      cancelEdit();
      notify?.({ type: "Contactos", title: "Contacto actualizado", message: `${hub}: ${updated.nombre} · ${updated.telefono}` });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setUpdatingId(null);
    }
  }

  async function del(x) {
    const ok = window.confirm(`¿Eliminar contacto "${x.nombre}"?`);
    if (!ok) return;

    setDeletingId(x.id);
    setError("");
    try {
      const base = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${base}/api/hubs/${encodeURIComponent(hub)}/contactos/${x.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.error || "No pude eliminar");

      setItems((prev) => prev.filter((z) => z.id !== x.id));
      notify?.({ type: "Contactos", title: "Contacto eliminado", message: `${hub}: ${x.nombre}` });
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    setItems([]);
    clearForm();
    cancelEdit();
    setError("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.kicker}>CONTACTOS</div>
          <h3 style={styles.h3}>Lista de contactos por plaza</h3>
          <div style={styles.sub}>
            Plaza (HUB): <b>{hub}</b>
          </div>
        </div>

        <button style={styles.btn} onClick={load} disabled={loading}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      <div style={styles.card}>
        <div style={styles.grid}>
          <div>
            <div style={styles.label}>Nombre</div>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={styles.input} placeholder="Ej: Juan Pérez" />
          </div>
          <div>
            <div style={styles.label}>Cargo</div>
            <input value={cargo} onChange={(e) => setCargo(e.target.value)} style={styles.input} placeholder="Ej: Coordinador" />
          </div>
          <div>
            <div style={styles.label}>Teléfono</div>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} style={styles.input} placeholder="Ej: +34 600 000 000" />
          </div>

          <div style={{ display: "flex", alignItems: "end" }}>
            <button style={styles.btnOrange} onClick={add} disabled={saving}>
              {saving ? "Agregando..." : "Agregar"}
            </button>
          </div>
        </div>

        {error && <div style={styles.err}>{error}</div>}
      </div>

      <div style={styles.tableWrap}>
        <div style={styles.tableTitle}>
          <b>Listado</b> <span style={{ opacity: 0.7 }}>· {items.length} contactos</span>
        </div>

        {items.length === 0 ? (
          <div style={styles.empty}>{loading ? "Cargando..." : "No hay contactos en esta plaza."}</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Cargo</th>
                <th style={styles.th}>Teléfono</th>
                <th style={{ ...styles.th, width: 260 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => {
                const isEditing = editId === x.id;
                return (
                  <tr key={x.id}>
                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} style={styles.inlineInput} />
                      ) : (
                        <b>{x.nombre}</b>
                      )}
                    </td>
                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editCargo} onChange={(e) => setEditCargo(e.target.value)} style={styles.inlineInput} />
                      ) : (
                        x.cargo || "—"
                      )}
                    </td>
                    <td style={styles.td}>
                      {isEditing ? (
                        <input value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} style={styles.inlineInput} />
                      ) : (
                        x.telefono || "—"
                      )}
                    </td>

                    <td style={styles.td}>
                      {isEditing ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button style={styles.btnBlue} onClick={() => saveEdit(x)} disabled={updatingId === x.id}>
                            {updatingId === x.id ? "Guardando..." : "Guardar"}
                          </button>
                          <button style={styles.btnGray} onClick={cancelEdit} disabled={updatingId === x.id}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button style={styles.btnBlue} onClick={() => startEdit(x)} disabled={deletingId === x.id}>
                            Editar
                          </button>
                          <button style={styles.btnDanger} onClick={() => del(x)} disabled={deletingId === x.id}>
                            {deletingId === x.id ? "Borrando..." : "Eliminar"}
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

  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#203a43",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  card: { background: "white", borderRadius: 14, padding: 14, border: "1px solid rgba(0,0,0,.10)" },
  grid: { display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr 160px" },
  label: { fontSize: 12, fontWeight: 900, opacity: 0.8, marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d9dde6", background: "white", boxSizing: "border-box" },

  inlineInput: { width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #d9dde6", background: "white", boxSizing: "border-box" },

  btnOrange: { padding: "10px 12px", borderRadius: 10, border: "none", background: "#f97316", color: "white", fontWeight: 950, cursor: "pointer", width: "100%" },
  btnBlue: { padding: "8px 10px", borderRadius: 10, border: "none", background: "#2563eb", color: "white", fontWeight: 900, cursor: "pointer", width: "100%" },
  btnGray: { padding: "8px 10px", borderRadius: 10, border: "none", background: "#e5e7eb", color: "#111827", fontWeight: 900, cursor: "pointer", width: "100%" },
  btnDanger: { padding: "8px 10px", borderRadius: 10, border: "none", background: "#dc2626", color: "white", fontWeight: 900, cursor: "pointer", width: "100%" },

  err: { marginTop: 10, padding: 10, borderRadius: 10, background: "#fdecea", color: "#922b21", border: "1px solid #f5c6cb" },

  tableWrap: { overflow: "hidden", borderRadius: 12, border: "1px solid rgba(0,0,0,.10)", background: "white" },
  tableTitle: { padding: 12, borderBottom: "1px solid #eee" },
  empty: { padding: 12, opacity: 0.75 },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { background: "#f1f5f9", borderBottom: "1px solid #eee", padding: 10, fontSize: 12, textAlign: "left", fontWeight: 950 },
  td: { borderBottom: "1px solid #f2f2f2", padding: 10, fontSize: 13 },
};
