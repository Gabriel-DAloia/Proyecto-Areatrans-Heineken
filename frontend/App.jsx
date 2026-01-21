import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export default function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>React + Flask</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
