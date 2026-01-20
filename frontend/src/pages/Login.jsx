import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/areatrans.png";

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // { type: "ok" | "err", text }

  // 🔒 evita errores de JSON vacío
  async function safeJson(res) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!email.includes("@")) {
      setMsg({ type: "err", text: "Correo inválido" });
      return;
    }

    if (password.length < 6) {
      setMsg({ type: "err", text: "La contraseña debe tener al menos 6 caracteres" });
      return;
    }

    if (mode === "register" && password !== confirm) {
      setMsg({ type: "err", text: "Las contraseñas no coinciden" });
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/login" : "/api/register";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        setMsg({ type: "err", text: data?.error ?? "Error del servidor" });
        return;
      }

      // 🟢 Registro OK → volver a login
      if (mode === "register") {
        setMsg({ type: "ok", text: "Cuenta creada. Inicia sesión." });
        setMode("login");
        setConfirm("");
        return;
      }

      // 🟢 Login OK
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("welcome", data.message);

      navigate("/home");
    } catch {
      setMsg({ type: "err", text: "No se pudo conectar con el servidor" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        <img src={logo} alt="Areatrans" style={styles.logo} />

        <div style={styles.card}>
          <h1 style={styles.title}>
            {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </h1>

          <form onSubmit={onSubmit} style={styles.form}>
            <input
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />

            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />

            {mode === "register" && (
              <input
                type="password"
                placeholder="Confirmar contraseña"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={styles.input}
              />
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
            >
              {loading
                ? "Procesando..."
                : mode === "login"
                ? "Entrar"
                : "Crear cuenta"}
            </button>

            {msg && (
              <div
                style={{
                  ...styles.msg,
                  ...(msg.type === "ok" ? styles.msgOk : styles.msgErr),
                }}
              >
                {msg.text}
              </div>
            )}
          </form>

          <div style={styles.switch}>
            {mode === "login" ? (
              <>
                ¿No tienes cuenta?{" "}
                <span style={styles.link} onClick={() => setMode("register")}>
                  Crear cuenta
                </span>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{" "}
                <span style={styles.link} onClick={() => setMode("login")}>
                  Volver al login
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   STYLES
========================= */
const styles = {
  page: {
    width: "100vw",
    height: "100vh",
    background: "linear-gradient(135deg,#0f2027,#203a43,#2c5364)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  wrapper: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20,
  },
  logo: {
    width: "100%",
    maxWidth: 260,
  },
  card: {
    width: "100%",
    background: "white",
    padding: 28,
    borderRadius: 16,
    boxShadow: "0 15px 40px rgba(0,0,0,.35)",
  },
  title: {
    marginBottom: 20,
    textAlign: "center",
    fontSize: 26,
    fontWeight: 800,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  input: {
    padding: 12,
    borderRadius: 10,
    border: "1px solid #ccc",
    fontSize: 15,
  },
  button: {
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "#203a43",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
  msg: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    fontSize: 14,
    textAlign: "center",
  },
  msgOk: {
    background: "#eafaf1",
    color: "#1e8449",
  },
  msgErr: {
    background: "#fdecea",
    color: "#922b21",
  },
  switch: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 14,
  },
  link: {
    color: "#203a43",
    fontWeight: 700,
    cursor: "pointer",
  },
};
