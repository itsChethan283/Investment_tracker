import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#121212",
  surface: "#1E1E1E",
  border: "#282828",
  green: "#1DB954",
  purple: "#9B59B6",
  blue: "#3498DB",
  text: "#FFFFFF",
  muted: "#B3B3B3",
};

const TYPES = ["Chit", "Stocks", "MF"];
const TYPE_COLOR = { Chit: C.green, Stocks: C.purple, MF: C.blue };

// Period options: label shown on button, number of months the window spans
const PERIODS = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "2Y", months: 24 },
];

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatINR(val) {
  const v = Math.round(val || 0);
  return `₹${v.toLocaleString("en-IN")}`;
}

/**
 * Returns an array of Date objects (first-of-month) covering start..end inclusive.
 * Because `end` is always derived from `new Date()` in the parent, the window
 * automatically advances each calendar day without any manual refresh.
 */
function monthsInRange(start, end) {
  const result = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMon = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMon) {
    result.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

/**
 * Returns today's date as a local "YYYY-MM-DD" string.
 * Using toISOString() would give UTC date which can be a day off for IST/other positive-offset zones.
 */
function localDateStr(d = new Date()) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * For each month bucket, sum all investments of `type` whose date falls
 * on or before the last day of that month (i.e. cumulative running total).
 * Dates are stored as "YYYY-MM-DD" strings which are lexicographically sortable,
 * so string comparison is both correct and timezone-safe.
 */
function cumulativeByMonth(investments, type, months) {
  return months.map((month) => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const monthEndStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return investments
      .filter((inv) => inv.type === type && inv.date <= monthEndStr)
      .reduce((s, inv) => s + inv.amount, 0);
  });
}

// ── Sparkline (pure SVG) ──────────────────────────────────────────────────────
function Sparkline({ data, color, width = 90, height = 28 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Custom Recharts tooltip ───────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, color }) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  const total = point?.value ?? 0;
  const entries = point?.payload?.entries ?? [];
  return (
    <div
      style={{
        background: "#1E1E1E",
        border: `1px solid ${color}66`,
        borderRadius: 10,
        padding: "10px 14px",
        fontFamily: "inherit",
        boxShadow: `0 4px 20px ${color}33`,
        minWidth: 160,
      }}
    >
      {/* Month label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
        <span style={{ color: "#B3B3B3", fontSize: 11 }}>{label}</span>
      </div>
      {/* Cumulative total */}
      <div style={{ marginBottom: entries.length ? 8 : 0 }}>
        <div style={{ fontSize: 10, color: "#666", letterSpacing: 0.5, marginBottom: 2 }}>CUMULATIVE TOTAL</div>
        <div style={{ color, fontWeight: 700, fontSize: 18, letterSpacing: -0.5 }}>
          {formatINR(total)}
        </div>
      </div>
      {/* Individual entries this month */}
      {entries.length > 0 && (
        <div style={{ borderTop: "1px solid #282828", paddingTop: 7 }}>
          <div style={{ fontSize: 10, color: "#666", letterSpacing: 0.5, marginBottom: 5 }}>ADDED THIS MONTH</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#B3B3B3" }}>{e.date}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color }}>{formatINR(e.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TypeCard: group breakdown tile with sparkline ─────────────────────────────
function TypeCard({ type, investments, dateRange }) {
  const color = TYPE_COLOR[type];

  const total = useMemo(
    () =>
      investments
        .filter((inv) => inv.type === type)
        .reduce((s, inv) => s + inv.amount, 0),
    [investments, type]
  );

  const sparkVals = useMemo(() => {
    const months = monthsInRange(dateRange.start, dateRange.end);
    return cumulativeByMonth(investments, type, months);
  }, [investments, type, dateRange]);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 180,
        background: `${color}12`,
        border: `1px solid ${color}40`,
        borderRadius: 14,
        padding: "18px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            display: "inline-block",
          }}
        />
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: 0.5 }}>
          {type}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, marginBottom: 10 }}>
        {formatINR(total)}
      </div>
      <Sparkline data={sparkVals} color={color} width={130} height={32} />
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function InvestmentDashboard() {
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [chartType, setChartType] = useState("Chit");
  const [periodMonths, setPeriodMonths] = useState(12);
  const [chartMinimized, setChartMinimized] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Capture the beforeinstallprompt event (Android/Windows Chrome)
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setShowInstallBanner(false);
    setInstallPrompt(null);
  };

  const [form, setForm] = useState({
    amount: "",
    type: "Chit",
    date: localDateStr(),
  });
  const [formError, setFormError] = useState("");

  // ── Load investments from Supabase on mount ─────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("history")
        .select("*")
        .order("date", { ascending: true });

      if (error) {
        setApiError("Could not connect to Supabase: " + error.message);
        setLoading(false);
        return;
      }

      setInvestments(data.map((r) => ({ ...r, id: r.id })));

      setApiError("");
      setLoading(false);
    };
    load();
  }, []);

  // ── Sliding date window ───────────────────────────────────────────────────
  // `end` is always today — the window shifts forward automatically each day.
  // For 1Y (12 months) and today = 5 May 2026:
  //   start = 1 Jun 2025, end = 5 May 2026  → 12 monthly data points
  // Tomorrow (6 May 2026): same formula → still Jun 2025…May 2026 until month rolls over.
  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - periodMonths + 1, 1);
    return { start, end };
  }, [periodMonths]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const months = monthsInRange(dateRange.start, dateRange.end);
    const vals = cumulativeByMonth(investments, chartType, months);
    return months.map((m, i) => {
      const y = m.getFullYear();
      const mo = m.getMonth();
      const startStr = `${y}-${String(mo + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, mo + 1, 0).getDate();
      const endStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const entries = investments.filter(
        (inv) => inv.type === chartType && inv.date >= startStr && inv.date <= endStr
      );
      return {
        label: m.toLocaleString("default", { month: "short", year: "numeric" }),
        value: vals[i],
        entries,
      };
    });
  }, [investments, chartType, dateRange]);

  const yDomain = useMemo(() => {
    const max = Math.max(...chartData.map((d) => d.value), 0);
    return [0, Math.ceil(max * 1.15) || 10000];
  }, [chartData]);

  // Show at most ~6 X-axis labels regardless of period length
  const xInterval = useMemo(() => {
    const n = chartData.length;
    if (n <= 6) return 0;
    if (n <= 12) return 1;
    return Math.ceil(n / 6) - 1;
  }, [chartData.length]);

  // Sparkline values for the minimized strip (all 3 types)
  const sparklineData = useMemo(() => {
    const months = monthsInRange(dateRange.start, dateRange.end);
    const result = {};
    TYPES.forEach((t) => {
      result[t] = cumulativeByMonth(investments, t, months);
    });
    return result;
  }, [investments, dateRange]);

  // Lifetime totals (used in minimized sparkline labels)
  const totals = useMemo(() => {
    const t = { Chit: 0, Stocks: 0, MF: 0 };
    investments.forEach(({ type, amount }) => { t[type] += amount; });
    return t;
  }, [investments]);

  // ── Add investment ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    setInvestments((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase.from("history").delete().eq("id", id);
    if (error) {
      setApiError("Delete failed: " + error.message);
      // revert
      const { data } = await supabase.from("history").select("*").order("date", { ascending: true });
      if (data) setInvestments(data);
    }
  }, []);

  const handleAdd = useCallback(async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { setFormError("Enter a valid positive amount."); return; }
    if (!form.date) { setFormError("Select a date."); return; }
    setFormError("");
    const { data, error } = await supabase
      .from("history")
      .insert({ date: form.date, type: form.type, amount: amt })
      .select()
      .single();
    if (error) {
      setFormError("Failed to save: " + error.message);
      return;
    }
    setInvestments((prev) => [...prev, { ...data, id: data.id }]);
    setForm((f) => ({ ...f, amount: "" }));
    setShowModal(false);
  }, [form]);

  const activeColor = TYPE_COLOR[chartType];

  const inputStyle = {
    width: "100%",
    background: "#252525",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    padding: "9px 12px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "system-ui, Inter, -apple-system, sans-serif",
        padding: 24,
        color: C.text,
        boxSizing: "border-box",
      }}
    >
      {/* Install banner (Android / Windows Chrome) */}
      {showInstallBanner && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1E1E1E",
            border: `1px solid ${C.green}55`,
            borderRadius: 14,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            zIndex: 200,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            maxWidth: "90vw",
          }}
        >
          <img src="/icon-192.png" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Install Portfolio Tracker</div>
            <div style={{ fontSize: 11, color: C.muted }}>Add to home screen for quick access</div>
          </div>
          <button
            onClick={handleInstall}
            style={{
              background: C.green,
              color: "#000",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Install
          </button>
          <button
            onClick={() => setShowInstallBanner(false)}
            style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Loading / API error banner */}
      {loading && (
        <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }}>
          Connecting to database…
        </div>
      )}
      {!loading && apiError && (
        <div
          style={{
            background: "#3b1a1a",
            border: "1px solid #e74c3c",
            borderRadius: 10,
            padding: "12px 18px",
            color: "#e74c3c",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {apiError}
        </div>
      )}
      {!loading && (
      <>
      {/* Modal overlay */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 18,
              padding: 28,
              width: 340,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
              animation: "modalIn 0.22s ease",
            }}
          >
            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Add Investment</span>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.muted,
                  fontSize: 20,
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>

            {/* Amount */}
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5, letterSpacing: 0.5 }}>AMOUNT (₹)</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 5000"
                value={form.amount}
                autoFocus
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                style={inputStyle}
              />
            </div>

            {/* Type */}
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5, letterSpacing: 0.5 }}>TYPE</label>
              <div style={{ position: "relative" }}>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  style={{ ...inputStyle, cursor: "pointer", WebkitAppearance: "none", appearance: "none", paddingRight: 28 }}
                >
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none", fontSize: 10 }}>▼</span>
              </div>
            </div>

            {/* Date */}
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5, letterSpacing: 0.5 }}>DATE</label>
              <input
                type="date"
                value={form.date}
                max={localDateStr()}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>

            {formError && <p style={{ fontSize: 11, color: "#e74c3c", margin: 0 }}>{formError}</p>}

            <button
              onClick={handleAdd}
              style={{
                background: C.green,
                color: "#000",
                border: "none",
                borderRadius: 10,
                padding: "12px 0",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                width: "100%",
                transition: "opacity 0.18s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.82")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              + Add Investment
            </button>

            {/* Recent entries inside modal */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 0.5 }}>RECENT ENTRIES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                {[...investments].reverse().slice(0, 10).map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#252525",
                      borderRadius: 8,
                      padding: "6px 10px",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 10, color: C.muted }}>{inv.date}</span>
                      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: TYPE_COLOR[inv.type] }}>{inv.type}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{formatINR(inv.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe for modal entrance */}
      <style>{`@keyframes modalIn { from { opacity: 0; transform: scale(0.94) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>

      {/* History modal */}
      {showHistory && (
        <div
          onClick={() => setShowHistory(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 18,
              padding: 28,
              width: 560,
              maxWidth: "95vw",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
              animation: "modalIn 0.22s ease",
            }}
          >
            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Investment History</span>
              <button
                onClick={() => setShowHistory(false)}
                style={{ background: "transparent", border: "none", color: C.muted, fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
              >
                ×
              </button>
            </div>

            {/* Table */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Date", "Type", "Amount", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: h === "Amount" ? "right" : "left",
                          padding: "8px 12px",
                          fontSize: 11,
                          color: C.muted,
                          letterSpacing: 0.8,
                          textTransform: "uppercase",
                          borderBottom: `1px solid ${C.border}`,
                          position: "sticky",
                          top: 0,
                          background: C.surface,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...investments]
                    .sort((a, b) => (a.date < b.date ? 1 : -1))
                    .map((inv, idx) => (
                      <tr
                        key={inv.id}
                        style={{ background: idx % 2 === 0 ? "transparent" : "#252525" }}
                      >
                        <td style={{ padding: "10px 12px", color: C.muted, fontFamily: "monospace", fontSize: 12 }}>
                          {inv.date}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              background: `${TYPE_COLOR[inv.type]}18`,
                              color: TYPE_COLOR[inv.type],
                              border: `1px solid ${TYPE_COLOR[inv.type]}44`,
                              borderRadius: 20,
                              padding: "2px 10px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {inv.type}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: C.text }}>
                          {formatINR(inv.amount)}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center", width: 36 }}>
                          <button
                            onClick={() => handleDelete(inv.id)}
                            title="Delete entry"
                            style={{ background: "transparent", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 2, opacity: 0.7 }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.7)}
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {investments.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 13 }}>
                  No investments recorded yet.
                </div>
              )}
            </div>

            {/* Footer summary */}
            <div
              style={{
                borderTop: `1px solid ${C.border}`,
                paddingTop: 14,
                marginTop: 14,
                display: "flex",
                gap: 20,
                justifyContent: "flex-end",
              }}
            >
              {TYPES.map((t) => {
                const total = investments.filter((i) => i.type === t).reduce((s, i) => s + i.amount, 0);
                return (
                  <div key={t} style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.5 }}>{t}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TYPE_COLOR[t] }}>{formatINR(total)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: C.green, margin: 0 }}>
            Portfolio Tracker
          </h1>
          <p style={{ fontSize: 12, color: C.muted, margin: "3px 0 0" }}>
            Track investments across Chit, Stocks &amp; MF
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setShowHistory(true)}
            style={{
              background: "transparent",
              color: C.muted,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "10px 20px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              transition: "all 0.18s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            History
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: C.green,
              color: "#000",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              transition: "opacity 0.18s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.82")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Investment
          </button>
        </div>
      </div>

      {/* Group breakdown — now full width */}
      <div
        style={{ marginBottom: 16 }}
      >
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: C.muted,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            Group Breakdown
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {TYPES.map((type) => (
              <TypeCard
                key={type}
                type={type}
                investments={investments}
                dateRange={dateRange}
              />
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#555", margin: "16px 0 0" }}>
            Sparklines reflect selected window (
            {PERIODS.find((p) => p.months === periodMonths)?.label ?? periodMonths + "M"}
            ). Totals are lifetime cumulative.
          </p>
        </div>
      </div>

      {/* Chart card */}
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* Chart header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: `1px solid ${C.border}`,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {/* Type picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Performance</span>
            <div style={{ position: "relative" }}>
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
                style={{
                  background: "#252525",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: activeColor,
                  padding: "5px 26px 5px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  outline: "none",
                  cursor: "pointer",
                  WebkitAppearance: "none",
                  appearance: "none",
                }}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: C.muted,
                  pointerEvents: "none",
                  fontSize: 9,
                }}
              >
                ▼
              </span>
            </div>
          </div>

          {/* Period selector + minimize */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {PERIODS.map((p) => {
              const active = periodMonths === p.months;
              return (
                <button
                  key={p.label}
                  onClick={() => setPeriodMonths(p.months)}
                  style={{
                    background: active ? C.green : "transparent",
                    color: active ? "#000" : C.muted,
                    border: `1px solid ${active ? C.green : C.border}`,
                    borderRadius: 8,
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.18s",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              onClick={() => setChartMinimized((v) => !v)}
              style={{
                background: "transparent",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.muted,
                cursor: "pointer",
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                marginLeft: 4,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {chartMinimized ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                  Expand
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="10" y1="14" x2="3" y2="21" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                  </svg>
                  Minimize
                </>
              )}
            </button>
          </div>
        </div>

        {/* Minimized: sparkline strip */}
        <div
          style={{
            maxHeight: chartMinimized ? 90 : 0,
            opacity: chartMinimized ? 1 : 0,
            overflow: "hidden",
            transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease",
          }}
        >
          <div style={{ display: "flex", gap: 28, padding: "14px 20px", alignItems: "center" }}>
            {TYPES.map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.muted }}>{t}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TYPE_COLOR[t] }}>
                    {formatINR(totals[t])}
                  </div>
                </div>
                <Sparkline data={sparklineData[t]} color={TYPE_COLOR[t]} width={90} height={28} />
              </div>
            ))}
          </div>
        </div>

        {/* Maximized: full chart */}
        <div
          style={{
            maxHeight: chartMinimized ? 0 : 440,
            opacity: chartMinimized ? 0 : 1,
            overflow: "hidden",
            transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
          }}
        >
          {chartData.every((d) => d.value === 0) ? (
            <div
              style={{
                height: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No {chartType} investments found in this period.
            </div>
          ) : (
            <div style={{ padding: "16px 8px 16px 0", height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis
                    dataKey="label"
                    interval={xInterval}
                    tick={{ fill: C.muted, fontSize: 11 }}
                    axisLine={{ stroke: C.border }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={yDomain}
                    tickFormatter={formatINR}
                    tick={{ fill: C.muted, fontSize: 11 }}
                    axisLine={{ stroke: C.border }}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip content={<CustomTooltip color={activeColor} />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={chartType}
                    stroke={activeColor}
                    strokeWidth={2.5}
                    dot={(props) => {
                      const { cx, cy, fill } = props;
                      return (
                        <circle
                          key={`dot-${cx}-${cy}`}
                          cx={cx}
                          cy={cy}
                          r={5}
                          fill={fill}
                          stroke={C.surface}
                          strokeWidth={2}
                          style={{ cursor: "pointer" }}
                        />
                      );
                    }}
                    activeDot={(props) => {
                      const { cx, cy, fill } = props;
                      return (
                        <g key={`adot-${cx}-${cy}`}>
                          {/* outer glow ring */}
                          <circle cx={cx} cy={cy} r={12} fill={fill} opacity={0.18} />
                          {/* mid ring */}
                          <circle cx={cx} cy={cy} r={8} fill={fill} opacity={0.35} />
                          {/* solid centre */}
                          <circle cx={cx} cy={cy} r={5} fill={fill} stroke={C.surface} strokeWidth={2} />
                        </g>
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "#444" }}>
        Portfolio Tracker • All values in INR •{" "}
        {new Date().toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </div>
      </>
      )}
    </div>
  );
}

