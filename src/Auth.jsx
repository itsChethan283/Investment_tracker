import { useState } from "react";
import { supabase } from "./supabaseClient";

const C = {
  bg: "#121212",
  surface: "#1E1E1E",
  border: "#282828",
  green: "#1DB954",
  text: "#FFFFFF",
  muted: "#B3B3B3",
};

export default function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      }
      // On success, AuthContext will pick up the session automatically
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      }
      // On success, AuthContext will pick up the session automatically
    }

    setLoading(false);
  };

  const inputStyle = {
    width: "100%",
    background: "#252525",
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    color: C.text,
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, Inter, -apple-system, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          padding: "40px 36px",
          width: 380,
          maxWidth: "100%",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Logo / Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: `${C.green}18`,
              border: `2px solid ${C.green}55`,
              display: "inline-flex",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 4,
              padding: "12px 12px 8px",
              marginBottom: 16,
            }}
          >
            {[0.5, 0.75, 1, 0.6].map((h, i) => (
              <div
                key={i}
                style={{
                  width: 5,
                  borderRadius: 3,
                  background: C.green,
                  height: `${h * 22}px`,
                }}
              />
            ))}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
            Portfolio Tracker
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 0" }}>
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </p>
        </div>

        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            background: "#252525",
            borderRadius: 10,
            padding: 4,
            marginBottom: 24,
          }}
        >
          {["login", "signup"].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); setMessage(""); }}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                border: "none",
                background: mode === m ? C.green : "transparent",
                color: mode === m ? "#000" : C.muted,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {m === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              style={{
                fontSize: 11,
                color: C.muted,
                display: "block",
                marginBottom: 6,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: 11,
                color: C.muted,
                display: "block",
                marginBottom: 6,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                background: "#3b1a1a",
                border: "1px solid #e74c3c",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#e74c3c",
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              style={{
                background: "#1a3b2a",
                border: `1px solid ${C.green}`,
                borderRadius: 8,
                padding: "10px 14px",
                color: C.green,
                fontSize: 12,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: C.green,
              color: "#000",
              border: "none",
              borderRadius: 10,
              padding: "13px 0",
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "opacity 0.2s",
              marginTop: 4,
            }}
          >
            {loading
              ? "Please wait…"
              : mode === "login"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>


      </div>
    </div>
  );
}
