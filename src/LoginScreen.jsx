import React, { useState } from "react";
import { Car, Lock } from "lucide-react";

const AUTH_KEY = "fleet_authed_v1";

export function isAuthed() {
  return localStorage.getItem(AUTH_KEY) === "1";
}

export function setAuthed() {
  localStorage.setItem(AUTH_KEY, "1");
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}

export default function LoginScreen({ onSuccess }) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");

  const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || "";

  const submit = (e) => {
    e.preventDefault();
    if (!APP_PASSWORD) {
      setError("Пароль не настроен. Обратитесь к администратору.");
      return;
    }
    if (pwd === APP_PASSWORD) {
      setAuthed();
      onSuccess();
    } else {
      setError("Неверный пароль");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F4F2EB",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#fff",
          border: "1px solid #E7E5DC",
          borderRadius: 16,
          padding: "32px 30px",
          width: "100%",
          maxWidth: 360,
          boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: "#1C1B17", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Car size={22} color="#fff" />
          </div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>City Rent Car</div>
          <div style={{ fontSize: 12.5, color: "#8A8880" }}>Учёт автопарка</div>
        </div>

        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#6B6A63", marginBottom: 6, display: "block" }}>
          Пароль доступа
        </label>
        <div style={{ position: "relative", marginBottom: error ? 8 : 18 }}>
          <Lock size={15} style={{ position: "absolute", left: 11, top: 11, color: "#9A988F" }} />
          <input
            type="password"
            autoFocus
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 32px",
              borderRadius: 9,
              border: "1px solid #DEDCD1",
              fontSize: 14,
              boxSizing: "border-box",
            }}
            placeholder="Введите пароль"
          />
        </div>
        {error && <div style={{ color: "#A32D2D", fontSize: 13, marginBottom: 14 }}>{error}</div>}

        <button
          type="submit"
          style={{
            width: "100%",
            background: "#1C1B17",
            color: "#fff",
            border: "none",
            borderRadius: 9,
            padding: "11px 16px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Войти
        </button>
      </form>
    </div>
  );
}
