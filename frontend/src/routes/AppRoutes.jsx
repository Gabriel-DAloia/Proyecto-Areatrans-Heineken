import { Routes, Route, Navigate } from "react-router-dom";
import Login from "../pages/Login";
import Home from "../pages/Home";

export default function AppRoutes() {
  const isAuth = !!localStorage.getItem("token");

  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route
        path="/home"
        element={isAuth ? <Home /> : <Navigate to="/" />}
      />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}