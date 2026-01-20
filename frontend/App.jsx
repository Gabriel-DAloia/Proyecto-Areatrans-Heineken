import { useEffect, useState } from "react";

export default function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/health")
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
