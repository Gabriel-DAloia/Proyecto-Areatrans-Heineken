const RAW = import.meta.env.VITE_API_URL || "";
const API_URL = RAW.replace(/\/$/, ""); // quita "/" final si existe

export function api(path) {
  // path debe empezar por "/api/..."
  return `${API_URL}${path}`;
}