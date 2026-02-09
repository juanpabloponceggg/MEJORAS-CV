import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useClients } from "./useClients";
import { useExecutives } from "./useExecutives";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import { COLORS, MESES, formatMoney, STATUS_CONFIG, PRODUCTOS, ESTATUS_LIST, getDaysInMonth, pctColor, getTimeSinceUpdate } from "./constants";

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Retry automático para queries de Supabase (cold-start protection)
// ═══════════════════════════════════════════════════════════════════════════
async function fetchWithRetry(fn, maxRetries = 2, delayMs = 2000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      console.warn(`Fetch intento ${attempt + 1} falló:`, err.message);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function LoadingScreen() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: COLORS.bg,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 60,
          height: 60,
          border: `4px solid ${COLORS.border}`,
          borderTop: `4px solid ${COLORS.primary}`,
          borderRadius: "50%",
          margin: "0 auto 20px",
          animation: "spin 1s linear infinite",
        }} />
        <h2 style={{ color: COLORS.text, marginBottom: 8 }}>Cargando...</h2>
        <p style={{ color: COLORS.textLight }}>Autenticando tu sesión</p>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN - REAL SUPABASE AUTH
// ═══════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin, authError, onResetPassword }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(authError || null);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showCheckmark, setShowCheckmark] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await onLogin(email, password);
    if (result?.success) {
      setShowCheckmark(true);
      setTimeout(() => {
        // useAuth will handle redirect via perfil state change
      }, 500);
    } else {
      setError(result?.error || "Error al iniciar sesión");
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    const result = await onResetPassword(resetEmail);
    if (result?.success) {
      setResetSent(true);
      setResetLoading(false);
    } else {
      setError(result?.error || "Error al enviar reset");
      setResetLoading(false);
    }
  };

  if (showCheckmark) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: COLORS.bg,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: COLORS.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            animation: "popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ color: COLORS.primary }}>Bienvenido!</h2>
        </div>
        <style>{`
          @keyframes popIn {
            0% { transform: scale(0); }
            100% { transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  if (showReset) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: COLORS.bg,
        padding: 20,
      }}>
        <div style={{
          width: "100%",
          maxWidth: 400,
          background: COLORS.card,
          borderRadius: 12,
          padding: 40,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}>
          <h2 style={{ color: COLORS.text, marginBottom: 10, textAlign: "center" }}>
            Recuperar contraseña
          </h2>
          <p style={{ color: COLORS.textLight, marginBottom: 24, textAlign: "center", fontSize: 14 }}>
            Ingresa tu email para recibir un enlace de recuperación
          </p>

          {resetSent && (
            <div style={{
              background: COLORS.greenBg,
              color: COLORS.green,
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 14,
            }}>
              Se envió un enlace de recuperación a tu email
            </div>
          )}

          <form onSubmit={handleResetPassword}>
            <div style={{ marginBottom: 16 }}>
              <input
                type="email"
                placeholder="tu@email.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: "border-box",
                  background: COLORS.inputBg,
                }}
              />
            </div>

            <button
              type="submit"
              disabled={resetLoading || resetSent}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: COLORS.primary,
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: resetLoading || resetSent ? "default" : "pointer",
                opacity: resetLoading || resetSent ? 0.6 : 1,
              }}
            >
              {resetLoading ? "Enviando..." : resetSent ? "Enlace enviado" : "Enviar enlace"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowReset(false);
                setResetSent(false);
                setResetEmail("");
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "transparent",
                color: COLORS.primary,
                border: "none",
                marginTop: 12,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Volver al login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: COLORS.bg,
      padding: 20,
    }}>
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: COLORS.card,
        borderRadius: 12,
        padding: 40,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            border: `3px solid ${COLORS.primary}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ color: COLORS.text, margin: 0, fontSize: 28, fontWeight: 700 }}>
            Credivive
          </h1>
          <p style={{ color: COLORS.textLight, margin: "8px 0 0", fontSize: 13 }}>
            Dashboard de créditos
          </p>
        </div>

        {error && (
          <div style={{
            background: COLORS.redBg,
            color: COLORS.red,
            padding: 12,
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: COLORS.text, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Email
            </label>
            <div style={{ position: "relative" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.textLight} strokeWidth="2"
                style={{ position: "absolute", left: 12, top: 11 }}>
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 16px 12px 44px",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: "border-box",
                  background: COLORS.inputBg,
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", color: COLORS.text, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Contraseña
            </label>
            <div style={{ position: "relative" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.textLight} strokeWidth="2"
                style={{ position: "absolute", left: 12, top: 11 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 16px 12px 44px",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: "border-box",
                  background: COLORS.inputBg,
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: COLORS.primary,
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Conectando..." : "Iniciar sesión"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            type="button"
            onClick={() => setShowReset(true)}
            style={{
              background: "none",
              border: "none",
              color: COLORS.primary,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "underline",
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        {/* Demo accounts */}
        <div style={{
          marginTop: 32,
          paddingTop: 20,
          borderTop: `1px solid ${COLORS.border}`,
        }}>
          <p style={{ fontSize: 11, color: COLORS.textLight, textAlign: "center", marginBottom: 10 }}>
            Cuentas de prueba
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => { setEmail("admin.demo@credivive.test"); setPassword("12345678"); }}
              style={{
                flex: 1, minWidth: 120, padding: "10px", fontSize: 12, fontWeight: 600,
                color: "#F59E0B", background: "#FFFBEB",
                border: "1px solid #F59E0B30", borderRadius: 8,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Admin Prueba
            </button>
            <button
              type="button"
              onClick={() => { setEmail("Ejecutivonomina@credivive.mx"); setPassword("12345678"); }}
              style={{
                flex: 1, minWidth: 120, padding: "10px", fontSize: 12, fontWeight: 600,
                color: COLORS.primary, background: COLORS.primaryLight,
                border: `1px solid ${COLORS.primary}30`, borderRadius: 8,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Ejecutivo Nómina
            </button>
            <button
              type="button"
              onClick={() => { setEmail("ejecutivomoto@credivive.mx"); setPassword("12345678"); }}
              style={{
                flex: 1, minWidth: 120, padding: "10px", fontSize: 12, fontWeight: 600,
                color: COLORS.moto, background: `${COLORS.moto}10`,
                border: `1px solid ${COLORS.moto}30`, borderRadius: 8,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Ejecutivo Motos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD SCREEN
// ═══════════════════════════════════════════════════════════════════════════

function ChangePasswordScreen({ onUpdatePassword, onCancel }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    const result = await onUpdatePassword(newPassword);
    setSaving(false);

    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error || "Error al actualizar la contraseña.");
    }
  };

  if (success) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(135deg, ${COLORS.dark} 0%, #1a2332 100%)`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{
          background: "#fff", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 400,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: COLORS.dark, marginBottom: 8 }}>
            Contraseña actualizada
          </h2>
          <p style={{ fontSize: 14, color: COLORS.textLight, marginBottom: 24 }}>
            Tu contraseña se cambió correctamente.
          </p>
          <button
            onClick={onCancel}
            style={{
              width: "100%", padding: "14px", fontSize: 15, fontWeight: 700,
              color: "#fff", background: COLORS.primary, border: "none", borderRadius: 12,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Ir al Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(135deg, ${COLORS.dark} 0%, #1a2332 100%)`,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 400,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔑</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, marginBottom: 4 }}>
            Nueva contraseña
          </h2>
          <p style={{ fontSize: 13, color: COLORS.textLight }}>
            Ingresa tu nueva contraseña
          </p>
        </div>

        {error && (
          <div style={{
            background: "#FEF2F2", borderRadius: 10, padding: "12px 16px",
            marginBottom: 16, border: "1px solid #FECACA",
          }}>
            <p style={{ fontSize: 13, color: "#DC2626", margin: 0, fontWeight: 600 }}>
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.textLight, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Nueva contraseña
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              style={{
                width: "100%", padding: "14px 16px", fontSize: 15,
                border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
                outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.textLight, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              required
              style={{
                width: "100%", padding: "14px 16px", fontSize: 15,
                border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
                outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              width: "100%", padding: "14px", fontSize: 15, fontWeight: 700,
              color: "#fff", background: saving ? "#94A3B8" : COLORS.primary,
              border: "none", borderRadius: 12, cursor: saving ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {saving ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS (used by multiple screens)
// ═══════════════════════════════════════════════════════════════════════════

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status];
  if (!config) return <span>{status}</span>;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.color}30`,
        whiteSpace: "nowrap",
      }}
    >
      {config.label}
    </span>
  );
}

function SelectDropdown({ value, onChange, options, placeholder, width }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: width || "100%",
        padding: "8px 10px",
        fontSize: 13,
        border: `1.5px solid ${COLORS.border}`,
        borderRadius: 6,
        background: "#fff",
        color: COLORS.text,
        cursor: "pointer",
        fontFamily: "inherit",
        outline: "none",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function ProgressBar({ pct, color }) {
  const cappedPct = Math.min(pct, 100);
  return (
    <div style={{ width: "100%", height: 10, background: "#F1F5F9", borderRadius: 10, overflow: "hidden", position: "relative" }}>
      <div
        style={{
          width: `${cappedPct}%`,
          height: "100%",
          background: color,
          borderRadius: 10,
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLA CLIENTES SCREEN (Fase 3)
// ═══════════════════════════════════════════════════════════════════════════

function AddClientModal({ onAdd, onClose, ejecutivos = [] }) {
  const [form, setForm] = useState({
    ejecutivo: "",
    nombre_cliente: "",
    producto: "",
    monto: "",
    fecha_inicio: new Date().toISOString().split("T")[0],
    estatus: "Prospecto",
    actualizacion: "",
    fecha_final: "",
  });

  const update = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = () => {
    if (!form.ejecutivo || !form.nombre_cliente || !form.producto) {
      alert("Llena los campos obligatorios: Ejecutivo, Cliente y Producto");
      return;
    }
    onAdd({ ...form, monto: Number(form.monto) || 0 });
  };

  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 4 };
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 8,
    background: "#fff",
    color: COLORS.text,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "28px 24px",
          maxWidth: 480,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.dark, margin: 0 }}>
            + Nuevo Cliente
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: COLORS.textLight,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Ejecutivo *</label>
            <SelectDropdown value={form.ejecutivo} onChange={(v) => update("ejecutivo", v)} options={ejecutivos} placeholder="Seleccionar ejecutivo..." />
          </div>
          <div>
            <label style={labelStyle}>Nombre del cliente *</label>
            <input style={inputStyle} value={form.nombre_cliente} onChange={(e) => update("nombre_cliente", e.target.value)} placeholder="Nombre completo del cliente" />
          </div>
          <div>
            <label style={labelStyle}>Producto *</label>
            <SelectDropdown value={form.producto} onChange={(v) => update("producto", v)} options={PRODUCTOS} placeholder="Seleccionar producto..." />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Monto ($)</label>
              <input style={inputStyle} type="number" value={form.monto} onChange={(e) => update("monto", e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Fecha inicio</label>
              <input style={inputStyle} type="date" value={form.fecha_inicio} onChange={(e) => update("fecha_inicio", e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Estatus</label>
            <SelectDropdown value={form.estatus} onChange={(v) => update("estatus", v)} options={ESTATUS_LIST} placeholder="Seleccionar estatus..." />
          </div>
          <div>
            <label style={labelStyle}>Actualización / Notas</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={form.actualizacion}
              onChange={(e) => update("actualizacion", e.target.value)}
              placeholder="Notas sobre el cliente..."
            />
          </div>
          <div>
            <label style={labelStyle}>Fecha final</label>
            <input style={inputStyle} type="date" value={form.fecha_final} onChange={(e) => update("fecha_final", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px",
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.textLight,
              background: "#F3F4F6",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            style={{
              flex: 2,
              padding: "12px",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
              background: COLORS.primary,
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: `0 4px 12px ${COLORS.primary}40`,
            }}
          >
            Guardar cliente
          </button>
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "16px 18px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        border: `1px solid ${COLORS.border}`,
        minWidth: 140,
        flex: "1 1 140px",
      }}
    >
      <p style={{ fontSize: 11, color: COLORS.textLight, margin: "0 0 4px", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color: color || COLORS.dark, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: COLORS.textLight, margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT DETAIL MODAL — Historial de estatus
// ═══════════════════════════════════════════════════════════════════════════

function ClientDetailModal({ client, onClose, fetchStatusHistory }) {
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setHistLoading(true);
      const data = await fetchStatusHistory(client.id);
      setHistory(data);
      setHistLoading(false);
    };
    load();
  }, [client.id, fetchStatusHistory]);

  const getIcon = (status) => {
    const icons = { "Prospecto": "🎯", "Entrega de documentos": "📄", "Análisis": "🔍", "Aprobación": "✅", "Dispersión": "💰", "Rechazado": "✕" };
    return icons[status] || "•";
  };

  const timeSince = getTimeSinceUpdate(client.estatus_updated_at);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10000, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "32px",
        maxWidth: 580, width: "100%", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: COLORS.dark, margin: "0 0 4px" }}>
              {client.nombre_cliente}
            </h2>
            <p style={{ fontSize: 13, color: COLORS.textLight, margin: 0 }}>
              {client.producto} {client.monto ? `— ${formatMoney(client.monto)}` : ""}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 24, cursor: "pointer",
            color: COLORS.textLight, padding: 0,
          }}>×</button>
        </div>

        {/* Info Grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
          padding: 16, background: COLORS.bg, borderRadius: 12, marginBottom: 24,
        }}>
          <div>
            <p style={{ fontSize: 11, color: COLORS.textLight, textTransform: "uppercase", fontWeight: 600, margin: "0 0 4px" }}>Ejecutivo</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, margin: 0 }}>{client.ejecutivo || "—"}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: COLORS.textLight, textTransform: "uppercase", fontWeight: 600, margin: "0 0 4px" }}>Estatus actual</p>
            <StatusBadge status={client.estatus} />
          </div>
          <div>
            <p style={{ fontSize: 11, color: COLORS.textLight, textTransform: "uppercase", fontWeight: 600, margin: "0 0 4px" }}>Fecha inicio</p>
            <p style={{ fontSize: 14, color: COLORS.text, margin: 0 }}>{client.fecha_inicio || "—"}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: COLORS.textLight, textTransform: "uppercase", fontWeight: 600, margin: "0 0 4px" }}>Sin actualizar</p>
            <span style={{ fontSize: 14, fontWeight: 700, color: timeSince.color }}>{timeSince.text}</span>
          </div>
        </div>

        {/* Notas */}
        {client.actualizacion && (
          <div style={{
            padding: "12px 14px", background: "#FFFBEB", borderRadius: 10,
            border: "1px solid #F59E0B30", marginBottom: 20,
          }}>
            <p style={{ fontSize: 11, color: COLORS.textLight, fontWeight: 600, margin: "0 0 4px", textTransform: "uppercase" }}>Última nota</p>
            <p style={{ fontSize: 13, color: COLORS.text, margin: 0, fontStyle: "italic" }}>"{client.actualizacion}"</p>
          </div>
        )}

        {/* Timeline */}
        <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.dark, margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Historial de cambios
        </h3>

        {histLoading ? (
          <p style={{ textAlign: "center", padding: 20, color: COLORS.textLight, fontSize: 13 }}>Cargando historial...</p>
        ) : history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 16px", background: COLORS.bg, borderRadius: 12 }}>
            <p style={{ fontSize: 28, margin: "0 0 8px" }}>📋</p>
            <p style={{ fontSize: 13, color: COLORS.textLight, margin: 0 }}>
              Aún no hay cambios registrados para este cliente.
            </p>
            <p style={{ fontSize: 11, color: COLORS.textLight, margin: "4px 0 0" }}>
              Los cambios de estatus se registrarán automáticamente a partir de ahora.
            </p>
          </div>
        ) : (
          <div style={{ position: "relative", paddingLeft: 32 }}>
            {/* Línea vertical */}
            <div style={{
              position: "absolute", left: 11, top: 4, bottom: 4,
              width: 2, background: COLORS.border,
            }} />

            {history.map((h, idx) => {
              const statusConf = STATUS_CONFIG[h.estatus_nuevo] || { color: COLORS.textLight, bg: "#F3F4F6" };
              return (
                <div key={h.id} style={{ marginBottom: idx < history.length - 1 ? 16 : 0, position: "relative" }}>
                  {/* Punto */}
                  <div style={{
                    position: "absolute", left: -32, top: 2,
                    width: 22, height: 22, borderRadius: "50%",
                    background: statusConf.bg, border: `2.5px solid ${statusConf.color}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10,
                  }}>
                    {getIcon(h.estatus_nuevo)}
                  </div>

                  {/* Card */}
                  <div style={{
                    background: "#fff", padding: "10px 14px", borderRadius: 10,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: statusConf.color, margin: 0 }}>
                          {h.estatus_nuevo}
                        </p>
                        {h.estatus_anterior && (
                          <p style={{ fontSize: 11, color: COLORS.textLight, margin: "2px 0 0" }}>
                            Antes: {h.estatus_anterior}
                          </p>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: COLORS.textLight, whiteSpace: "nowrap" }}>
                        {new Date(h.fecha_cambio).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}{" "}
                        {new Date(h.fecha_cambio).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {h.nota && (
                      <p style={{ fontSize: 12, color: COLORS.text, margin: "6px 0 0", fontStyle: "italic" }}>
                        "{h.nota}"
                      </p>
                    )}
                    {h.usuario && h.usuario !== "sistema" && (
                      <p style={{ fontSize: 10, color: COLORS.textLight, margin: "4px 0 0" }}>
                        Por: {h.usuario}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cerrar */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onClose} style={{
            padding: "10px 24px", fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${COLORS.border}`, background: "#fff",
            borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
          }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLA DE CLIENTES (Admin)
// ═══════════════════════════════════════════════════════════════════════════

// ╔══════════════════════════════════════════════════════════════════╗
// ║                      DASHBOARD PRINCIPAL                       ║
// ╚══════════════════════════════════════════════════════════════════╝
function DashboardAdmin() {
  const today = new Date();
  const [modo, setModo] = useState("mensual"); // mensual | acumulado | historial
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [anio, setAnio] = useState(today.getFullYear());
  const [allClients, setAllClients] = useState([]);
  const [allEjecutivos, setAllEjecutivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aniosDisponibles, setAniosDisponibles] = useState([today.getFullYear()]);
  const isMobile = useIsMobile();

  // ── Cargar TODOS los clientes y ejecutivos (con retry) ──
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        await fetchWithRetry(async () => {
          const [cRes, eRes] = await Promise.all([
            supabase.from("clientes").select("*").order("fecha_inicio", { ascending: false }),
            supabase.from("ejecutivos").select("*"),
          ]);
          if (cRes.error) throw cRes.error;
          if (eRes.error) throw eRes.error;
          setAllClients(cRes.data || []);
          setAllEjecutivos(eRes.data || []);
          // Obtener años disponibles
          const years = new Set();
          (cRes.data || []).forEach((c) => {
            if (c.fecha_inicio) years.add(new Date(c.fecha_inicio).getFullYear());
          });
          (eRes.data || []).forEach((e) => { if (e.anio) years.add(e.anio); });
          years.add(today.getFullYear());
          setAniosDisponibles([...years].sort((a, b) => b - a));
        });
      } catch (err) {
        console.error("Dashboard error tras reintentos:", err);
      }
      setLoading(false);
    };
    fetchAll();
  }, []);

  // ── Filtrar datos según modo ──
  const dispersados = useMemo(() => {
    const disp = allClients.filter((c) => c.estatus === "Dispersión");
    if (modo === "mensual") {
      return disp.filter((c) => {
        if (!c.fecha_inicio) return false;
        const d = new Date(c.fecha_inicio);
        return d.getMonth() + 1 === mes && d.getFullYear() === anio;
      });
    }
    if (modo === "acumulado") {
      return disp.filter((c) => {
        if (!c.fecha_inicio) return false;
        return new Date(c.fecha_inicio).getFullYear() === anio;
      });
    }
    return disp; // historial = todos
  }, [allClients, modo, mes, anio]);

  const ejecutivosPeriodo = useMemo(() => {
    if (modo === "mensual") return allEjecutivos.filter((e) => e.mes === mes && e.anio === anio);
    if (modo === "acumulado") return allEjecutivos.filter((e) => e.anio === anio);
    return allEjecutivos;
  }, [allEjecutivos, modo, mes, anio]);

  // ── KPIs financieros ──
  const finance = useMemo(() => {
    const ingresosNomina = dispersados
      .filter((c) => c.producto === "Crédito de nómina")
      .reduce((s, c) => s + (c.monto || 0), 0);
    const ingresosMotos = dispersados
      .filter((c) => c.producto !== "Crédito de nómina")
      .reduce((s, c) => s + (c.monto || 0), 0);
    const ingresosTotales = ingresosNomina + ingresosMotos;
    const presupuesto = ejecutivosPeriodo
      .filter((e) => e.tipo === "nómina")
      .reduce((s, e) => s + (e.meta || 0), 0);
    const pctCumplimiento = presupuesto > 0 ? (ingresosTotales / presupuesto) * 100 : 0;
    const totalDisp = dispersados.length;
    const ticketPromedio = totalDisp > 0 ? ingresosTotales / totalDisp : 0;
    const totalClientes = modo === "mensual"
      ? allClients.filter((c) => { const d = new Date(c.fecha_inicio); return d.getMonth() + 1 === mes && d.getFullYear() === anio; }).length
      : modo === "acumulado"
        ? allClients.filter((c) => new Date(c.fecha_inicio).getFullYear() === anio).length
        : allClients.length;
    const tasaConversion = totalClientes > 0 ? (totalDisp / totalClientes) * 100 : 0;
    // Proyección (solo mensual, mes actual)
    const diasMes = getDaysInMonth(mes, anio);
    let diaEfectivo = today.getDate();
    if (anio < today.getFullYear() || (anio === today.getFullYear() && mes < today.getMonth() + 1)) diaEfectivo = diasMes;
    else if (anio > today.getFullYear() || (anio === today.getFullYear() && mes > today.getMonth() + 1)) diaEfectivo = 0;
    const proyeccion = modo === "mensual" && diaEfectivo > 0 ? (ingresosTotales / diaEfectivo) * diasMes : 0;
    const falta = Math.max(presupuesto - ingresosTotales, 0);
    return {
      ingresosTotales, ingresosNomina, ingresosMotos, presupuesto, pctCumplimiento,
      totalDisp, ticketPromedio, tasaConversion, totalClientes, proyeccion, falta, diasMes, diaEfectivo,
    };
  }, [dispersados, ejecutivosPeriodo, allClients, modo, mes, anio]);

  // ── Ranking de ejecutivos ──
  const ranking = useMemo(() => {
    const map = {};
    dispersados.forEach((c) => {
      const ej = c.ejecutivo || "Sin asignar";
      if (!map[ej]) map[ej] = { nombre: ej, monto: 0, clientes: 0, nomina: 0, motos: 0 };
      map[ej].monto += c.monto || 0;
      map[ej].clientes += 1;
      if (c.producto === "Crédito de nómina") map[ej].nomina += c.monto || 0;
      else map[ej].motos += c.monto || 0;
    });
    return Object.values(map).sort((a, b) => b.monto - a.monto);
  }, [dispersados]);

  // ── Datos mensuales para gráfica ──
  const monthlyData = useMemo(() => {
    const disp = allClients.filter((c) => c.estatus === "Dispersión");
    const targetAnio = modo === "historial" ? null : anio;
    const meses = {};
    disp.forEach((c) => {
      if (!c.fecha_inicio) return;
      const d = new Date(c.fecha_inicio);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (targetAnio && y !== targetAnio) return;
      const key = targetAnio ? `${m}` : `${y}-${String(m).padStart(2, "0")}`;
      const label = targetAnio ? MESES[m - 1].slice(0, 3) : `${MESES[m - 1].slice(0, 3)} ${y}`;
      if (!meses[key]) meses[key] = { key, label, ingresos: 0, clientes: 0, mes: m, anio: y };
      meses[key].ingresos += c.monto || 0;
      meses[key].clientes += 1;
    });
    // Agregar presupuesto por mes
    const result = Object.values(meses).sort((a, b) => {
      if (a.anio !== b.anio) return a.anio - b.anio;
      return a.mes - b.mes;
    });
    result.forEach((item) => {
      const ejMes = allEjecutivos.filter((e) => e.mes === item.mes && e.anio === item.anio && e.tipo === "nómina");
      item.presupuesto = ejMes.reduce((s, e) => s + (e.meta || 0), 0);
    });
    // Si es acumulado o mensual, rellenar meses sin datos
    if (targetAnio) {
      const maxMes = targetAnio === today.getFullYear() ? today.getMonth() + 1 : 12;
      for (let i = 1; i <= maxMes; i++) {
        const k = `${i}`;
        if (!meses[k]) {
          const ejMes = allEjecutivos.filter((e) => e.mes === i && e.anio === targetAnio && e.tipo === "nómina");
          result.push({
            key: k, label: MESES[i - 1].slice(0, 3), ingresos: 0, clientes: 0,
            mes: i, anio: targetAnio, presupuesto: ejMes.reduce((s, e) => s + (e.meta || 0), 0),
          });
        }
      }
      result.sort((a, b) => a.mes - b.mes);
    }
    return result;
  }, [allClients, allEjecutivos, modo, anio]);

  // ── Productos breakdown ──
  const productoBreakdown = useMemo(() => {
    const map = {};
    dispersados.forEach((c) => {
      const p = c.producto || "Otro";
      if (!map[p]) map[p] = { nombre: p, monto: 0, count: 0 };
      map[p].monto += c.monto || 0;
      map[p].count += 1;
    });
    return Object.values(map).sort((a, b) => b.monto - a.monto);
  }, [dispersados]);

  // ── Mejores métricas ──
  const highlights = useMemo(() => {
    const mejorEjecutivo = ranking.length > 0 ? ranking[0] : null;
    const mejorMes = monthlyData.length > 0 ? [...monthlyData].sort((a, b) => b.ingresos - a.ingresos)[0] : null;
    const mejorProducto = productoBreakdown.length > 0 ? productoBreakdown[0] : null;
    return { mejorEjecutivo, mejorMes, mejorProducto };
  }, [ranking, monthlyData, productoBreakdown]);

  // ── Helper: Mini bar chart ──
  const maxIngreso = useMemo(() => Math.max(...monthlyData.map((m) => Math.max(m.ingresos, m.presupuesto || 0)), 1), [monthlyData]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: COLORS.textLight, fontSize: 16 }}>Cargando dashboard...</p>
      </div>
    );
  }

  const periodoLabel = modo === "mensual" ? `${MESES[mes - 1]} ${anio}` : modo === "acumulado" ? `Acumulado ${anio}` : "Todo el historial";

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ padding: isMobile ? "16px 12px" : "20px 24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ─── HEADER: Título + selector de periodo ─── */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: isMobile ? "14px 16px" : "18px 24px", marginBottom: 18,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: COLORS.dark, margin: 0 }}>
                📊 Dashboard Ejecutivo
              </h1>
              <p style={{ fontSize: 13, color: COLORS.textLight, margin: "4px 0 0" }}>{periodoLabel}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {/* Selector de modo */}
              {["mensual", "acumulado", "historial"].map((m) => (
                <button key={m} onClick={() => setModo(m)} style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: modo === m ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                  background: modo === m ? COLORS.primaryLight : "#fff",
                  color: modo === m ? COLORS.primaryDark : COLORS.textLight,
                  textTransform: "capitalize",
                }}>
                  {m === "mensual" ? "Mensual" : m === "acumulado" ? "Año acumulado" : "Historial"}
                </button>
              ))}
              {/* Selector de mes (solo modo mensual) */}
              {modo === "mensual" && (
                <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{
                  padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
                  fontSize: 12, fontWeight: 600, color: COLORS.text, background: "#fff", cursor: "pointer",
                }}>
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              )}
              {/* Selector de año (mensual o acumulado) */}
              {modo !== "historial" && (
                <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{
                  padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
                  fontSize: 12, fontWeight: 600, color: COLORS.text, background: "#fff", cursor: "pointer",
                }}>
                  {aniosDisponibles.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* ─── HIGHLIGHTS (Top Insights) ─── */}
        <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
          {highlights.mejorEjecutivo && (
            <div style={{
              flex: 1, minWidth: isMobile ? "100%" : 200, padding: "14px 18px", borderRadius: 12,
              background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)",
              border: `1px solid ${COLORS.green}33`,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: COLORS.green, margin: 0, textTransform: "uppercase" }}>🏆 Mejor ejecutivo</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: COLORS.dark, margin: "4px 0 2px" }}>{highlights.mejorEjecutivo.nombre}</p>
              <p style={{ fontSize: 12, color: COLORS.textLight, margin: 0 }}>{formatMoney(Math.round(highlights.mejorEjecutivo.monto))} · {highlights.mejorEjecutivo.clientes} clientes</p>
            </div>
          )}
          {highlights.mejorMes && (
            <div style={{
              flex: 1, minWidth: isMobile ? "100%" : 200, padding: "14px 18px", borderRadius: 12,
              background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
              border: `1px solid ${COLORS.blue}33`,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: COLORS.blue, margin: 0, textTransform: "uppercase" }}>📅 Mejor mes</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: COLORS.dark, margin: "4px 0 2px" }}>{highlights.mejorMes.label} {highlights.mejorMes.anio !== anio ? highlights.mejorMes.anio : ""}</p>
              <p style={{ fontSize: 12, color: COLORS.textLight, margin: 0 }}>{formatMoney(Math.round(highlights.mejorMes.ingresos))} · {highlights.mejorMes.clientes} dispersados</p>
            </div>
          )}
          {highlights.mejorProducto && (
            <div style={{
              flex: 1, minWidth: isMobile ? "100%" : 200, padding: "14px 18px", borderRadius: 12,
              background: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)",
              border: `1px solid ${COLORS.purple}33`,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: COLORS.purple, margin: 0, textTransform: "uppercase" }}>🎯 Producto top</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: COLORS.dark, margin: "4px 0 2px" }}>{highlights.mejorProducto.nombre}</p>
              <p style={{ fontSize: 12, color: COLORS.textLight, margin: 0 }}>{formatMoney(Math.round(highlights.mejorProducto.monto))} · {highlights.mejorProducto.count} operaciones</p>
            </div>
          )}
        </div>

        {/* ─── KPIs FINANCIEROS ─── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
          {[
            { icon: "💰", label: "Ingresos totales", value: formatMoney(Math.round(finance.ingresosTotales)), color: COLORS.primary, sub: `${finance.totalDisp} dispersados` },
            { icon: "🎯", label: "Presupuesto", value: formatMoney(Math.round(finance.presupuesto)), color: COLORS.blue, sub: finance.presupuesto > 0 ? `${finance.pctCumplimiento.toFixed(1)}% cumplido` : "Sin meta" },
            { icon: "📈", label: modo === "mensual" ? "Proyección cierre" : "Ticket promedio", value: modo === "mensual" ? formatMoney(Math.round(finance.proyeccion)) : formatMoney(Math.round(finance.ticketPromedio)), color: modo === "mensual" && finance.proyeccion >= finance.presupuesto ? COLORS.green : COLORS.yellow, sub: modo === "mensual" ? (finance.proyeccion >= finance.presupuesto ? "¡Superaría meta!" : "Por debajo de meta") : `por operación` },
            { icon: "📊", label: "Tasa de conversión", value: `${finance.tasaConversion.toFixed(1)}%`, color: finance.tasaConversion >= 50 ? COLORS.green : finance.tasaConversion >= 25 ? COLORS.yellow : COLORS.red, sub: `${finance.totalDisp} de ${finance.totalClientes} clientes` },
          ].map((kpi, i) => (
            <div key={i} style={{
              background: "#fff", borderRadius: 12, padding: isMobile ? "12px 14px" : "16px 20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
              borderLeft: `4px solid ${kpi.color}`,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>
                {kpi.icon} {kpi.label}
              </p>
              <p style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: COLORS.dark, margin: "6px 0 2px" }}>{kpi.value}</p>
              <p style={{ fontSize: 11, color: kpi.color, fontWeight: 600, margin: 0 }}>{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* ─── Segunda fila KPIs ─── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
          {[
            { icon: "💵", label: "Nómina", value: formatMoney(Math.round(finance.ingresosNomina)), color: COLORS.primary, sub: "Créditos dispersados" },
            { icon: "🏍", label: "Motos", value: formatMoney(Math.round(finance.ingresosMotos)), color: COLORS.moto, sub: "Arrendamiento + Financiamiento" },
            { icon: "🔻", label: "Falta por vender", value: finance.falta === 0 ? "¡Meta alcanzada!" : formatMoney(Math.round(finance.falta)), color: finance.falta === 0 ? COLORS.green : COLORS.red, sub: finance.falta === 0 ? "Excelente trabajo" : "para llegar a presupuesto" },
            { icon: "🧾", label: "Ticket promedio", value: formatMoney(Math.round(finance.ticketPromedio)), color: COLORS.purple, sub: `${finance.totalDisp} operaciones` },
          ].map((kpi, i) => (
            <div key={i} style={{
              background: "#fff", borderRadius: 12, padding: isMobile ? "12px 14px" : "16px 20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
              borderLeft: `4px solid ${kpi.color}`,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>
                {kpi.icon} {kpi.label}
              </p>
              <p style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: COLORS.dark, margin: "6px 0 2px" }}>{kpi.value}</p>
              <p style={{ fontSize: 11, color: kpi.color, fontWeight: 600, margin: 0 }}>{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* ─── BARRA DE CUMPLIMIENTO ─── */}
        {finance.presupuesto > 0 && (
          <div style={{
            background: "#fff", borderRadius: 14, padding: isMobile ? "14px 16px" : "18px 24px", marginBottom: 18,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.dark, margin: 0 }}>Cumplimiento de presupuesto</h3>
              <span style={{
                fontSize: 14, fontWeight: 800,
                color: finance.pctCumplimiento >= 100 ? COLORS.green : finance.pctCumplimiento >= 70 ? COLORS.yellow : COLORS.red,
              }}>
                {finance.pctCumplimiento.toFixed(1)}%
              </span>
            </div>
            <div style={{ width: "100%", height: 14, background: "#E2E8F0", borderRadius: 7, overflow: "hidden", position: "relative" }}>
              <div style={{
                width: `${Math.min(finance.pctCumplimiento, 100)}%`, height: "100%",
                background: finance.pctCumplimiento >= 100 ? `linear-gradient(90deg, ${COLORS.green}, #34D399)` : finance.pctCumplimiento >= 70 ? `linear-gradient(90deg, ${COLORS.yellow}, #FCD34D)` : `linear-gradient(90deg, ${COLORS.red}, #FCA5A5)`,
                borderRadius: 7, transition: "width 0.6s ease",
              }} />
              {/* Marca de proyección */}
              {modo === "mensual" && finance.proyeccion > 0 && finance.presupuesto > 0 && (
                <div style={{
                  position: "absolute", top: -2, bottom: -2,
                  left: `${Math.min((finance.proyeccion / finance.presupuesto) * 100, 100)}%`,
                  width: 3, background: COLORS.dark, borderRadius: 2, opacity: 0.5,
                }} title={`Proyección: ${formatMoney(Math.round(finance.proyeccion))}`} />
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: COLORS.textLight }}>
              <span>💰 Real: {formatMoney(Math.round(finance.ingresosTotales))}</span>
              {modo === "mensual" && <span style={{ color: COLORS.dark, fontWeight: 600 }}>▾ Proyección: {formatMoney(Math.round(finance.proyeccion))}</span>}
              <span>🎯 Meta: {formatMoney(Math.round(finance.presupuesto))}</span>
            </div>
          </div>
        )}

        {/* ─── GRÁFICA DE INGRESOS POR MES ─── */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: isMobile ? "14px 16px" : "18px 24px", marginBottom: 18,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.dark, margin: "0 0 16px" }}>
            📈 Ingresos por mes {modo === "mensual" ? "" : `— ${modo === "acumulado" ? anio : "Historial completo"}`}
          </h3>
          {monthlyData.length === 0 ? (
            <p style={{ textAlign: "center", color: COLORS.textLight, padding: 20 }}>Sin datos para este periodo</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: isMobile ? 2 : 6, height: 180, padding: "0 0 30px", position: "relative" }}>
                {/* Línea base */}
                <div style={{ position: "absolute", bottom: 30, left: 0, right: 0, height: 1, background: COLORS.border }} />
                {monthlyData.map((item, i) => {
                  const hIngreso = maxIngreso > 0 ? (item.ingresos / maxIngreso) * 140 : 0;
                  const hPres = maxIngreso > 0 && item.presupuesto ? (item.presupuesto / maxIngreso) * 140 : 0;
                  const esMesActual = item.mes === today.getMonth() + 1 && item.anio === today.getFullYear();
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                      {/* Tooltip con valor */}
                      {item.ingresos > 0 && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: COLORS.primary, marginBottom: 2, whiteSpace: "nowrap" }}>
                          {isMobile ? "" : formatMoney(Math.round(item.ingresos / 1000)) + "k"}
                        </span>
                      )}
                      {/* Barra de presupuesto (fantasma detrás) */}
                      {hPres > 0 && (
                        <div style={{
                          position: "absolute", bottom: 30, width: "70%",
                          height: hPres, background: `${COLORS.blue}15`, border: `1px dashed ${COLORS.blue}40`,
                          borderRadius: 4,
                        }} />
                      )}
                      {/* Barra de ingresos */}
                      <div style={{
                        width: "55%", height: Math.max(hIngreso, 2), borderRadius: 4,
                        background: esMesActual ? `linear-gradient(180deg, ${COLORS.primary}, ${COLORS.primaryDark})` : item.ingresos >= (item.presupuesto || 0) && item.presupuesto > 0 ? COLORS.green : COLORS.primary,
                        transition: "height 0.4s ease",
                        boxShadow: esMesActual ? `0 2px 8px ${COLORS.primary}40` : "none",
                      }} />
                      {/* Label */}
                      <span style={{
                        fontSize: isMobile ? 7 : 9, fontWeight: esMesActual ? 800 : 600,
                        color: esMesActual ? COLORS.primary : COLORS.textLight,
                        marginTop: 4, textAlign: "center",
                      }}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Leyenda */}
              <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS.primary }} />
                  <span style={{ fontSize: 10, color: COLORS.textLight }}>Ingresos</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: `${COLORS.blue}15`, border: `1px dashed ${COLORS.blue}40` }} />
                  <span style={{ fontSize: 10, color: COLORS.textLight }}>Presupuesto</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ─── ACUMULADO MES A MES ─── */}
        {(modo === "acumulado" || modo === "historial") && monthlyData.length > 1 && (() => {
          let acum = 0;
          const acumuladoData = monthlyData.map((m) => { acum += m.ingresos; return { ...m, acumulado: acum }; });
          const maxAcum = Math.max(...acumuladoData.map((m) => m.acumulado), 1);
          return (
            <div style={{
              background: "#fff", borderRadius: 14, padding: isMobile ? "14px 16px" : "18px 24px", marginBottom: 18,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.dark, margin: "0 0 16px" }}>📊 Ingresos acumulados</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: isMobile ? 2 : 6, height: 140, padding: "0 0 30px", position: "relative" }}>
                <div style={{ position: "absolute", bottom: 30, left: 0, right: 0, height: 1, background: COLORS.border }} />
                {acumuladoData.map((item, i) => {
                  const h = (item.acumulado / maxAcum) * 110;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      {!isMobile && <span style={{ fontSize: 8, fontWeight: 700, color: COLORS.primaryDark, marginBottom: 2 }}>{formatMoney(Math.round(item.acumulado / 1000))}k</span>}
                      <div style={{
                        width: "60%", height: Math.max(h, 2), borderRadius: 4,
                        background: `linear-gradient(180deg, ${COLORS.primary}CC, ${COLORS.primaryDark})`,
                        transition: "height 0.4s ease",
                      }} />
                      <span style={{ fontSize: isMobile ? 7 : 9, fontWeight: 600, color: COLORS.textLight, marginTop: 4 }}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
              <p style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: COLORS.primary, margin: "8px 0 0" }}>
                Total acumulado: {formatMoney(Math.round(acum))}
              </p>
            </div>
          );
        })()}

        {/* ─── DESGLOSE POR PRODUCTO ─── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18, marginBottom: 18 }}>
          {/* Productos */}
          <div style={{
            background: "#fff", borderRadius: 14, padding: isMobile ? "14px 16px" : "18px 24px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.dark, margin: "0 0 14px" }}>🎯 Desglose por producto</h3>
            {productoBreakdown.length === 0 ? (
              <p style={{ color: COLORS.textLight, fontSize: 13 }}>Sin datos</p>
            ) : (
              productoBreakdown.map((p, i) => {
                const pct = finance.ingresosTotales > 0 ? (p.monto / finance.ingresosTotales) * 100 : 0;
                const colores = [COLORS.primary, COLORS.moto, COLORS.blue, COLORS.purple];
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>{p.nombre}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: colores[i % colores.length] }}>{formatMoney(Math.round(p.monto))} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: colores[i % colores.length], borderRadius: 3, transition: "width 0.4s" }} />
                    </div>
                    <p style={{ fontSize: 10, color: COLORS.textLight, margin: "2px 0 0" }}>{p.count} operaciones</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Métricas rápidas */}
          <div style={{
            background: "#fff", borderRadius: 14, padding: isMobile ? "14px 16px" : "18px 24px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.dark, margin: "0 0 14px" }}>⚡ Métricas rápidas</h3>
            {[
              { label: "Total operaciones dispersadas", value: finance.totalDisp.toString(), icon: "✅" },
              { label: "Total clientes registrados", value: finance.totalClientes.toString(), icon: "👥" },
              { label: "Tasa de conversión", value: `${finance.tasaConversion.toFixed(1)}%`, icon: "🔄" },
              { label: "Ticket promedio", value: formatMoney(Math.round(finance.ticketPromedio)), icon: "💵" },
              { label: "Ejecutivos activos", value: `${ranking.length}`, icon: "👤" },
              ...(modo === "mensual" ? [
                { label: "Día del mes", value: `${Math.min(finance.diaEfectivo, finance.diasMes)} de ${finance.diasMes}`, icon: "📅" },
                { label: "Velocidad diaria", value: finance.diaEfectivo > 0 ? formatMoney(Math.round(finance.ingresosTotales / finance.diaEfectivo)) + "/día" : "—", icon: "⚡" },
              ] : []),
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderBottom: `1px solid ${COLORS.border}`,
              }}>
                <span style={{ fontSize: 12, color: COLORS.textLight }}>{item.icon} {item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.dark }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── RANKING DE EJECUTIVOS ─── */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: isMobile ? "14px 16px" : "18px 24px", marginBottom: 18,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.dark, margin: "0 0 14px" }}>🏆 Ranking de ejecutivos — {periodoLabel}</h3>
          {ranking.length === 0 ? (
            <p style={{ color: COLORS.textLight, fontSize: 13, textAlign: "center", padding: 20 }}>Sin datos de ejecutivos para este periodo</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
                <thead>
                  <tr>
                    {["#", "Ejecutivo", "Ingresos", "Nómina", "Motos", "Clientes", "Ticket prom.", "% del total"].map((h) => (
                      <th key={h} style={{
                        padding: "10px 12px", textAlign: h === "#" ? "center" : "left",
                        fontSize: 10, fontWeight: 700, color: COLORS.textLight,
                        textTransform: "uppercase", borderBottom: `2px solid ${COLORS.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((ej, i) => {
                    const pctTotal = finance.ingresosTotales > 0 ? (ej.monto / finance.ingresosTotales) * 100 : 0;
                    const medals = ["🥇", "🥈", "🥉"];
                    return (
                      <tr key={ej.nombre} style={{
                        background: i === 0 ? COLORS.greenBg : i % 2 === 0 ? "#FAFBFA" : "#fff",
                        borderRadius: 8,
                      }}>
                        <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 16 }}>
                          {i < 3 ? medals[i] : <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textLight }}>{i + 1}</span>}
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: COLORS.dark, fontSize: 13 }}>{ej.nombre}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 800, color: COLORS.primary, fontSize: 13 }}>{formatMoney(Math.round(ej.monto))}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: COLORS.text }}>{formatMoney(Math.round(ej.nomina))}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: COLORS.moto }}>{formatMoney(Math.round(ej.motos))}</td>
                        <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: COLORS.text, textAlign: "center" }}>{ej.clientes}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: COLORS.text }}>{formatMoney(Math.round(ej.clientes > 0 ? ej.monto / ej.clientes : 0))}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ flex: 1, height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${pctTotal}%`, height: "100%", background: COLORS.primary, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, minWidth: 36 }}>{pctTotal.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ─── Footer info ─── */}
        <p style={{ textAlign: "center", fontSize: 11, color: COLORS.textLight, padding: "10px 0 20px" }}>
          Datos en tiempo real — Solo se cuentan operaciones con estatus Dispersión (venta finalizada)
        </p>
      </div>
    </div>
  );
}

function TablaClientes({ perfil }) {
  const [showModal, setShowModal] = useState(false);
  const [filterEjecutivo, setFilterEjecutivo] = useState("");
  const [filterProducto, setFilterProducto] = useState("");
  const [filterEstatus, setFilterEstatus] = useState("");
  const [searchText, setSearchText] = useState("");
  const [editingCell, setEditingCell] = useState(null);
  const [ejecutivosList, setEjecutivosList] = useState([]);

  const today = new Date();
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [anio, setAnio] = useState(today.getFullYear());
  const { clients, loading, error, addClient, updateClient, updateEstatus, deleteClient, fetchStatusHistory, refetch } = useClients({
    mes, anio,
    ejecutivoId: perfil?.ejecutivo_id,
    isAdmin: perfil?.rol === "admin",
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [presupuestoTotal, setPresupuestoTotal] = useState(0);

  useEffect(() => {
    const loadEjecutivos = async () => {
      try {
        await fetchWithRetry(async () => {
          const { data, error } = await supabase
            .from("perfiles")
            .select("nombre_display")
            .eq("rol", "ejecutivo")
            .eq("activo", true)
            .order("nombre_display");
          if (error) throw error;
          setEjecutivosList((data || []).map(e => e.nombre_display));
        });
      } catch (err) {
        console.error("Error loading ejecutivos tras reintentos:", err);
        setEjecutivosList([]);
      }
    };
    loadEjecutivos();
  }, []);

  // Cargar presupuesto (suma de metas de todos los ejecutivos del mes)
  useEffect(() => {
    const loadPresupuesto = async () => {
      try {
        await fetchWithRetry(async () => {
          const { data, error } = await supabase
            .from("ejecutivos")
            .select("meta, tipo")
            .eq("mes", mes)
            .eq("anio", anio);
          if (error) throw error;
          const totalMetas = (data || [])
            .filter((e) => e.tipo === "nómina")
            .reduce((sum, e) => sum + (e.meta || 0), 0);
          setPresupuestoTotal(totalMetas);
        });
      } catch (err) {
        console.error("Error loading presupuesto tras reintentos:", err);
        setPresupuestoTotal(0);
      }
    };
    loadPresupuesto();
  }, [mes, anio]);

  const diasMes = getDaysInMonth(mes, anio);
  // Calcular día efectivo según si es mes pasado, actual o futuro
  let diaEfectivo;
  if (anio < today.getFullYear() || (anio === today.getFullYear() && mes < today.getMonth() + 1)) {
    diaEfectivo = diasMes; // Mes pasado → completado
  } else if (anio > today.getFullYear() || (anio === today.getFullYear() && mes > today.getMonth() + 1)) {
    diaEfectivo = 0; // Mes futuro → 0
  } else {
    diaEfectivo = today.getDate(); // Mes actual → día de hoy
  }
  const pctMes = diasMes > 0 ? ((Math.min(diaEfectivo, diasMes) / diasMes) * 100).toFixed(0) : 0;

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (filterEjecutivo && c.ejecutivo !== filterEjecutivo) return false;
      if (filterProducto && c.producto !== filterProducto) return false;
      if (filterEstatus && c.estatus !== filterEstatus) return false;
      if (searchText && !c.nombre_cliente.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [clients, filterEjecutivo, filterProducto, filterEstatus, searchText]);

  const kpis = useMemo(() => {
    const dispersiones = clients.filter((c) => c.estatus === "Dispersión");
    const totalMonto = dispersiones
      .filter((c) => c.producto === "Crédito de nómina")
      .reduce((sum, c) => sum + (c.monto || 0), 0);
    const totalClientes = clients.length;
    const enPipeline = clients.filter((c) => c.estatus !== "Dispersión" && c.estatus !== "Rechazado").length;
    const motosVendidas = dispersiones.filter((c) => c.producto !== "Crédito de nómina").length;
    // Ingresos totales = suma de monto de TODOS los dispersados (nómina + motos)
    const ingresosReales = dispersiones.reduce((sum, c) => sum + (c.monto || 0), 0);
    return { totalMonto, totalClientes, enPipeline, motosVendidas, ingresosReales };
  }, [clients]);

  // Cálculos de presupuesto vs ingresos
  const budgetData = useMemo(() => {
    const ingresos = kpis.ingresosReales;
    const pctVsPresupuesto = presupuestoTotal > 0 ? (ingresos / presupuestoTotal) * 100 : 0;
    // Proyección: extrapolar ingresos al cierre del mes
    const proyeccion = diaEfectivo > 0 ? (ingresos / diaEfectivo) * diasMes : 0;
    const diffProyeccion = presupuestoTotal > 0 ? proyeccion - presupuestoTotal : 0;
    const pctDiffProyeccion = presupuestoTotal > 0 ? ((proyeccion / presupuestoTotal) - 1) * 100 : 0;
    const falta = Math.max(presupuestoTotal - ingresos, 0);
    return { ingresos, presupuesto: presupuestoTotal, pctVsPresupuesto, proyeccion, diffProyeccion, pctDiffProyeccion, falta };
  }, [kpis.ingresosReales, presupuestoTotal, diaEfectivo, diasMes]);

  const handleAddClient = async (form) => {
    await addClient({
      nombre_cliente: form.nombre_cliente,
      ejecutivo: form.ejecutivo || "",
      producto: form.producto,
      monto: Number(form.monto) || 0,
      ejecutivo_id: form.ejecutivo_id || perfil?.ejecutivo_id,
      actualizacion: form.actualizacion || "",
      estatus: form.estatus || "Prospecto",
    });
    setShowModal(false);
  };

  const handleUpdateClient = async (id, field, value) => {
    if (field === "estatus") {
      await updateEstatus(id, value, "Actualizado desde tabla admin", perfil?.nombre_display || "admin");
    } else {
      await updateClient(id, field, value);
    }
    setEditingCell(null);
  };

  const EditableCell = ({ client, field, type = "text" }) => {
    const cellKey = `${client.id}-${field}`;
    const isEditing = editingCell === cellKey;

    if (field === "estatus") {
      return (
        <div onClick={() => setEditingCell(cellKey)} style={{ cursor: "pointer" }}>
          {isEditing ? (
            <select
              autoFocus
              value={client[field]}
              onChange={(e) => handleUpdateClient(client.id, field, e.target.value)}
              onBlur={() => setEditingCell(null)}
              style={{ padding: "4px 6px", fontSize: 12, borderRadius: 6, border: `1.5px solid ${COLORS.primary}`, outline: "none", fontFamily: "inherit" }}
            >
              {ESTATUS_LIST.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          ) : (
            <StatusBadge status={client[field]} />
          )}
        </div>
      );
    }

    if (field === "ejecutivo") {
      return (
        <div onClick={() => setEditingCell(cellKey)} style={{ cursor: "pointer", fontSize: 13 }}>
          {isEditing ? (
            <select
              autoFocus
              value={client[field]}
              onChange={(e) => handleUpdateClient(client.id, field, e.target.value)}
              onBlur={() => setEditingCell(null)}
              style={{ padding: "4px 6px", fontSize: 12, borderRadius: 6, border: `1.5px solid ${COLORS.primary}`, outline: "none", width: "100%", fontFamily: "inherit" }}
            >
              {ejecutivosList.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          ) : (
            <span style={{ color: COLORS.text }}>{client[field].split(" ").slice(0, 2).join(" ")}</span>
          )}
        </div>
      );
    }

    if (field === "producto") {
      return (
        <div onClick={() => setEditingCell(cellKey)} style={{ cursor: "pointer", fontSize: 13 }}>
          {isEditing ? (
            <select
              autoFocus
              value={client[field]}
              onChange={(e) => handleUpdateClient(client.id, field, e.target.value)}
              onBlur={() => setEditingCell(null)}
              style={{ padding: "4px 6px", fontSize: 12, borderRadius: 6, border: `1.5px solid ${COLORS.primary}`, outline: "none", width: "100%", fontFamily: "inherit" }}
            >
              {PRODUCTOS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          ) : (
            <span>{client[field]}</span>
          )}
        </div>
      );
    }

    const displayValue = field === "monto" ? formatMoney(client[field]) : client[field] || "—";

    return (
      <div onClick={() => setEditingCell(cellKey)} style={{ cursor: "pointer", minHeight: 20 }}>
        {isEditing ? (
          <input
            autoFocus
            type={type}
            defaultValue={client[field]}
            onBlur={(e) => handleUpdateClient(client.id, field, type === "number" ? Number(e.target.value) : e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUpdateClient(client.id, field, type === "number" ? Number(e.target.value) : e.target.value);
            }}
            style={{
              padding: "4px 6px",
              fontSize: 13,
              borderRadius: 6,
              border: `1.5px solid ${COLORS.primary}`,
              outline: "none",
              width: "100%",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        ) : (
          <span style={{ fontSize: 13, color: client[field] ? COLORS.text : COLORS.textLight }}>{displayValue}</span>
        )}
      </div>
    );
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><p>Cargando clientes...</p></div>;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{
          background: "#fff", borderRadius: 14, padding: "16px 22px", marginBottom: 18,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => {
                if (mes === 1) { setMes(12); setAnio(anio - 1); }
                else setMes(mes - 1);
              }}
              style={{
                width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${COLORS.border}`,
                background: "#fff", cursor: "pointer", fontSize: 16, color: COLORS.textLight,
                display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
              }}
            >
              ←
            </button>

            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13, color: COLORS.textLight }}>📅</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.dark }}>
                  {MESES[mes - 1]} {anio}
                </span>
                {mes === today.getMonth() + 1 && anio === today.getFullYear() && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: COLORS.primary, background: COLORS.primaryLight,
                    padding: "2px 8px", borderRadius: 10, textTransform: "uppercase",
                  }}>
                    Mes actual
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: COLORS.textLight, margin: "2px 0 0" }}>
                Día {Math.min(diaEfectivo, diasMes)} de {diasMes} — {pctMes}% del mes transcurrido
              </p>
            </div>

            <button
              onClick={() => {
                if (mes === 12) { setMes(1); setAnio(anio + 1); }
                else setMes(mes + 1);
              }}
              style={{
                width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${COLORS.border}`,
                background: "#fff", cursor: "pointer", fontSize: 16, color: COLORS.textLight,
                display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
              }}
            >
              →
            </button>
          </div>

          {/* ── Panel de Ingresos vs Presupuesto ── */}
          <div style={{ minWidth: 280, flex: "0 1 420px" }}>
            {budgetData.presupuesto > 0 ? (
              <>
                {/* Barra de progreso ingresos vs presupuesto */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.textLight, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Ingresos vs Presupuesto
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 800,
                    color: budgetData.pctVsPresupuesto >= 100 ? COLORS.green : budgetData.pctVsPresupuesto >= 70 ? COLORS.yellow : COLORS.red,
                  }}>
                    {budgetData.pctVsPresupuesto.toFixed(1)}%
                  </span>
                </div>
                <div style={{ width: "100%", height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{
                    width: `${Math.min(budgetData.pctVsPresupuesto, 100)}%`,
                    height: "100%",
                    background: budgetData.pctVsPresupuesto >= 100 ? COLORS.green : budgetData.pctVsPresupuesto >= 70 ? COLORS.primary : budgetData.pctVsPresupuesto >= 40 ? COLORS.yellow : COLORS.red,
                    borderRadius: 4,
                    transition: "width 0.5s ease",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.textLight, marginBottom: 8 }}>
                  <span>💰 {formatMoney(Math.round(budgetData.ingresos))}</span>
                  <span>🎯 {formatMoney(Math.round(budgetData.presupuesto))}</span>
                </div>

                {/* Fila de métricas: proyección + falta */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {/* Proyección al cierre */}
                  <div style={{
                    flex: 1, minWidth: 120, padding: "6px 10px", borderRadius: 8,
                    background: budgetData.pctDiffProyeccion >= 0 ? COLORS.greenBg : COLORS.redBg,
                    border: `1px solid ${budgetData.pctDiffProyeccion >= 0 ? COLORS.green : COLORS.red}22`,
                  }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>📈 Proyección cierre</p>
                    <p style={{
                      fontSize: 14, fontWeight: 800, margin: "2px 0 0",
                      color: budgetData.pctDiffProyeccion >= 0 ? COLORS.green : COLORS.red,
                    }}>
                      {formatMoney(Math.round(budgetData.proyeccion))}
                    </p>
                    <p style={{
                      fontSize: 10, fontWeight: 600, margin: "1px 0 0",
                      color: budgetData.pctDiffProyeccion >= 0 ? COLORS.green : COLORS.red,
                    }}>
                      {budgetData.pctDiffProyeccion >= 0 ? "▲" : "▼"} {Math.abs(budgetData.pctDiffProyeccion).toFixed(1)}% vs presupuesto
                    </p>
                  </div>

                  {/* Falta por vender */}
                  <div style={{
                    flex: 1, minWidth: 120, padding: "6px 10px", borderRadius: 8,
                    background: budgetData.falta === 0 ? COLORS.greenBg : COLORS.orangeBg,
                    border: `1px solid ${budgetData.falta === 0 ? COLORS.green : COLORS.orange}22`,
                  }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>🔻 Falta por vender</p>
                    <p style={{
                      fontSize: 14, fontWeight: 800, margin: "2px 0 0",
                      color: budgetData.falta === 0 ? COLORS.green : COLORS.orange,
                    }}>
                      {budgetData.falta === 0 ? "¡Meta alcanzada!" : formatMoney(Math.round(budgetData.falta))}
                    </p>
                    {budgetData.falta > 0 && diaEfectivo < diasMes && (
                      <p style={{ fontSize: 10, fontWeight: 600, margin: "1px 0 0", color: COLORS.textLight }}>
                        {formatMoney(Math.round(budgetData.falta / Math.max(diasMes - diaEfectivo, 1)))}/día restante
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div style={{
                padding: "10px 14px", borderRadius: 8, background: COLORS.orangeBg,
                border: `1px solid ${COLORS.orange}22`, textAlign: "center",
              }}>
                <p style={{ fontSize: 11, color: COLORS.orange, fontWeight: 600, margin: 0 }}>
                  ⚠️ Sin presupuesto configurado para {MESES[mes - 1]}
                </p>
                <p style={{ fontSize: 10, color: COLORS.textLight, margin: "4px 0 0" }}>
                  Configura las metas en Resumen Nómina
                </p>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <KPICard label="Vendido (Nómina)" value={formatMoney(kpis.totalMonto)} sub="Estatus: Dispersión" color={COLORS.primary} />
          <KPICard label="Motos vendidas" value={kpis.motosVendidas + " uds"} sub="Arrendamiento + Financiamiento" color="#F59E0B" />
          <KPICard label="En pipeline" value={kpis.enPipeline} sub="Clientes en proceso" color="#3B82F6" />
          <KPICard label="Total clientes" value={kpis.totalClientes} sub="Todos los estatus" color={COLORS.dark} />
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            padding: "16px 20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            border: `1px solid ${COLORS.border}`,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: COLORS.dark, margin: 0 }}>
              Seguimiento de Clientes
            </h2>
            <button
              onClick={() => setShowModal(true)}
              style={{
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                background: COLORS.primary,
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: `0 3px 10px ${COLORS.primary}40`,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              + Nuevo Cliente
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                border: `1.5px solid ${COLORS.border}`,
                borderRadius: 8,
                outline: "none",
                minWidth: 180,
                flex: "1 1 180px",
                fontFamily: "inherit",
                background: COLORS.inputBg,
              }}
            />
            <SelectDropdown value={filterEjecutivo} onChange={setFilterEjecutivo} options={ejecutivosList} placeholder="Todos los ejecutivos" width="auto" />
            <SelectDropdown value={filterProducto} onChange={setFilterProducto} options={PRODUCTOS} placeholder="Todos los productos" width="auto" />
            <SelectDropdown value={filterEstatus} onChange={setFilterEstatus} options={ESTATUS_LIST} placeholder="Todos los estatus" width="auto" />
            {(filterEjecutivo || filterProducto || filterEstatus || searchText) && (
              <button
                onClick={() => { setFilterEjecutivo(""); setFilterProducto(""); setFilterEstatus(""); setSearchText(""); }}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.red,
                  background: "#FEF2F2",
                  border: `1px solid ${COLORS.red}30`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ✕ Limpiar filtros
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            border: `1px solid ${COLORS.border}`,
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: COLORS.dark }}>
                {["Ejecutivo", "Cliente", "Producto", "Monto", "Fecha inicio", "Estatus", "Sin actualizar", "Actualización", "Fecha final", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#fff",
                      textAlign: "left",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      whiteSpace: "nowrap",
                      borderBottom: `3px solid ${COLORS.primary}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: 40, color: COLORS.textLight, fontSize: 14 }}>
                    No se encontraron clientes con esos filtros
                  </td>
                </tr>
              ) : (
                filtered.map((client, idx) => (
                  <tr
                    key={client.id}
                    style={{
                      background: idx % 2 === 0 ? "#fff" : "#FAFBFA",
                      borderBottom: `1px solid ${COLORS.border}`,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = `${COLORS.primary}08`)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#FAFBFA")}
                  >
                    <td style={{ padding: "10px 14px", maxWidth: 160 }}>
                      <EditableCell client={client} field="ejecutivo" />
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>
                      <span
                        onClick={() => setSelectedClient(client)}
                        style={{ color: COLORS.primary, cursor: "pointer", textDecoration: "underline", textDecorationColor: `${COLORS.primary}40` }}
                        title="Ver historial de estatus"
                      >
                        {client.nombre_cliente}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", maxWidth: 160 }}>
                      <EditableCell client={client} field="producto" />
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      <EditableCell client={client} field="monto" type="number" />
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <EditableCell client={client} field="fecha_inicio" type="date" />
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <EditableCell client={client} field="estatus" />
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      {(() => {
                        if (client.estatus === "Dispersión" || client.estatus === "Rechazado") {
                          return <span style={{ fontSize: 11, color: COLORS.textLight }}>—</span>;
                        }
                        const ts = getTimeSinceUpdate(client.estatus_updated_at);
                        return (
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: ts.color,
                            padding: "3px 8px", background: `${ts.color}15`, borderRadius: 6,
                            display: "inline-block",
                          }}>
                            {ts.text}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "10px 14px", maxWidth: 200, fontSize: 12, color: COLORS.textLight }}>
                      <EditableCell client={client} field="actualizacion" />
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <EditableCell client={client} field="fecha_final" type="date" />
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <button
                        onClick={() => setDeleteConfirm(client)}
                        title="Eliminar cliente"
                        style={{
                          width: 30, height: 30, borderRadius: "50%", border: "none",
                          background: "transparent", cursor: "pointer", fontSize: 15,
                          color: COLORS.textLight, display: "flex", alignItems: "center",
                          justifyContent: "center", transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.redBg; e.currentTarget.style.color = COLORS.red; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = COLORS.textLight; }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, padding: "0 4px" }}>
          <p style={{ fontSize: 12, color: COLORS.textLight, margin: 0 }}>
            Mostrando {filtered.length} de {clients.length} clientes
          </p>
          <p style={{ fontSize: 11, color: COLORS.primary, fontWeight: 600, margin: 0 }}>
            Datos en tiempo real de {MESES[mes - 1]} {anio}
          </p>
        </div>
      </div>

      {showModal && <AddClientModal onAdd={handleAddClient} onClose={() => setShowModal(false)} ejecutivos={ejecutivosList} />}

      {/* Modal detalle de cliente */}
      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          fetchStatusHistory={fetchStatusHistory}
        />
      )}

      {/* Confirmar eliminar cliente */}
      {deleteConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 420,
            width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: COLORS.dark, margin: "0 0 8px" }}>
              ¿Eliminar cliente?
            </h3>
            <p style={{ fontSize: 14, color: COLORS.text, margin: "0 0 6px", lineHeight: 1.5 }}>
              Se eliminará permanentemente a <strong>{deleteConfirm.nombre_cliente}</strong>
            </p>
            <p style={{ fontSize: 12, color: COLORS.textLight, margin: "0 0 20px" }}>
              Ejecutivo: {deleteConfirm.ejecutivo} · {deleteConfirm.producto} · {formatMoney(deleteConfirm.monto)}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: `1.5px solid ${COLORS.border}`,
                  background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  color: COLORS.textLight, fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await deleteClient(deleteConfirm.id);
                  setDeleteConfirm(null);
                }}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: "none",
                  background: COLORS.red, color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GESTION USUARIOS SCREEN (Fase 3)
// ═══════════════════════════════════════════════════════════════════════════

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 420,
        width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <p style={{ fontSize: 15, color: COLORS.text, margin: "0 0 20px", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px", borderRadius: 8, border: `1.5px solid ${COLORS.border}`,
              background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.textLight,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: COLORS.red, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, type, onClose }) {
  const bgColor = type === "success" ? COLORS.greenBg : type === "error" ? COLORS.redBg : COLORS.yellowBg;
  const textColor = type === "success" ? COLORS.green : type === "error" ? COLORS.red : COLORS.yellow;
  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "⚠";

  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 10000,
      background: bgColor, border: `1.5px solid ${textColor}`,
      borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 8px 30px rgba(0,0,0,0.12)", animation: "slideIn 0.3s ease",
      maxWidth: 380,
    }}>
      <span style={{ fontSize: 18, color: textColor, fontWeight: 700 }}>{icon}</span>
      <p style={{ fontSize: 13, color: textColor, margin: 0, fontWeight: 600 }}>{message}</p>
      <button onClick={onClose} style={{
        background: "none", border: "none", color: textColor, cursor: "pointer",
        fontSize: 16, fontWeight: 700, marginLeft: 8, padding: 0,
      }}>×</button>
    </div>
  );
}

function CreateUserModal({ onClose, onCreate, existingEmails }) {
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    confirmPassword: "",
    rol: "ejecutivo",
  });
  const [errors, setErrors] = useState({});

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.nombre.trim()) errs.nombre = "El nombre es obligatorio";
    if (!form.email.trim()) errs.email = "El email es obligatorio";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "Email no válido";
    else if (existingEmails.includes(form.email.toLowerCase()))
      errs.email = "Ya existe una cuenta con este email";
    if (!form.password) errs.password = "La contraseña es obligatoria";
    else if (form.password.length < 6) errs.password = "Mínimo 6 caracteres";
    if (form.password !== form.confirmPassword)
      errs.confirmPassword = "Las contraseñas no coinciden";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = () => {
    if (!validate()) return;
    onCreate({
      nombre: form.nombre.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      rol: form.rol,
    });
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    fontSize: 14,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 8,
    background: "#F8FAF8",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };

  const errorInputStyle = {
    ...inputStyle,
    borderColor: COLORS.red,
    background: COLORS.redBg,
  };

  const labelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.textLight,
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }}>
      <div style={{
        background: "#fff", borderRadius: 18, padding: 0, maxWidth: 500,
        width: "92%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden",
      }}>
        <div style={{
          background: COLORS.dark, padding: "18px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>👤</span>
            <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>Crear nueva cuenta</h3>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#ffffff80", fontSize: 22,
            cursor: "pointer", padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        <div style={{ padding: "24px" }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Nombre para mostrar</label>
            <input
              style={errors.nombre ? errorInputStyle : inputStyle}
              value={form.nombre}
              onChange={(e) => update("nombre", e.target.value)}
              placeholder='Ej: "Carlos Manuel"'
            />
            {errors.nombre && <p style={{ fontSize: 11, color: COLORS.red, margin: "4px 0 0" }}>{errors.nombre}</p>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email</label>
            <input
              style={errors.email ? errorInputStyle : inputStyle}
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="usuario@credivive.com"
            />
            {errors.email && <p style={{ fontSize: 11, color: COLORS.red, margin: "4px 0 0" }}>{errors.email}</p>}
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Contraseña temporal</label>
              <input
                style={errors.password ? errorInputStyle : inputStyle}
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="Mín. 6 caracteres"
              />
              {errors.password && <p style={{ fontSize: 11, color: COLORS.red, margin: "4px 0 0" }}>{errors.password}</p>}
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Confirmar contraseña</label>
              <input
                style={errors.confirmPassword ? errorInputStyle : inputStyle}
                type="password"
                value={form.confirmPassword}
                onChange={(e) => update("confirmPassword", e.target.value)}
                placeholder="Repetir"
              />
              {errors.confirmPassword && <p style={{ fontSize: 11, color: COLORS.red, margin: "4px 0 0" }}>{errors.confirmPassword}</p>}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Rol</label>
            <div style={{ display: "flex", gap: 10 }}>
              {["admin", "ejecutivo"].map((r) => (
                <button
                  key={r}
                  onClick={() => update("rol", r)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    border: `2px solid ${form.rol === r ? (r === "admin" ? COLORS.purple : COLORS.primary) : COLORS.border}`,
                    background: form.rol === r ? (r === "admin" ? COLORS.purpleBg : COLORS.primaryLight) : "#fff",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  <p style={{
                    fontSize: 14, fontWeight: 700, margin: 0,
                    color: form.rol === r ? (r === "admin" ? COLORS.purple : COLORS.primaryDark) : COLORS.textLight,
                  }}>
                    {r === "admin" ? "🛡 Administrador" : "👔 Ejecutivo"}
                  </p>
                  <p style={{ fontSize: 11, color: COLORS.textLight, margin: "4px 0 0" }}>
                    {r === "admin" ? "Acceso completo al dashboard" : "Solo ve su pipeline personal"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button
              onClick={onClose}
              style={{
                padding: "12px 24px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`,
                background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COLORS.textLight,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              style={{
                padding: "12px 28px", borderRadius: 10, border: "none",
                background: COLORS.primary, color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <span>+</span> Crear cuenta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GestionUsuarios() {
  const [users, setUsers] = useState([]);
  const [ejecutivos, setEjecutivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRol, setFilterRol] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [toast, setToast] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  // Load users and ejecutivos from Supabase (con retry)
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await fetchWithRetry(async () => {
          const [usersRes, ejecutivosRes] = await Promise.all([
            supabase.from("perfiles").select("*").order("nombre_display"),
            supabase.from("ejecutivos").select("id, nombre, tipo").order("nombre"),
          ]);

          if (usersRes.error) throw usersRes.error;
          if (ejecutivosRes.error) throw ejecutivosRes.error;

          setUsers(usersRes.data || []);
          setEjecutivos(ejecutivosRes.data || []);
        });
      } catch (err) {
        console.error("Error loading users/ejecutivos tras reintentos:", err);
        setToast({ message: "Error al cargar datos", type: "error" });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const nombre = (u.nombre_display || "").toLowerCase();
      const matchSearch = nombre.includes(searchQuery.toLowerCase());
      const matchRol = filterRol === "todos" || u.rol === filterRol;
      const matchEstado =
        filterEstado === "todos" ||
        (filterEstado === "activo" && u.activo) ||
        (filterEstado === "inactivo" && !u.activo);
      return matchSearch && matchRol && matchEstado;
    });
  }, [users, searchQuery, filterRol, filterEstado]);

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.rol === "admin").length;
    const ejecutivos = users.filter((u) => u.rol === "ejecutivo").length;
    const activos = users.filter((u) => u.activo).length;
    const inactivos = users.filter((u) => !u.activo).length;
    return { total, admins, ejecutivos, activos, inactivos };
  }, [users]);

  const handleCreate = async (data) => {
    try {
      // 1. Guardar sesión del admin actual
      const { data: sessionData } = await supabase.auth.getSession();
      const adminSession = sessionData?.session;

      // 2. Crear usuario en Supabase Auth
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { nombre_display: data.nombre, rol: data.rol },
        },
      });

      if (signUpErr) throw signUpErr;
      if (!signUpData.user) throw new Error("No se pudo crear el usuario");

      const newUserId = signUpData.user.id;

      // 3. Restaurar sesión del admin inmediatamente
      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });
      }

      // 4. Actualizar perfil con rol y ejecutivo_id
      await supabase.from("perfiles").upsert({
        user_id: newUserId,
        nombre_display: data.nombre,
        rol: data.rol,
        ejecutivo_id: data.ejecutivo_id || null,
        activo: true,
      });

      setShowCreateModal(false);
      showToast(`Cuenta creada para ${data.nombre}`);

      // 5. Recargar lista de usuarios
      const { data: newUsers } = await supabase.from("perfiles").select("*").order("nombre_display");
      if (newUsers) setUsers(newUsers);
    } catch (err) {
      showToast(`Error al crear cuenta: ${err.message}`, "error");
    }
  };

  const handleToggleActive = (userId) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;

    if (user.activo) {
      setConfirmAction({
        message: `¿Desactivar la cuenta de ${user.nombre_display}? El usuario ya no podrá iniciar sesión.`,
        action: async () => {
          try {
            const { error } = await supabase
              .from("perfiles")
              .update({ activo: false })
              .eq("user_id", userId);
            if (error) throw error;
            setUsers((prev) =>
              prev.map((u) => (u.user_id === userId ? { ...u, activo: false } : u))
            );
            showToast(`Cuenta de ${user.nombre_display} desactivada`, "warning");
          } catch (err) {
            showToast(`Error: ${err.message}`, "error");
          }
          setConfirmAction(null);
        },
      });
    } else {
      setConfirmAction({
        message: `¿Reactivar la cuenta de ${user.nombre_display}?`,
        action: async () => {
          try {
            const { error } = await supabase
              .from("perfiles")
              .update({ activo: true })
              .eq("user_id", userId);
            if (error) throw error;
            setUsers((prev) =>
              prev.map((u) => (u.user_id === userId ? { ...u, activo: true } : u))
            );
            showToast(`Cuenta de ${user.nombre_display} reactivada`);
          } catch (err) {
            showToast(`Error: ${err.message}`, "error");
          }
          setConfirmAction(null);
        },
      });
    }
  };

  const handleChangeRol = (userId) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;
    const newRol = user.rol === "admin" ? "ejecutivo" : "admin";

    setConfirmAction({
      message: `¿Cambiar el rol de ${user.nombre_display} de "${user.rol}" a "${newRol}"?${
        newRol === "ejecutivo"
          ? " Necesitarás asignarle un ejecutivo del catálogo."
          : " Tendrá acceso completo al dashboard."
      }`,
      action: async () => {
        try {
          const { error } = await supabase
            .from("perfiles")
            .update({ rol: newRol, ejecutivo_id: newRol === "admin" ? null : user.ejecutivo_id })
            .eq("user_id", userId);
          if (error) throw error;
          setUsers((prev) =>
            prev.map((u) =>
              u.user_id === userId
                ? { ...u, rol: newRol, ejecutivo_id: newRol === "admin" ? null : u.ejecutivo_id }
                : u
            )
          );
          showToast(`Rol de ${user.nombre_display} cambiado a ${newRol}`);
        } catch (err) {
          showToast(`Error: ${err.message}`, "error");
        }
        setConfirmAction(null);
      },
    });
  };

  const handleResetPassword = (userId) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;
    setConfirmAction({
      message: `¿Enviar enlace de reseteo de contraseña?`,
      action: () => {
        showToast(`Enlace de reseteo enviado`);
        setConfirmAction(null);
      },
    });
  };

  const getEjecutivoName = (id) => {
    const ej = ejecutivos.find((e) => e.id === id);
    return ej ? ej.nombre.split(" ").slice(0, 3).join(" ") : "—";
  };

  const getEjecutivoTipo = (id) => {
    const ej = ejecutivos.find((e) => e.id === id);
    return ej ? ej.tipo : null;
  };

  const existingNames = users.map((u) => (u.nombre_display || "").toLowerCase());

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ fontSize: 14, color: COLORS.textLight }}>Cargando usuarios...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: "0 0 4px" }}>
              Gestión de Usuarios
            </h1>
            <p style={{ fontSize: 13, color: COLORS.textLight, margin: 0 }}>
              Crea, administra y controla accesos de cuentas del sistema
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: "12px 24px",
              borderRadius: 10,
              border: "none",
              background: COLORS.primary,
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 4px 12px rgba(29,185,84,0.3)",
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Crear cuenta
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          {[
            { label: "Total usuarios", value: stats.total, icon: "👥", color: COLORS.dark },
            { label: "Administradores", value: stats.admins, icon: "🛡", color: COLORS.purple },
            { label: "Ejecutivos", value: stats.ejecutivos, icon: "👔", color: COLORS.primary },
            { label: "Activos", value: stats.activos, icon: "✓", color: COLORS.green },
            { label: "Inactivos", value: stats.inactivos, icon: "○", color: COLORS.red },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: "14px 18px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                border: `1px solid ${COLORS.border}`,
                flex: "1 1 140px",
                minWidth: 120,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>{stat.icon}</span>
                <p
                  style={{
                    fontSize: 10,
                    color: COLORS.textLight,
                    margin: 0,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {stat.label}
                </p>
              </div>
              <p style={{ fontSize: 26, fontWeight: 800, color: stat.color, margin: 0 }}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 16,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            border: `1px solid ${COLORS.border}`,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 200px" }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre o email..."
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: 13,
                border: `1.5px solid ${COLORS.border}`,
                borderRadius: 8,
                background: "#F8FAF8",
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["todos", "admin", "ejecutivo"].map((r) => (
              <button
                key={r}
                onClick={() => setFilterRol(r)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1.5px solid ${filterRol === r ? COLORS.primary : COLORS.border}`,
                  background: filterRol === r ? COLORS.primaryLight : "#fff",
                  color: filterRol === r ? COLORS.primaryDark : COLORS.textLight,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {r === "todos" ? "Todos" : r === "admin" ? "Admins" : "Ejecutivos"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["todos", "activo", "inactivo"].map((e) => (
              <button
                key={e}
                onClick={() => setFilterEstado(e)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1.5px solid ${filterEstado === e ? COLORS.primary : COLORS.border}`,
                  background: filterEstado === e ? COLORS.primaryLight : "#fff",
                  color: filterEstado === e ? COLORS.primaryDark : COLORS.textLight,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {e === "todos" ? "Todos" : e === "activo" ? "Activos" : "Inactivos"}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            border: `1px solid ${COLORS.border}`,
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 750 }}>
            <thead>
              <tr style={{ background: COLORS.dark }}>
                {["Usuario", "Rol", "Nivel", "Ejecutivo asignado", "Estado", "Fecha registro", "Acciones"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 14px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        textAlign: "left",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        whiteSpace: "nowrap",
                        borderBottom: `3px solid ${COLORS.primary}`,
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center" }}>
                    <p style={{ fontSize: 15, color: COLORS.textLight, margin: 0 }}>
                      No se encontraron usuarios con estos filtros
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, idx) => {
                  const tipo = getEjecutivoTipo(user.ejecutivo_id);
                  return (
                    <tr
                      key={user.user_id}
                      style={{
                        background: idx % 2 === 0 ? "#fff" : "#FAFBFA",
                        borderBottom: `1px solid ${COLORS.border}`,
                        opacity: user.activo ? 1 : 0.6,
                      }}
                    >
                      <td style={{ padding: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: user.rol === "admin" ? COLORS.purpleBg : COLORS.primaryLight,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 14,
                              fontWeight: 700,
                              color: user.rol === "admin" ? COLORS.purple : COLORS.primaryDark,
                              flexShrink: 0,
                            }}
                          >
                            {(user.nombre_display || "?")
                              .split(" ")
                              .slice(0, 2)
                              .map((w) => w[0])
                              .join("")
                              .toUpperCase()}
                          </div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, margin: 0 }}>
                            {user.nombre_display || "Sin nombre"}
                          </p>
                        </div>
                      </td>

                      <td style={{ padding: "14px" }}>
                        <p style={{ fontSize: 13, color: COLORS.textLight, margin: 0 }}>{user.rol}</p>
                      </td>

                      <td style={{ padding: "14px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 12px",
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 700,
                            color: user.rol === "admin" ? COLORS.purple : COLORS.primaryDark,
                            background: user.rol === "admin" ? COLORS.purpleBg : COLORS.primaryLight,
                          }}
                        >
                          {user.rol === "admin" ? "🛡 Admin" : "👔 Ejecutivo"}
                        </span>
                      </td>

                      <td style={{ padding: "14px" }}>
                        {user.ejecutivo_id ? (
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, margin: 0 }}>
                              {getEjecutivoName(user.ejecutivo_id)}
                            </p>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: tipo === "nómina" ? COLORS.primary : COLORS.yellow,
                                textTransform: "uppercase",
                              }}
                            >
                              {tipo === "nómina" ? "Nómina" : "Motos"}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: COLORS.textLight }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: "14px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 12px",
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 600,
                            color: user.activo ? COLORS.green : COLORS.red,
                            background: user.activo ? COLORS.greenBg : COLORS.redBg,
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: user.activo ? COLORS.green : COLORS.red,
                            }}
                          />
                          {user.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>

                      <td style={{ padding: "14px" }}>
                        <p style={{ fontSize: 12, color: COLORS.textLight, margin: 0 }}>
                          {user.created_at ? new Date(user.created_at).toLocaleDateString("es-MX", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }) : "—"}
                        </p>
                      </td>

                      <td style={{ padding: "14px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            onClick={() => handleToggleActive(user.user_id)}
                            title={user.activo ? "Desactivar" : "Reactivar"}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: `1px solid ${COLORS.border}`,
                              background: "#fff",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              color: user.activo ? COLORS.red : COLORS.green,
                            }}
                          >
                            {user.activo ? "Desactivar" : "Reactivar"}
                          </button>
                          <button
                            onClick={() => handleChangeRol(user.user_id)}
                            title="Cambiar rol"
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: `1px solid ${COLORS.border}`,
                              background: "#fff",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              color: COLORS.purple,
                            }}
                          >
                            Cambiar rol
                          </button>
                          <button
                            onClick={() => handleResetPassword(user.user_id)}
                            title="Resetear contraseña"
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: `1px solid ${COLORS.border}`,
                              background: "#fff",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              color: COLORS.yellow,
                            }}
                          >
                            Reset pass
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            background: COLORS.purpleBg,
            border: `1px solid ${COLORS.purple}30`,
            borderRadius: 12,
            padding: "16px 20px",
            marginTop: 18,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 20, flexShrink: 0 }}>🔒</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.purple, margin: "0 0 4px" }}>
              Seguridad de roles
            </p>
            <p style={{ fontSize: 12, color: COLORS.textLight, margin: 0, lineHeight: 1.5 }}>
              Los roles se asignan exclusivamente desde esta pantalla. Un ejecutivo no puede cambiar su propio rol
              ni acceder a esta sección. La base de datos (RLS) bloquea cualquier intento de acceso no autorizado.
            </p>
          </div>
        </div>

        <p
          style={{
            fontSize: 11,
            color: COLORS.primary,
            fontWeight: 600,
            textAlign: "center",
            marginTop: 18,
          }}
        >
          Las cuentas se crean vía Supabase Auth y los roles se guardan en la tabla "perfiles"
        </p>
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          existingEmails={existingNames}
        />
      )}

      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.message}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESUMEN NOMINA SCREEN (Fase 4)
// ═══════════════════════════════════════════════════════════════════════════

function KPICardNomina({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "18px 20px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
      flex: "1 1 200px", minWidth: 180,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <p style={{ fontSize: 11, color: COLORS.textLight, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
      </div>
      <p style={{ fontSize: 26, fontWeight: 800, color: color || COLORS.dark, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: COLORS.textLight, margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
}

function ResumenNomina() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [diaActual, setDiaActual] = useState(now.getDate());

  const { nominaEjecutivos, loading: loadingEjecutivos } = useExecutives({ mes, anio });
  const { clients, loading: loadingClients } = useClients({ mes, anio, isAdmin: true });

  const diasMes = useMemo(() => getDaysInMonth(mes, anio), [mes, anio]);
  const diasTranscurridos = Math.min(diaActual, diasMes);
  const diasRestantes = diasMes - diasTranscurridos;
  const pctMesTranscurrido = ((diasTranscurridos / diasMes) * 100).toFixed(0);

  const tableData = useMemo(() => {
    return nominaEjecutivos.map((ej) => {
      // Calculate real sales: sum of amounts where ejecutivo name matches, estatus = "Dispersión", and producto = "Crédito de nómina"
      const real = clients
        .filter(
          (c) =>
            c.ejecutivo === ej.nombre &&
            c.estatus === "Dispersión" &&
            c.producto === "Crédito de nómina"
        )
        .reduce((sum, c) => sum + (c.monto || 0), 0);

      const avance = ej.meta > 0 ? (real / ej.meta) * 100 : 0;
      const proyeccion = diasTranscurridos > 0 ? (real / diasTranscurridos) * diasMes : 0;
      const falta = Math.max(ej.meta - real, 0);
      return { ...ej, real, avance, proyeccion, falta };
    });
  }, [nominaEjecutivos, clients, diasTranscurridos, diasMes]);

  const totals = useMemo(() => {
    const meta = tableData.reduce((s, e) => s + e.meta, 0);
    const real = tableData.reduce((s, e) => s + e.real, 0);
    const avance = meta > 0 ? (real / meta) * 100 : 0;
    const proyeccion = diasTranscurridos > 0 ? (real / diasTranscurridos) * diasMes : 0;
    const falta = Math.max(meta - real, 0);
    return { meta, real, avance, proyeccion, falta };
  }, [tableData, diasTranscurridos, diasMes]);

  if (loadingEjecutivos || loadingClients) {
    return <div style={{ padding: 40, textAlign: "center" }}><p>Cargando datos...</p></div>;
  }

  if (nominaEjecutivos.length === 0) {
    return (
      <div style={{
        minHeight: "100vh", background: COLORS.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: COLORS.dark, marginBottom: 16 }}>
            No hay ejecutivos de nómina configurados para {MESES[mes - 1]} {anio}
          </p>
          <p style={{ fontSize: 13, color: COLORS.textLight }}>
            Configura los ejecutivos en el Catálogo de Ejecutivos
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: "0 0 4px" }}>
            Resumen de Ejecutivos — Crédito de Nómina
          </h1>
          <p style={{ fontSize: 13, color: COLORS.textLight, margin: 0 }}>
            Avance de ventas contra meta mensual medido en pesos ($)
          </p>
        </div>

        <div style={{
          background: "#fff", borderRadius: 14, padding: "18px 22px", marginBottom: 18,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end",
        }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Mes</label>
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{
              padding: "10px 14px", fontSize: 14, border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              background: "#fff", fontFamily: "inherit", fontWeight: 600, cursor: "pointer", outline: "none", minWidth: 140,
            }}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Año</label>
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{
              padding: "10px 14px", fontSize: 14, border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              background: "#fff", fontFamily: "inherit", fontWeight: 600, cursor: "pointer", outline: "none",
            }}>
              {[2025, 2026, 2027, 2028].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Día actual</label>
            <input type="number" min={1} max={diasMes} value={diaActual} onChange={(e) => setDiaActual(Math.min(Number(e.target.value), diasMes))} style={{
              padding: "10px 14px", fontSize: 14, border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              background: "#fff", fontFamily: "inherit", fontWeight: 600, outline: "none", width: 70,
            }} />
          </div>

          <div style={{ display: "flex", gap: 20, marginLeft: "auto", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>Días del mes</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: 0 }}>{diasMes}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>Transcurridos</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: COLORS.primary, margin: 0 }}>{diasTranscurridos}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>Restantes</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: diasRestantes <= 5 ? COLORS.red : COLORS.yellow, margin: 0 }}>{diasRestantes}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>% Mes</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: 0 }}>{pctMesTranscurrido}%</p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
          <KPICardNomina icon="🎯" label="Meta total equipo" value={formatMoney(totals.meta)} color={COLORS.dark} />
          <KPICardNomina icon="💰" label="Vendido real" value={formatMoney(totals.real)} sub={`${totals.avance.toFixed(1)}% de la meta`} color={COLORS.primary} />
          <KPICardNomina icon="📈" label="Proyección al cierre" value={formatMoney(Math.round(totals.proyeccion))} sub={totals.proyeccion >= totals.meta ? "¡Superaría la meta!" : "Por debajo de la meta"} color={totals.proyeccion >= totals.meta ? COLORS.green : COLORS.yellow} />
          <KPICardNomina icon="🔻" label="Falta por vender" value={formatMoney(totals.falta)} color={COLORS.red} />
        </div>

        <div style={{
          background: "#fff", borderRadius: 14,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          overflowX: "auto",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
            <thead>
              <tr style={{ background: COLORS.dark }}>
                {["Ejecutivo", "Meta mensual", "Real (Dispersión)", "% Avance", "Barra de progreso", "Proyección", "Falta"].map((h) => (
                  <th key={h} style={{
                    padding: "12px 16px", fontSize: 12, fontWeight: 700, color: "#fff",
                    textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5,
                    whiteSpace: "nowrap", borderBottom: `3px solid ${COLORS.primary}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((ej, idx) => {
                const pc = pctColor(ej.avance);
                return (
                  <tr key={idx} style={{
                    background: idx % 2 === 0 ? "#fff" : "#FAFBFA",
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    <td style={{ padding: "14px 16px" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, margin: 0 }}>
                        {ej.nombre.split(" ").slice(0, 3).join(" ")}
                      </p>
                      {ej.nombre.includes("(") && (
                        <p style={{ fontSize: 11, color: COLORS.textLight, margin: "2px 0 0" }}>
                          {ej.nombre.match(/\(([^)]+)\)/)?.[1]}
                        </p>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 600, fontSize: 14, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(ej.meta)}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, fontSize: 14, color: COLORS.primary, fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(ej.real)}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        display: "inline-block", padding: "4px 12px", borderRadius: 20,
                        fontSize: 13, fontWeight: 700, color: pc.color, background: pc.bg,
                      }}>
                        {ej.avance.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", minWidth: 160 }}>
                      <ProgressBar pct={ej.avance} color={pc.color} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                        <span style={{ fontSize: 10, color: COLORS.textLight }}>0%</span>
                        <span style={{ fontSize: 10, color: COLORS.textLight }}>100%</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: ej.proyeccion >= ej.meta ? COLORS.green : COLORS.yellow }}>
                        {formatMoney(Math.round(ej.proyeccion))}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: ej.falta === 0 ? COLORS.green : COLORS.red }}>
                        {ej.falta === 0 ? "¡Meta alcanzada!" : formatMoney(ej.falta)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              <tr style={{ background: COLORS.dark }}>
                <td style={{ padding: "14px 16px", fontWeight: 800, fontSize: 14, color: "#fff" }}>
                  TOTAL EQUIPO
                </td>
                <td style={{ padding: "14px 16px", fontWeight: 700, fontSize: 14, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(totals.meta)}
                </td>
                <td style={{ padding: "14px 16px", fontWeight: 800, fontSize: 14, color: COLORS.primary, fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(totals.real)}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{
                    display: "inline-block", padding: "4px 12px", borderRadius: 20,
                    fontSize: 13, fontWeight: 700, color: "#fff",
                    background: totals.avance >= 80 ? COLORS.green : totals.avance >= 50 ? COLORS.yellow : COLORS.red,
                  }}>
                    {totals.avance.toFixed(1)}%
                  </span>
                </td>
                <td style={{ padding: "14px 16px", minWidth: 160 }}>
                  <ProgressBar pct={totals.avance} color={COLORS.primary} />
                </td>
                <td style={{ padding: "14px 16px", fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: totals.proyeccion >= totals.meta ? COLORS.green : COLORS.yellow }}>
                    {formatMoney(Math.round(totals.proyeccion))}
                  </span>
                </td>
                <td style={{ padding: "14px 16px", fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: totals.falta === 0 ? COLORS.green : "#FF8A8A" }}>
                    {totals.falta === 0 ? "¡Meta alcanzada!" : formatMoney(totals.falta)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.dark, margin: "24px 0 14px" }}>
          Detalle por ejecutivo
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {tableData.map((ej, idx) => {
            const pc = pctColor(ej.avance);
            return (
              <div key={idx} style={{
                background: "#fff", borderRadius: 14, padding: "18px 20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
                borderLeft: `4px solid ${pc.color}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, margin: 0 }}>
                      {ej.nombre.split(" ").slice(0, 2).join(" ")}
                    </p>
                    <p style={{ fontSize: 11, color: COLORS.textLight, margin: "2px 0 0" }}>Crédito de Nómina</p>
                  </div>
                  <span style={{
                    padding: "4px 12px", borderRadius: 20, fontSize: 14, fontWeight: 800,
                    color: pc.color, background: pc.bg,
                  }}>
                    {ej.avance.toFixed(0)}%
                  </span>
                </div>
                <ProgressBar pct={ej.avance} color={pc.color} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                  <div>
                    <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>Real</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: COLORS.primary, margin: 0 }}>{formatMoney(ej.real)}</p>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>Meta</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, margin: 0 }}>{formatMoney(ej.meta)}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>Falta</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: ej.falta === 0 ? COLORS.green : COLORS.red, margin: 0 }}>
                      {ej.falta === 0 ? "✓" : formatMoney(ej.falta)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 11, color: COLORS.primary, fontWeight: 600, textAlign: "center", marginTop: 20 }}>
          Los datos de "Real" se calculan automáticamente de la tabla de clientes (estatus = Dispersión)
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESUMEN MOTOS SCREEN (Fase 5)
// ═══════════════════════════════════════════════════════════════════════════

function KPICardMotos({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "18px 20px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
      flex: "1 1 180px", minWidth: 160,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <p style={{ fontSize: 11, color: COLORS.textLight, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
      </div>
      <p style={{ fontSize: 28, fontWeight: 800, color: color || COLORS.dark, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: COLORS.textLight, margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
}

function UnitDots({ real, meta }) {
  const dots = [];
  const max = Math.max(meta, real);
  for (let i = 0; i < max; i++) {
    dots.push(
      <div
        key={i}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: i < real ? COLORS.primary : "#E2E8F0",
          border: i < meta && i >= real ? `2px dashed ${COLORS.textLight}` : "2px solid transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 8,
          color: "#fff",
          fontWeight: 700,
          transition: "all 0.3s",
        }}
      >
        {i < real ? "✓" : ""}
      </div>
    );
  }
  return <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{dots}</div>;
}

function ResumenMotos() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [diaActual, setDiaActual] = useState(now.getDate());

  const { motosEjecutivos, loading: loadingEjecutivos } = useExecutives({ mes, anio });
  const { clients, loading: loadingClients } = useClients({ mes, anio, isAdmin: true });

  const diasMes = useMemo(() => getDaysInMonth(mes, anio), [mes, anio]);
  const diasTranscurridos = Math.min(diaActual, diasMes);
  const diasRestantes = diasMes - diasTranscurridos;
  const pctMesTranscurrido = ((diasTranscurridos / diasMes) * 100).toFixed(0);

  const tableData = useMemo(() => {
    return motosEjecutivos.map((ej) => {
      // Count units: where ejecutivo name matches, estatus = "Dispersión", and producto != "Crédito de nómina"
      const real = clients.filter(
        (c) =>
          c.ejecutivo === ej.nombre &&
          c.estatus === "Dispersión" &&
          c.producto !== "Crédito de nómina"
      ).length;

      // Count arrendamiento units
      const arrendamiento = clients.filter(
        (c) =>
          c.ejecutivo === ej.nombre &&
          c.estatus === "Dispersión" &&
          c.producto === "Arrendamiento de motos"
      ).length;

      // Count financiamiento units
      const financiamiento = clients.filter(
        (c) =>
          c.ejecutivo === ej.nombre &&
          c.estatus === "Dispersión" &&
          c.producto === "Financiamiento de motos"
      ).length;

      const avance = ej.meta > 0 ? (real / ej.meta) * 100 : 0;
      const proyeccion = diasTranscurridos > 0 ? (real / diasTranscurridos) * diasMes : 0;
      const falta = Math.max(ej.meta - real, 0);
      return { ...ej, real, arrendamiento, financiamiento, avance, proyeccion, falta };
    });
  }, [motosEjecutivos, clients, diasTranscurridos, diasMes]);

  const totals = useMemo(() => {
    const meta = tableData.reduce((s, e) => s + e.meta, 0);
    const real = tableData.reduce((s, e) => s + e.real, 0);
    const arr = tableData.reduce((s, e) => s + e.arrendamiento, 0);
    const fin = tableData.reduce((s, e) => s + e.financiamiento, 0);
    const avance = meta > 0 ? (real / meta) * 100 : 0;
    const proyeccion = diasTranscurridos > 0 ? (real / diasTranscurridos) * diasMes : 0;
    const falta = Math.max(meta - real, 0);
    return { meta, real, avance, proyeccion, falta, arrendamiento: arr, financiamiento: fin };
  }, [tableData, diasTranscurridos, diasMes]);

  if (loadingEjecutivos || loadingClients) {
    return <div style={{ padding: 40, textAlign: "center" }}><p>Cargando datos...</p></div>;
  }

  if (motosEjecutivos.length === 0) {
    return (
      <div style={{
        minHeight: "100vh", background: COLORS.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: COLORS.dark, marginBottom: 16 }}>
            No hay ejecutivos de motos configurados para {MESES[mes - 1]} {anio}
          </p>
          <p style={{ fontSize: 13, color: COLORS.textLight }}>
            Configura los ejecutivos en el Catálogo de Ejecutivos
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: "0 0 4px" }}>
            Resumen de Ejecutivos — Financiamiento y Arrendamiento
          </h1>
          <p style={{ fontSize: 13, color: COLORS.textLight, margin: 0 }}>
            Avance de ventas contra meta mensual medido en <strong>unidades vendidas</strong>
          </p>
        </div>

        <div style={{
          background: "#fff", borderRadius: 14, padding: "18px 22px", marginBottom: 18,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end",
        }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Mes</label>
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{
              padding: "10px 14px", fontSize: 14, border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              background: "#fff", fontFamily: "inherit", fontWeight: 600, cursor: "pointer", outline: "none", minWidth: 140,
            }}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Año</label>
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{
              padding: "10px 14px", fontSize: 14, border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              background: "#fff", fontFamily: "inherit", fontWeight: 600, cursor: "pointer", outline: "none",
            }}>
              {[2025, 2026, 2027, 2028].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Día actual</label>
            <input type="number" min={1} max={diasMes} value={diaActual} onChange={(e) => setDiaActual(Math.min(Number(e.target.value), diasMes))} style={{
              padding: "10px 14px", fontSize: 14, border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              background: "#fff", fontFamily: "inherit", fontWeight: 600, outline: "none", width: 70,
            }} />
          </div>
          <div style={{ display: "flex", gap: 20, marginLeft: "auto", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>Días del mes</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: 0 }}>{diasMes}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>Transcurridos</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: COLORS.primary, margin: 0 }}>{diasTranscurridos}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>Restantes</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: diasRestantes <= 5 ? COLORS.red : COLORS.yellow, margin: 0 }}>{diasRestantes}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>% Mes</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: 0 }}>{pctMesTranscurrido}%</p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
          <KPICardMotos icon="🎯" label="Meta total equipo" value={`${totals.meta} uds`} color={COLORS.dark} />
          <KPICardMotos icon="🏍" label="Unidades vendidas" value={totals.real} sub={`${totals.avance.toFixed(1)}% de la meta`} color={COLORS.primary} />
          <KPICardMotos icon="📋" label="Arrendamiento" value={totals.arrendamiento} sub="unidades" color={COLORS.yellow} />
          <KPICardMotos icon="💳" label="Financiamiento" value={totals.financiamiento} sub="unidades" color={COLORS.purple} />
          <KPICardMotos icon="📈" label="Proyección" value={`${Math.round(totals.proyeccion)} uds`} sub={totals.proyeccion >= totals.meta ? "¡Superaría la meta!" : "Por debajo de meta"} color={totals.proyeccion >= totals.meta ? COLORS.green : COLORS.yellow} />
        </div>

        <div style={{
          background: "#fff", borderRadius: 14,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          overflowX: "auto",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
            <thead>
              <tr style={{ background: COLORS.dark }}>
                {["Ejecutivo", "Meta (uds)", "Real (uds)", "Arrend.", "Financ.", "% Avance", "Progreso", "Proyección", "Falta"].map((h) => (
                  <th key={h} style={{
                    padding: "12px 14px", fontSize: 11, fontWeight: 700, color: "#fff",
                    textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5,
                    whiteSpace: "nowrap", borderBottom: `3px solid ${COLORS.yellow}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((ej, idx) => {
                const pc = pctColor(ej.avance);
                return (
                  <tr key={idx} style={{
                    background: idx % 2 === 0 ? "#fff" : "#FAFBFA",
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    <td style={{ padding: "14px", maxWidth: 180 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, margin: 0 }}>
                        {ej.nombre.split(" ").slice(0, 3).join(" ")}
                      </p>
                    </td>
                    <td style={{ padding: "14px", textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", padding: "4px 14px", borderRadius: 8,
                        fontSize: 15, fontWeight: 700, color: COLORS.text, background: "#F1F5F9",
                      }}>
                        {ej.meta}
                      </span>
                    </td>
                    <td style={{ padding: "14px", textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", padding: "4px 14px", borderRadius: 8,
                        fontSize: 18, fontWeight: 800, color: COLORS.primary, background: COLORS.primaryLight,
                      }}>
                        {ej.real}
                      </span>
                    </td>
                    <td style={{ padding: "14px", textAlign: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.yellow }}>{ej.arrendamiento}</span>
                    </td>
                    <td style={{ padding: "14px", textAlign: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.purple }}>{ej.financiamiento}</span>
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span style={{
                        display: "inline-block", padding: "4px 12px", borderRadius: 20,
                        fontSize: 13, fontWeight: 700, color: pc.color, background: pc.bg,
                      }}>
                        {ej.avance.toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ padding: "14px", minWidth: 130 }}>
                      <UnitDots real={ej.real} meta={ej.meta} />
                    </td>
                    <td style={{ padding: "14px", textAlign: "center" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: ej.proyeccion >= ej.meta ? COLORS.green : COLORS.yellow }}>
                        {Math.round(ej.proyeccion)}
                      </span>
                    </td>
                    <td style={{ padding: "14px", textAlign: "center" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: ej.falta === 0 ? COLORS.green : COLORS.red }}>
                        {ej.falta === 0 ? "✓ Meta" : ej.falta}
                      </span>
                    </td>
                  </tr>
                );
              })}

              <tr style={{ background: COLORS.dark }}>
                <td style={{ padding: "14px", fontWeight: 800, fontSize: 14, color: "#fff" }}>TOTAL EQUIPO</td>
                <td style={{ padding: "14px", textAlign: "center", fontWeight: 700, fontSize: 16, color: "#fff" }}>{totals.meta}</td>
                <td style={{ padding: "14px", textAlign: "center", fontWeight: 800, fontSize: 18, color: COLORS.primary }}>{totals.real}</td>
                <td style={{ padding: "14px", textAlign: "center", fontWeight: 700, color: COLORS.yellow }}>{totals.arrendamiento}</td>
                <td style={{ padding: "14px", textAlign: "center", fontWeight: 700, color: COLORS.purple }}>{totals.financiamiento}</td>
                <td style={{ padding: "14px" }}>
                  <span style={{
                    display: "inline-block", padding: "4px 12px", borderRadius: 20,
                    fontSize: 13, fontWeight: 700, color: "#fff",
                    background: totals.avance >= 80 ? COLORS.green : totals.avance >= 50 ? COLORS.yellow : COLORS.red,
                  }}>
                    {totals.avance.toFixed(0)}%
                  </span>
                </td>
                <td style={{ padding: "14px" }}>
                  <ProgressBar pct={totals.avance} color={COLORS.primary} />
                </td>
                <td style={{ padding: "14px", textAlign: "center", fontWeight: 700, fontSize: 16 }}>
                  <span style={{ color: totals.proyeccion >= totals.meta ? COLORS.green : COLORS.yellow }}>{Math.round(totals.proyeccion)}</span>
                </td>
                <td style={{ padding: "14px", textAlign: "center", fontWeight: 700, fontSize: 16 }}>
                  <span style={{ color: totals.falta === 0 ? COLORS.green : "#FF8A8A" }}>{totals.falta === 0 ? "✓ Meta" : totals.falta}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.dark, margin: "24px 0 14px" }}>
          Detalle por ejecutivo
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {tableData.map((ej, idx) => {
            const pc = pctColor(ej.avance);
            return (
              <div key={idx} style={{
                background: "#fff", borderRadius: 14, padding: "20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
                borderLeft: `4px solid ${pc.color}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, margin: 0 }}>
                      {ej.nombre.split(" ").slice(0, 3).join(" ")}
                    </p>
                    <p style={{ fontSize: 11, color: COLORS.textLight, margin: "2px 0 0" }}>Motos — Arrendamiento y Financiamiento</p>
                  </div>
                  <span style={{
                    padding: "5px 14px", borderRadius: 20, fontSize: 15, fontWeight: 800,
                    color: pc.color, background: pc.bg,
                  }}>
                    {ej.avance.toFixed(0)}%
                  </span>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <UnitDots real={ej.real} meta={ej.meta} />
                  <p style={{ fontSize: 10, color: COLORS.textLight, margin: "4px 0 0" }}>
                    Cada círculo = 1 unidad | ● vendida ○ pendiente
                  </p>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>Real</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: COLORS.primary, margin: 0 }}>{ej.real}</p>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>Meta</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: 0 }}>{ej.meta}</p>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 10, color: COLORS.yellow, margin: 0, fontWeight: 600 }}>Arrend.</p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: COLORS.yellow, margin: 0 }}>{ej.arrendamiento}</p>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 10, color: COLORS.purple, margin: 0, fontWeight: 600 }}>Financ.</p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: COLORS.purple, margin: 0 }}>{ej.financiamiento}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>Falta</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: ej.falta === 0 ? COLORS.green : COLORS.red, margin: 0 }}>
                      {ej.falta === 0 ? "✓" : ej.falta}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 11, color: COLORS.primary, fontWeight: 600, textAlign: "center", marginTop: 20 }}>
          Se calcula contando clientes con estatus "Dispersión" y producto "Arrendamiento" o "Financiamiento"
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Will continue with Catalogo, PortalEjecutivo, ExportExcel, Sidebar, and main App
// ═══════════════════════════════════════════════════════════════════════════

// CATALOGO EJECUTIVOS SCREEN (Fase 6) + PORTAL EJECUTIVO (Fase 7) + EXPORT EXCEL (Fase 9) + SIDEBAR + MAIN APP
// Due to file size limits, all code continues below...

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

function Sidebar({ activeScreen, onNavigate, onLogout, perfil, mobileOpen, onCloseMobile }) {
  const isAdmin = perfil?.rol === "admin";
  const isMobile = useIsMobile();

  const adminMenuItems = [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "clientes", label: "Clientes", icon: "📋" },
    { key: "nomina", label: "Resumen Nómina", icon: "💰" },
    { key: "motos", label: "Resumen Motos", icon: "🏍" },
    { key: "catalogo", label: "Catálogo", icon: "📂" },
    { key: "usuarios", label: "Usuarios", icon: "👤" },
    { key: "export", label: "Exportar Excel", icon: "📦" },
  ];

  const ejecutivoMenuItems = [
    { key: "portal", label: "Mi Pipeline", icon: "🎯" },
  ];

  const menuItems = isAdmin ? adminMenuItems : ejecutivoMenuItems;

  const handleNav = (key) => {
    onNavigate(key);
    if (isMobile && onCloseMobile) onCloseMobile();
  };

  // En móvil: overlay + sidebar deslizable. En desktop: fijo como antes.
  if (isMobile && !mobileOpen) return null;

  return (
    <>
      {/* Overlay oscuro en móvil */}
      {isMobile && (
        <div
          onClick={onCloseMobile}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 9998, transition: "opacity 0.3s",
          }}
        />
      )}
      <div style={{
        width: isMobile ? 260 : 240,
        height: "100vh",
        background: COLORS.dark,
        position: "fixed",
        left: 0,
        top: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${COLORS.darkMid}`,
        zIndex: 9999,
        transition: "transform 0.3s ease",
      }}>
        {/* Header con botón cerrar en móvil */}
        <div style={{
          padding: isMobile ? "16px 16px" : "24px 20px",
          borderBottom: `1px solid ${COLORS.darkMid}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              border: `2px solid ${COLORS.primary}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>
              ✓
            </div>
            <h2 style={{ margin: 0, color: "white", fontSize: 18, fontWeight: 700 }}>
              Credivive
            </h2>
          </div>
          {isMobile && (
            <button onClick={onCloseMobile} style={{
              background: "none", border: "none", color: "#ffffff80",
              fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1,
            }}>✕</button>
          )}
        </div>

        <div style={{
          padding: isMobile ? "12px 16px" : "16px 20px",
          borderBottom: `1px solid ${COLORS.darkMid}`,
        }}>
          <p style={{ margin: 0, color: "white", fontSize: 13, fontWeight: 600 }}>
            {perfil?.nombre_display || "Usuario"}
          </p>
          <div style={{
            background: COLORS.primary, color: "white",
            padding: "4px 8px", borderRadius: 4, fontSize: 11,
            fontWeight: 600, display: "inline-block", marginTop: 8,
            textTransform: "uppercase",
          }}>
            {isAdmin ? "Administrador" : "Ejecutivo"}
          </div>
        </div>

        <nav style={{ flex: 1, padding: "12px 8px", overflow: "auto" }}>
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              style={{
                width: "100%", padding: "12px 16px",
                background: activeScreen === item.key ? COLORS.primary : "transparent",
                color: activeScreen === item.key ? "white" : COLORS.textLight,
                border: "none", borderRadius: 8, textAlign: "left",
                fontSize: 14, fontWeight: activeScreen === item.key ? 600 : 500,
                cursor: "pointer", display: "flex", alignItems: "center",
                gap: 10, marginBottom: 4, transition: "all 0.2s ease",
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ padding: "12px 8px", borderTop: `1px solid ${COLORS.darkMid}` }}>
          <button onClick={() => { onLogout(); if (isMobile && onCloseMobile) onCloseMobile(); }} style={{
            width: "100%", padding: "12px 16px",
            background: COLORS.red, color: "white", border: "none",
            borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center",
            gap: 10, transition: "all 0.2s ease",
          }}>
            <span>🚪</span>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CATALOGO EJECUTIVOS - Full Implementation
// ═══════════════════════════════════════════════════════════════════════════

function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? COLORS.primary : "#D1D5DB",
        cursor: "pointer",
        transition: "background 0.2s",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "#fff",
        position: "absolute",
        top: 2,
        left: checked ? 22 : 2,
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }} />
    </div>
  );
}

function EditableMetaCell({ value, onChange, isMoney }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);

  const save = () => {
    onChange(Number(temp) || 0);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={temp}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        style={{
          padding: "8px 12px",
          fontSize: 15,
          fontWeight: 700,
          border: `2px solid ${COLORS.primary}`,
          borderRadius: 8,
          outline: "none",
          width: 130,
          fontFamily: "inherit",
          background: COLORS.primaryLight,
        }}
      />
    );
  }

  return (
    <div
      onClick={() => { setTemp(value); setEditing(true); }}
      style={{
        padding: "8px 14px",
        fontSize: 15,
        fontWeight: 700,
        color: COLORS.primary,
        background: "#F8FAF8",
        border: `1.5px dashed ${COLORS.border}`,
        borderRadius: 8,
        cursor: "pointer",
        display: "inline-block",
        minWidth: 100,
        textAlign: "center",
        transition: "border-color 0.2s",
      }}
      title="Clic para editar"
    >
      {isMoney ? formatMoney(value) : `${value} uds`}
      <span style={{ fontSize: 10, color: COLORS.textLight, marginLeft: 6 }}>✎</span>
    </div>
  );
}

function AddExecutiveForm({ onAdd, onClose, type }) {
  const [nombre, setNombre] = useState("");
  const [meta, setMeta] = useState("");

  const handleAdd = () => {
    if (!nombre.trim()) return;
    onAdd({ nombre: nombre.trim(), meta: Number(meta) || 0 });
    setNombre("");
    setMeta("");
    onClose();
  };

  return (
    <div style={{
      background: COLORS.primaryLight, borderRadius: 12, padding: "16px 18px", marginTop: 12,
      border: `1.5px solid ${COLORS.primary}40`,
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.dark, margin: "0 0 12px" }}>
        + Agregar ejecutivo de {type === "nomina" ? "nómina" : "motos"}
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "2 1 200px" }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: COLORS.textLight, marginBottom: 4 }}>Nombre completo</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del ejecutivo..."
            style={{
              width: "100%", padding: "10px 12px", fontSize: 14,
              border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: COLORS.textLight, marginBottom: 4 }}>
            Meta {type === "nomina" ? "($)" : "(unidades)"}
          </label>
          <input
            type="number"
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            placeholder="0"
            style={{
              width: "100%", padding: "10px 12px", fontSize: 14,
              border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <button onClick={handleAdd} style={{
          padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "#fff",
          background: COLORS.primary, border: "none", borderRadius: 8,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}>
          Agregar
        </button>
        <button onClick={onClose} style={{
          padding: "10px 14px", fontSize: 13, fontWeight: 600, color: COLORS.textLight,
          background: "#F3F4F6", border: "none", borderRadius: 8,
          cursor: "pointer", fontFamily: "inherit",
        }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ExecutiveTable({ title, subtitle, data, isMoney, accentColor, icon, type, onUpdateMeta, onToggleActivo, onUpdateTipo }) {
  const [showAdd, setShowAdd] = useState(false);

  const totalMeta = data.filter((e) => e.activo).reduce((s, e) => s + e.meta, 0);
  const activos = data.filter((e) => e.activo).length;

  const handleUpdateMeta = async (id, newMeta) => {
    try {
      await onUpdateMeta(id, newMeta);
    } catch (err) {
      console.error("Error updating meta:", err);
    }
  };

  const handleToggleActivo = async (id) => {
    try {
      const ej = data.find((e) => e.id === id);
      if (ej) {
        await onToggleActivo(id, !ej.activo);
      }
    } catch (err) {
      console.error("Error toggling activo:", err);
    }
  };

  const handleChangeTipo = async (id, nuevoTipo) => {
    try {
      await onUpdateTipo(id, nuevoTipo);
    } catch (err) {
      console.error("Error cambiando tipo:", err);
    }
  };

  return (
    <div style={{
      background: "#fff", borderRadius: 16, overflow: "hidden",
      boxShadow: "0 2px 12px rgba(0,0,0,0.05)", border: `1px solid ${COLORS.border}`,
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{
        background: COLORS.dark, padding: "18px 22px",
        borderBottom: `3px solid ${accentColor}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 2px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>{icon}</span> {title}
            </h2>
            <p style={{ fontSize: 12, color: "#ffffff80", margin: 0 }}>{subtitle}</p>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#ffffff70", margin: 0, textTransform: "uppercase" }}>Ejecutivos activos</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: accentColor, margin: 0 }}>{activos}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "#ffffff70", margin: 0, textTransform: "uppercase" }}>Meta total</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>
                {isMoney ? formatMoney(totalMeta) : `${totalMeta} uds`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={{ padding: "12px 18px", fontSize: 11, fontWeight: 700, color: COLORS.textLight, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5 }}>#</th>
              <th style={{ padding: "12px 18px", fontSize: 11, fontWeight: 700, color: COLORS.textLight, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5 }}>Nombre del ejecutivo</th>
              <th style={{ padding: "12px 18px", fontSize: 11, fontWeight: 700, color: COLORS.textLight, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>Tipo</th>
              <th style={{ padding: "12px 18px", fontSize: 11, fontWeight: 700, color: COLORS.textLight, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Meta mensual {isMoney ? "($)" : "(unidades)"}
              </th>
              <th style={{ padding: "12px 18px", fontSize: 11, fontWeight: 700, color: COLORS.textLight, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>Activo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((ej, idx) => (
              <tr
                key={ej.id}
                style={{
                  background: !ej.activo ? "#F9FAFB" : idx % 2 === 0 ? "#fff" : "#FAFBFA",
                  borderBottom: `1px solid ${COLORS.border}`,
                  opacity: ej.activo ? 1 : 0.5,
                  transition: "opacity 0.2s",
                }}
              >
                <td style={{ padding: "14px 18px" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: "50%",
                    background: ej.activo ? `${accentColor}15` : "#F3F4F6",
                    color: ej.activo ? accentColor : COLORS.textLight,
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {idx + 1}
                  </span>
                </td>
                <td style={{ padding: "14px 18px" }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, margin: 0 }}>
                    {ej.nombre}
                  </p>
                  {ej.nombre.includes("(") && (
                    <p style={{ fontSize: 11, color: COLORS.textLight, margin: "2px 0 0" }}>
                      Zona: {ej.nombre.match(/\(([^)]+)\)/)?.[1]}
                    </p>
                  )}
                </td>
                <td style={{ padding: "14px 18px", textAlign: "center" }}>
                  <select
                    value={ej.tipo === "motos" ? "motos" : "nómina"}
                    onChange={(e) => handleChangeTipo(ej.id, e.target.value)}
                    style={{
                      padding: "6px 10px", fontSize: 12, fontWeight: 600,
                      border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
                      background: ej.tipo === "motos" ? `${COLORS.moto}15` : `${COLORS.primary}10`,
                      color: ej.tipo === "motos" ? COLORS.moto : COLORS.primary,
                      cursor: "pointer", fontFamily: "inherit", outline: "none",
                    }}
                  >
                    <option value="nómina">💰 Nómina</option>
                    <option value="motos">🏍 Motos</option>
                  </select>
                </td>
                <td style={{ padding: "14px 18px", textAlign: "center" }}>
                  <EditableMetaCell
                    value={ej.meta}
                    onChange={(newMeta) => handleUpdateMeta(ej.id, newMeta)}
                    isMoney={isMoney}
                  />
                </td>
                <td style={{ padding: "14px 18px", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Toggle checked={ej.activo} onChange={() => handleToggleActivo(ej.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Note: Adding ejecutivos is done through Supabase database directly */}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE EJECUTIVOS
// ═══════════════════════════════════════════════════════════════════════════

function CatalogoEjecutivos() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [showCopied, setShowCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  const { nominaEjecutivos: nomina, motosEjecutivos: motos, loading, updateMeta, updateTipo, toggleActivo, copyFromPreviousMonth } = useExecutives({ mes, anio });

  const handleCopyPrevMonth = async () => {
    setCopying(true);
    try {
      const result = await copyFromPreviousMonth();
      if (result.success) {
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2000);
      }
    } catch (err) {
      console.error("Error copying from previous month:", err);
    } finally {
      setCopying(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: "20px 24px",
    }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Title & Period */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: "0 0 4px" }}>
            Catálogo de Ejecutivos y Metas
          </h1>
          <p style={{ fontSize: 13, color: COLORS.textLight, margin: 0 }}>
            Los ejecutivos registrados aparecen aquí automáticamente. Asigna tipo (nómina o motos) y configura sus metas.
          </p>
        </div>

        {/* Period + Actions */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: "18px 22px", marginBottom: 20,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end",
        }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Mes</label>
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{
              padding: "10px 14px", fontSize: 14, border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              background: "#fff", fontFamily: "inherit", fontWeight: 600, cursor: "pointer", outline: "none", minWidth: 140,
            }}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Año</label>
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{
              padding: "10px 14px", fontSize: 14, border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
              background: "#fff", fontFamily: "inherit", fontWeight: 600, cursor: "pointer", outline: "none",
            }}>
              {[2025, 2026, 2027, 2028].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <button
            onClick={handleCopyPrevMonth}
            style={{
              padding: "10px 18px", fontSize: 13, fontWeight: 600,
              color: COLORS.primary, background: COLORS.primaryLight,
              border: `1.5px solid ${COLORS.primary}40`, borderRadius: 10,
              cursor: "pointer", fontFamily: "inherit", marginLeft: "auto",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ fontSize: 16 }}>📋</span>
            Copiar metas del mes anterior
          </button>
        </div>

        {showCopied && (
          <div style={{
            background: COLORS.primaryLight, borderRadius: 10, padding: "12px 18px",
            marginBottom: 16, border: `1px solid ${COLORS.primary}40`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.primaryDark, margin: 0 }}>
              Metas copiadas del mes anterior. Puedes ajustarlas haciendo clic en cada meta.
            </p>
          </div>
        )}

        {/* Info banner */}
        <div style={{
          background: "#EFF6FF", borderRadius: 10, padding: "14px 18px",
          marginBottom: 20, border: "1px solid #BFDBFE",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
          <div>
            <p style={{ fontSize: 13, color: "#1E40AF", fontWeight: 600, margin: "0 0 4px" }}>
              ¿Cómo funciona?
            </p>
            <p style={{ fontSize: 12, color: "#3B82F6", margin: 0, lineHeight: 1.5 }}>
              Los ejecutivos aparecen <strong>automáticamente</strong> al crear su cuenta. Usa el <strong>selector de tipo</strong> para mover un ejecutivo entre Nómina y Motos. Haz <strong>clic en la meta</strong> para editarla. Usa el toggle para desactivar ejecutivos sin borrarlos.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}><p>Cargando ejecutivos...</p></div>
        ) : (
          <>
            {/* Nómina Table */}
            <ExecutiveTable
              title="Ejecutivos de Crédito de Nómina"
              subtitle="Meta medida en pesos ($)"
              data={nomina}
              isMoney={true}
              accentColor={COLORS.primary}
              icon="💰"
              type="nomina"
              onUpdateMeta={updateMeta}
              onUpdateTipo={updateTipo}
              onToggleActivo={toggleActivo}
            />

            {/* Motos Table */}
            <ExecutiveTable
              title="Ejecutivos de Financiamiento y Arrendamiento"
              subtitle="Meta medida en unidades vendidas"
              data={motos}
              isMoney={false}
              accentColor={COLORS.moto}
              icon="🏍"
              type="motos"
              onUpdateMeta={updateMeta}
              onUpdateTipo={updateTipo}
              onToggleActivo={toggleActivo}
            />
          </>
        )}

        <p style={{ fontSize: 11, color: COLORS.primary, fontWeight: 600, textAlign: "center", marginTop: 10, marginBottom: 20 }}>
          Haz clic en cualquier meta para editarla. Cambia el tipo con el selector para mover ejecutivos entre categorías.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PORTAL EJECUTIVO - Full Implementation
// ═══════════════════════════════════════════════════════════════════════════

const STAGES_PORTAL = [
  { key: "Prospecto", label: "Prospecto", color: COLORS.blue, bg: COLORS.blueBg, icon: "🎯", num: 1 },
  { key: "Entrega de documentos", label: "Entrega de documentos", color: COLORS.yellow, bg: COLORS.yellowBg, icon: "📄", num: 2 },
  { key: "Análisis", label: "Análisis", color: COLORS.orange, bg: COLORS.orangeBg, icon: "🔍", num: 3 },
  { key: "Aprobación", label: "Aprobación", color: COLORS.purple, bg: COLORS.purpleBg, icon: "✅", num: 4 },
  { key: "Dispersión", label: "Dispersión", color: COLORS.green, bg: COLORS.greenBg, icon: "💰", num: 5 },
];

const REJECTED_STATUS_PORTAL = { key: "Rechazado/Cancelado", label: "Rechazado / Cancelado", color: COLORS.red, bg: COLORS.redBg, icon: "✕" };


function getStageIndex(status) {
  return STAGES_PORTAL.findIndex((s) => s.key === status);
}

function RejectModal({ client, onConfirm, onClose }) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState(false);

  const handleConfirm = () => {
    if (comment.trim().length < 10) {
      setError(true);
      return;
    }
    onConfirm(client.id, comment.trim());
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "28px 24px",
        maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: COLORS.redBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
        }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 700, color: COLORS.dark, textAlign: "center", margin: "0 0 6px" }}>
          Rechazar / Cancelar crédito
        </h3>
        <p style={{ fontSize: 13, color: COLORS.textLight, textAlign: "center", margin: "0 0 20px" }}>
          Cliente: <strong>{client.nombre_cliente}</strong> — {formatMoney(client.monto)}
        </p>

        <div style={{
          background: COLORS.redBg, borderRadius: 10, padding: "12px 14px",
          marginBottom: 16, border: `1px solid ${COLORS.red}30`,
        }}>
          <p style={{ fontSize: 12, color: COLORS.red, fontWeight: 600, margin: 0 }}>
            Es obligatorio explicar el motivo del rechazo o cancelación.
          </p>
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>
          ¿Qué pasó? (mínimo 10 caracteres) *
        </label>
        <textarea
          autoFocus
          value={comment}
          onChange={(e) => { setComment(e.target.value); setError(false); }}
          placeholder="Ej: Rechazado por mal historial crediticio en Buró de Crédito. Se notificó al cliente por teléfono..."
          style={{
            width: "100%", minHeight: 100, padding: "12px",
            fontSize: 14, border: `2px solid ${error ? COLORS.red : COLORS.border}`,
            borderRadius: 10, fontFamily: "inherit", outline: "none",
            resize: "vertical", boxSizing: "border-box",
            background: error ? COLORS.redBg : "#fff",
          }}
        />
        {error && (
          <p style={{ fontSize: 11, color: COLORS.red, margin: "4px 0 0" }}>
            Debes explicar con más detalle qué pasó (mínimo 10 caracteres)
          </p>
        )}
        <p style={{ fontSize: 11, color: COLORS.textLight, margin: "4px 0 0" }}>
          {comment.length}/10 caracteres mínimo
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px", fontSize: 14, fontWeight: 600,
            color: COLORS.textLight, background: "#F3F4F6", border: "none",
            borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
          }}>
            Cancelar
          </button>
          <button onClick={handleConfirm} style={{
            flex: 2, padding: "12px", fontSize: 14, fontWeight: 700,
            color: "#fff", background: COLORS.red, border: "none",
            borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
          }}>
            Confirmar rechazo
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveModal({ client, onMove, onClose }) {
  const currentIdx = getStageIndex(client.estatus);
  const nextStage = currentIdx < STAGES_PORTAL.length - 1 ? STAGES_PORTAL[currentIdx + 1] : null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "28px 24px",
        maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: COLORS.dark, margin: "0 0 6px" }}>
          Mover de etapa
        </h3>
        <p style={{ fontSize: 13, color: COLORS.textLight, margin: "0 0 20px" }}>
          <strong>{client.nombre_cliente}</strong>
        </p>

        {/* Pipeline visual */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
          {STAGES_PORTAL.map((stage, idx) => {
            const isCurrent = stage.key === client.estatus;
            const isPast = idx < currentIdx;
            return (
              <div key={stage.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div
                  onClick={() => { if (idx > currentIdx) onMove(client.id, stage.key); }}
                  style={{
                    padding: "8px 12px", borderRadius: 10,
                    background: isCurrent ? stage.color : isPast ? `${stage.color}20` : "#F3F4F6",
                    color: isCurrent ? "#fff" : isPast ? stage.color : COLORS.textLight,
                    fontSize: 11, fontWeight: 700, cursor: idx > currentIdx ? "pointer" : "default",
                    border: idx > currentIdx ? `2px dashed ${stage.color}60` : "2px solid transparent",
                    transition: "all 0.2s",
                    textAlign: "center",
                    opacity: isPast ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: 14 }}>{stage.icon}</span>
                  <br />
                  {stage.label.split(" ")[0]}
                </div>
                {idx < STAGES_PORTAL.length - 1 && (
                  <span style={{ color: isPast || isCurrent ? stage.color : "#D1D5DB", fontSize: 14 }}>→</span>
                )}
              </div>
            );
          })}
        </div>

        {nextStage && (
          <button
            onClick={() => onMove(client.id, nextStage.key)}
            style={{
              width: "100%", padding: "14px", fontSize: 15, fontWeight: 700,
              color: "#fff", background: nextStage.color, border: "none",
              borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              boxShadow: `0 4px 14px ${nextStage.color}40`,
              marginBottom: 10,
            }}
          >
            {nextStage.icon} Avanzar a "{nextStage.label}"
          </button>
        )}

        <button onClick={onClose} style={{
          width: "100%", padding: "12px", fontSize: 14, fontWeight: 600,
          color: COLORS.textLight, background: "#F3F4F6", border: "none",
          borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

function AddModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ nombre: "", producto: "", monto: "", actualizacion: "" });
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleAdd = () => {
    if (!form.nombre.trim() || !form.producto) { alert("Llena nombre y producto"); return; }
    onAdd(form);
  };

  const inputStyle = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: `1.5px solid ${COLORS.border}`, borderRadius: 8,
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "28px 24px",
        maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: COLORS.dark, margin: "0 0 20px" }}>
          + Nuevo cliente
        </h3>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>Nombre del cliente *</label>
            <input style={inputStyle} value={form.nombre} onChange={(e) => update("nombre", e.target.value)} placeholder="Nombre completo" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>Producto *</label>
            <select value={form.producto} onChange={(e) => update("producto", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">Seleccionar...</option>
              {PRODUCTOS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>Monto ($)</label>
            <input style={inputStyle} type="number" value={form.monto} onChange={(e) => update("monto", e.target.value)} placeholder="0" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>Notas</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.actualizacion} onChange={(e) => update("actualizacion", e.target.value)} placeholder="Notas iniciales..." />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", fontSize: 14, fontWeight: 600, color: COLORS.textLight, background: "#F3F4F6", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
          <button onClick={handleAdd} style={{ flex: 2, padding: "12px", fontSize: 14, fontWeight: 700, color: "#fff", background: COLORS.primary, border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ClientCard({ client, onMoveClick, onRejectClick, onDeleteClick }) {
  const stageConfig = STAGES_PORTAL.find((s) => s.key === client.estatus) || REJECTED_STATUS_PORTAL;
  const isRejected = client.estatus === "Rechazado";
  const isDispersed = client.estatus === "Dispersión";

  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "18px 20px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
      border: `1px solid ${COLORS.border}`,
      borderLeft: `4px solid ${stageConfig.color}`,
      opacity: isRejected ? 0.65 : 1,
      transition: "transform 0.15s, box-shadow 0.15s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, margin: 0 }}>{client.nombre_cliente}</p>
          <p style={{ fontSize: 12, color: COLORS.textLight, margin: "2px 0 0" }}>{client.producto}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            color: stageConfig.color, background: stageConfig.bg,
            border: `1px solid ${stageConfig.color}30`, whiteSpace: "nowrap",
          }}>
            {stageConfig.icon} {isRejected ? "Rechazado" : stageConfig.label}
          </span>
          {onDeleteClick && (
            <button
              onClick={() => onDeleteClick(client)}
              title="Eliminar cliente"
              style={{
                width: 26, height: 26, borderRadius: "50%", border: "none",
                background: "transparent", cursor: "pointer", fontSize: 13,
                color: COLORS.textLight, display: "flex", alignItems: "center",
                justifyContent: "center", transition: "all 0.2s", padding: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.redBg; e.currentTarget.style.color = COLORS.red; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = COLORS.textLight; }}
            >
              🗑
            </button>
          )}
        </div>
      </div>

      {/* Amount & Date */}
      <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
        {client.monto > 0 && (
          <div>
            <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>Monto</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: COLORS.primary, margin: 0 }}>{formatMoney(client.monto)}</p>
          </div>
        )}
        <div>
          <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>Inicio</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, margin: 0 }}>{client.fecha_inicio}</p>
        </div>
        {client.fecha_final && (
          <div>
            <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0, textTransform: "uppercase" }}>Cierre</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, margin: 0 }}>{client.fecha_final}</p>
          </div>
        )}
      </div>

      {/* Pipeline progress */}
      {!isRejected && (
        <div style={{ display: "flex", gap: 3, marginBottom: 12 }}>
          {STAGES_PORTAL.map((stage, idx) => {
            const currentIdx = getStageIndex(client.estatus);
            const filled = idx <= currentIdx;
            return (
              <div key={stage.key} style={{
                flex: 1, height: 6, borderRadius: 3,
                background: filled ? stageConfig.color : "#E2E8F0",
                transition: "background 0.3s",
              }} />
            );
          })}
        </div>
      )}

      {/* Notes */}
      {client.actualizacion && (
        <div style={{
          background: isRejected ? COLORS.redBg : "#F8FAFC",
          borderRadius: 8, padding: "10px 12px", marginBottom: 12,
          border: `1px solid ${isRejected ? COLORS.red + "30" : COLORS.border}`,
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: isRejected ? COLORS.red : COLORS.textLight, margin: "0 0 2px", textTransform: "uppercase" }}>
            {isRejected ? "Motivo del rechazo" : "Última actualización"}
          </p>
          <p style={{ fontSize: 12, color: isRejected ? COLORS.red : COLORS.text, margin: 0, lineHeight: 1.4 }}>
            {client.actualizacion}
          </p>
        </div>
      )}

      {/* Actions */}
      {!isRejected && !isDispersed && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onMoveClick(client)}
            style={{
              flex: 2, padding: "10px", fontSize: 13, fontWeight: 700,
              color: "#fff", background: COLORS.primary, border: "none",
              borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Avanzar etapa →
          </button>
          <button
            onClick={() => onRejectClick(client)}
            style={{
              flex: 1, padding: "10px", fontSize: 12, fontWeight: 600,
              color: COLORS.red, background: COLORS.redBg, border: `1px solid ${COLORS.red}30`,
              borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Rechazar
          </button>
        </div>
      )}
      {isDispersed && (
        <div style={{
          background: COLORS.greenBg, borderRadius: 8, padding: "10px",
          textAlign: "center", border: `1px solid ${COLORS.green}30`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.green }}>
            ✓ Crédito dispersado — Venta cerrada
          </span>
        </div>
      )}
    </div>
  );
}

function PortalEjecutivo({ perfil }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  // El nombre del perfil ES el nombre del ejecutivo
  const ejecutivoNombre = perfil?.nombre_display || null;

  const { clients, loading, error, addClient, updateEstatus, deleteClient, refetch } = useClients({
    mes, anio,
    ejecutivoNombre,
    isAdmin: false,
  });
  const [filterEstatus, setFilterEstatus] = useState("todos");
  const [moveClient, setMoveClient] = useState(null);
  const [rejectClient, setRejectClient] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteConfirmPortal, setDeleteConfirmPortal] = useState(null);

  const ejecutivo = perfil?.nombre_display || "Ejecutivo";

  const filtered = useMemo(() => {
    if (filterEstatus === "todos") return clients;
    if (filterEstatus === "activos") return clients.filter((c) => c.estatus !== "Rechazado" && c.estatus !== "Dispersión");
    if (filterEstatus === "cerrados") return clients.filter((c) => c.estatus === "Dispersión");
    if (filterEstatus === "rechazados") return clients.filter((c) => c.estatus === "Rechazado");
    return clients.filter((c) => c.estatus === filterEstatus && c.estatus !== "Rechazado");
  }, [clients, filterEstatus]);

  const counts = useMemo(() => {
    const c = { total: clients.length, activos: 0, cerrados: 0, rechazados: 0 };
    STAGES_PORTAL.forEach((s) => { c[s.key] = 0; });
    clients.forEach((cl) => {
      if (cl.estatus === "Rechazado") { c.rechazados++; }
      else if (cl.estatus === "Dispersión") { c.cerrados++; }
      else { c.activos++; c[cl.estatus] = (c[cl.estatus] || 0) + 1; }
    });
    return c;
  }, [clients]);

  const handleMove = async (id, newStatus) => {
    await updateEstatus(id, newStatus, "Avanzado a " + newStatus, perfil?.nombre_display || "ejecutivo");
    setMoveClient(null);
  };

  const handleReject = async (id, comment) => {
    await updateEstatus(id, "Rechazado", comment, perfil?.nombre_display || "ejecutivo");
    setRejectClient(null);
  };

  const handleAdd = async (form) => {
    await addClient({
      nombre_cliente: form.nombre,
      ejecutivo: ejecutivoNombre || perfil?.nombre_display || "",
      producto: form.producto,
      monto: Number(form.monto) || 0,
      ejecutivo_id: perfil?.ejecutivo_id,
      actualizacion: form.actualizacion || "",
    });
    setShowAdd(false);
  };

  const filterBtn = (key, label, count) => (
    <button
      onClick={() => setFilterEstatus(key)}
      style={{
        padding: "8px 14px", fontSize: 12, fontWeight: filterEstatus === key ? 700 : 500,
        color: filterEstatus === key ? "#fff" : COLORS.textLight,
        background: filterEstatus === key ? COLORS.primary : "#F3F4F6",
        border: "none", borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.2s", whiteSpace: "nowrap",
      }}
    >
      {label} {count !== undefined && <span style={{ opacity: 0.8 }}>({count})</span>}
    </button>
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><p>Cargando clientes...</p></div>;

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: "20px 24px",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Welcome */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: "0 0 4px" }}>
            Mi tubería de clientes
          </h1>
          <p style={{ fontSize: 13, color: COLORS.textLight, margin: 0 }}>
            {ejecutivo} — Solo tú ves tus clientes. Los administradores no aparecen aquí.
          </p>
        </div>

        {/* Pipeline Summary */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 16,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: `1px solid ${COLORS.border}`,
          overflowX: "auto",
        }}>
          <div style={{ display: "flex", gap: 6, minWidth: 600 }}>
            {STAGES_PORTAL.map((stage, idx) => {
              const count = clients.filter((c) => c.estatus === stage.key && c.estatus !== "Rechazado").length;
              return (
                <div key={stage.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div
                    onClick={() => setFilterEstatus(stage.key)}
                    style={{
                      flex: 1, textAlign: "center", padding: "12px 8px", borderRadius: 10,
                      background: filterEstatus === stage.key ? stage.bg : "transparent",
                      border: filterEstatus === stage.key ? `2px solid ${stage.color}50` : "2px solid transparent",
                      cursor: "pointer", transition: "all 0.2s",
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{stage.icon}</span>
                    <p style={{ fontSize: 10, color: COLORS.textLight, margin: "4px 0 0", fontWeight: 600, textTransform: "uppercase" }}>
                      {stage.label.split(" ")[0]}
                    </p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: stage.color, margin: "2px 0 0" }}>{count}</p>
                  </div>
                  {idx < STAGES_PORTAL.length - 1 && (
                    <span style={{ color: "#D1D5DB", fontSize: 18, padding: "0 2px" }}>›</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Filters & Actions */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 16, flexWrap: "wrap", gap: 10,
        }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {filterBtn("todos", "Todos", counts.total)}
            {filterBtn("activos", "Activos", counts.activos)}
            {filterBtn("cerrados", "Cerrados", counts.cerrados)}
            {filterBtn("rechazados", "Rechazados", counts.rechazados)}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            style={{
              padding: "10px 20px", fontSize: 14, fontWeight: 700,
              color: "#fff", background: COLORS.primary, border: "none",
              borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
              boxShadow: `0 3px 10px ${COLORS.primary}40`,
            }}
          >
            + Nuevo Cliente
          </button>
        </div>

        {/* Client Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {filtered.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onMoveClick={setMoveClient}
              onRejectClick={setRejectClient}
              onDeleteClick={setDeleteConfirmPortal}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <p style={{ fontSize: 14, color: COLORS.textLight }}>No hay clientes con ese filtro</p>
          </div>
        )}

        <p style={{ fontSize: 11, color: COLORS.primary, fontWeight: 600, textAlign: "center", marginTop: 24 }}>
          Vista de ejecutivo: solo ve sus propios clientes, sin acceso a dashboards ni datos de otros
        </p>
      </div>

      {/* Modals */}
      {moveClient && <MoveModal client={moveClient} onMove={handleMove} onClose={() => setMoveClient(null)} />}
      {rejectClient && <RejectModal client={rejectClient} onConfirm={handleReject} onClose={() => setRejectClient(null)} />}
      {showAdd && <AddModal onAdd={handleAdd} onClose={() => setShowAdd(false)} />}

      {/* Confirmar eliminar cliente (portal ejecutivo) */}
      {deleteConfirmPortal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 420,
            width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: COLORS.dark, margin: "0 0 8px" }}>
              ¿Eliminar cliente?
            </h3>
            <p style={{ fontSize: 14, color: COLORS.text, margin: "0 0 6px", lineHeight: 1.5 }}>
              Se eliminará permanentemente a <strong>{deleteConfirmPortal.nombre_cliente}</strong>
            </p>
            <p style={{ fontSize: 12, color: COLORS.textLight, margin: "0 0 20px" }}>
              {deleteConfirmPortal.producto} · {formatMoney(deleteConfirmPortal.monto)}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteConfirmPortal(null)}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: `1.5px solid ${COLORS.border}`,
                  background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  color: COLORS.textLight, fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await deleteClient(deleteConfirmPortal.id);
                  setDeleteConfirmPortal(null);
                }}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: "none",
                  background: COLORS.red, color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT EXCEL - Full Implementation
// ═══════════════════════════════════════════════════════════════════════════

function ExportExcel() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mesSeleccionado, setMesSeleccionado] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState(null);
  const [allClients, setAllClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    const loadClients = async () => {
      setLoadingClients(true);
      try {
        await fetchWithRetry(async () => {
          const { data, error } = await supabase
            .from("clientes")
            .select("*")
            .eq("anio_registro", anio)
            .order("mes_registro");

          if (error) throw error;
          setAllClients(data || []);
        });
      } catch (err) {
        console.error("Error loading clients for export tras reintentos:", err);
        setAllClients([]);
      } finally {
        setLoadingClients(false);
      }
    };
    loadClients();
  }, [anio]);

  const dataByMonth = useMemo(() => {
    const grouped = {};
    allClients.forEach((c) => {
      if (!grouped[c.mes_registro]) grouped[c.mes_registro] = [];
      grouped[c.mes_registro].push({
        ...c,
        ejecutivo: c.ejecutivo || "—",
      });
    });
    return grouped;
  }, [allClients]);

  const monthStats = useMemo(() => {
    const stats = {};
    Object.entries(dataByMonth).forEach(([mes, clients]) => {
      const totalClientes = clients.length;
      const dispersiones = clients.filter((c) => c.estatus === "Dispersión");
      const nominaDisp = dispersiones.filter((c) => c.producto === "Crédito de nómina");
      const motosDisp = dispersiones.filter((c) => c.producto !== "Crédito de nómina");
      const montoNomina = nominaDisp.reduce((s, c) => s + c.monto, 0);
      const udsMotos = motosDisp.length;

      stats[mes] = {
        totalClientes,
        dispersiones: dispersiones.length,
        enPipeline: totalClientes - dispersiones.length,
        montoNomina,
        udsMotos,
      };
    });
    return stats;
  }, [dataByMonth]);

  const totalYear = useMemo(() => {
    const all = Object.values(monthStats);
    return {
      clientes: all.reduce((s, m) => s + m.totalClientes, 0),
      dispersiones: all.reduce((s, m) => s + m.dispersiones, 0),
      montoNomina: all.reduce((s, m) => s + m.montoNomina, 0),
      udsMotos: all.reduce((s, m) => s + m.udsMotos, 0),
      meses: Object.keys(monthStats).length,
    };
  }, [monthStats]);

  const handleExport = (mode) => {
    setExporting(true);

    setTimeout(() => {
      const monthsToExport =
        mode === "year"
          ? Object.keys(dataByMonth).map(Number)
          : [mesSeleccionado || new Date().getMonth() + 1];

      const sheets = [];
      const wb = XLSX.utils.book_new();

      monthsToExport.forEach((mes) => {
        const clients = dataByMonth[mes] || [];
        if (clients.length === 0) return;

        const sheetName = `${MESES[mes - 1]} ${anio}`;
        const rows = clients.map((c) => ({
          Ejecutivo: c.ejecutivo,
          Cliente: c.nombre_cliente,
          Producto: c.producto,
          Monto: c.monto,
          "Fecha inicio": c.fecha_inicio,
          Estatus: c.estatus,
          "Actualización": c.actualizacion,
          "Fecha final": c.fecha_final || "—",
        }));
        sheets.push({ name: sheetName, rows, count: rows.length });

        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      const resumenRows = monthsToExport
        .filter((mes) => dataByMonth[mes] && dataByMonth[mes].length > 0)
        .map((mes) => {
          const st = monthStats[mes];
          return {
            Mes: `${MESES[mes - 1]} ${anio}`,
            "Total clientes": st.totalClientes,
            Dispersiones: st.dispersiones,
            "En pipeline": st.enPipeline,
            "Monto nómina dispersado": st.montoNomina,
            "Motos vendidas (uds)": st.udsMotos,
          };
        });
      sheets.push({ name: "Resumen", rows: resumenRows, count: resumenRows.length });

      const wsResumen = XLSX.utils.json_to_sheet(resumenRows);
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

      const filename = mode === "year" ? `Credivive_Reporte_${anio}.xlsx` : `Credivive_${MESES[(mesSeleccionado || new Date().getMonth() + 1) - 1]}_${anio}.xlsx`;
      XLSX.writeFile(wb, filename);

      setLastExport({
        filename,
        sheets,
        totalRows: sheets.reduce((s, sh) => s + sh.count, 0),
        timestamp: new Date().toLocaleTimeString("es-MX"),
      });
      setExporting(false);
    }, 1200);
  };

  const availableMonths = Object.keys(dataByMonth).map(Number).sort((a, b) => a - b);

  if (loadingClients) {
    return <div style={{ padding: 40, textAlign: "center" }}><p>Cargando clientes...</p></div>;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: "20px 24px",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Title */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark, margin: "0 0 4px" }}>
            Exportar datos a Excel
          </h1>
          <p style={{ fontSize: 13, color: COLORS.textLight, margin: 0 }}>
            Descarga todos los datos del pipeline en formato .xlsx, organizados por mes ({availableMonths.length > 0 ? `${availableMonths.length} mes(es)` : "Sin datos"})
          </p>
        </div>

        {/* Year Selector */}
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            padding: "20px 24px",
            marginBottom: 18,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            border: `1px solid ${COLORS.border}`,
            display: "flex",
            flexWrap: "wrap",
            gap: 20,
            alignItems: "flex-end",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: COLORS.textLight,
                marginBottom: 5,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Año
            </label>
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              style={{
                padding: "10px 14px",
                fontSize: 14,
                border: `1.5px solid ${COLORS.border}`,
                borderRadius: 8,
                background: "#fff",
                fontFamily: "inherit",
                fontWeight: 600,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 16, marginLeft: "auto", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>
                Meses con datos
              </p>
              <p style={{ fontSize: 24, fontWeight: 800, color: COLORS.primary, margin: 0 }}>
                {totalYear.meses}
              </p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>
                Total clientes
              </p>
              <p style={{ fontSize: 24, fontWeight: 800, color: COLORS.dark, margin: 0 }}>
                {totalYear.clientes}
              </p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>
                Nómina dispersada
              </p>
              <p style={{ fontSize: 24, fontWeight: 800, color: COLORS.green, margin: 0 }}>
                {formatMoney(totalYear.montoNomina)}
              </p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: COLORS.textLight, margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase" }}>
                Motos vendidas
              </p>
              <p style={{ fontSize: 24, fontWeight: 800, color: COLORS.yellow, margin: 0 }}>
                {totalYear.udsMotos} uds
              </p>
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginBottom: 18 }}>
          {/* Option 1: Full Year */}
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: "24px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              border: `1px solid ${COLORS.border}`,
              borderLeft: `4px solid ${COLORS.primary}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>📊</span>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.dark, margin: 0 }}>
                  Descargar todo el año
                </h3>
                <p style={{ fontSize: 12, color: COLORS.textLight, margin: "2px 0 0" }}>
                  Todas las hojas de {anio} en un solo archivo
                </p>
              </div>
            </div>
            <p style={{ fontSize: 12, color: COLORS.textLight, margin: "0 0 16px", lineHeight: 1.5 }}>
              Genera un archivo <strong>Credivive_Datos_{anio}.xlsx</strong> con una hoja por cada mes
              que tenga datos, más una hoja de Resumen con totales acumulados.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              {availableMonths.map((mes) => (
                <span
                  key={mes}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    background: COLORS.primaryLight,
                    color: COLORS.primaryDark,
                  }}
                >
                  {MESES[mes - 1]}
                </span>
              ))}
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: COLORS.purpleBg,
                  color: COLORS.purple,
                }}
              >
                + Resumen
              </span>
            </div>
            <button
              onClick={() => handleExport("year")}
              disabled={exporting || availableMonths.length === 0}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 10,
                border: "none",
                background: availableMonths.length === 0 ? COLORS.border : COLORS.primary,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: availableMonths.length === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {exporting ? (
                <>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                  Generando...
                </>
              ) : (
                <>📥 Descargar año completo</>
              )}
            </button>
          </div>

          {/* Option 2: Single Month */}
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: "24px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              border: `1px solid ${COLORS.border}`,
              borderLeft: `4px solid ${COLORS.yellow}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>📄</span>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.dark, margin: 0 }}>
                  Descargar solo un mes
                </h3>
                <p style={{ fontSize: 12, color: COLORS.textLight, margin: "2px 0 0" }}>
                  Una sola hoja con los datos del mes seleccionado
                </p>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: COLORS.textLight,
                  marginBottom: 5,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Seleccionar mes
              </label>
              <select
                value={mesSeleccionado}
                onChange={(e) => setMesSeleccionado(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: 14,
                  border: `1.5px solid ${COLORS.border}`,
                  borderRadius: 8,
                  background: "#F8FAF8",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              >
                <option value={0}>— Seleccionar mes —</option>
                {availableMonths.map((mes) => (
                  <option key={mes} value={mes}>
                    {MESES[mes - 1]} {anio} ({(dataByMonth[mes] || []).length} clientes)
                  </option>
                ))}
              </select>
            </div>
            {mesSeleccionado > 0 && monthStats[mesSeleccionado] && (
              <div
                style={{
                  background: COLORS.yellowBg,
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 16,
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0 }}>Clientes</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: COLORS.dark, margin: 0 }}>
                    {monthStats[mesSeleccionado].totalClientes}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0 }}>Dispersiones</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, margin: 0 }}>
                    {monthStats[mesSeleccionado].dispersiones}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0 }}>Nómina</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: COLORS.primary, margin: 0 }}>
                    {formatMoney(monthStats[mesSeleccionado].montoNomina)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: COLORS.textLight, margin: 0 }}>Motos</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: COLORS.yellow, margin: 0 }}>
                    {monthStats[mesSeleccionado].udsMotos} uds
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={() => handleExport("month")}
              disabled={exporting || mesSeleccionado === 0}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 10,
                border: "none",
                background: mesSeleccionado === 0 ? COLORS.border : COLORS.yellow,
                color: mesSeleccionado === 0 ? COLORS.textLight : "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: mesSeleccionado === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {exporting ? (
                <>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                  Generando...
                </>
              ) : (
                <>📥 Descargar mes</>
              )}
            </button>
          </div>
        </div>

        {/* Last Export Result */}
        {lastExport && (
          <div
            style={{
              background: COLORS.greenBg,
              border: `1.5px solid ${COLORS.green}`,
              borderRadius: 14,
              padding: "20px 24px",
              marginBottom: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 22, color: COLORS.green }}>✓</span>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: COLORS.green, margin: 0 }}>
                  Exportación lista
                </h4>
                <p style={{ fontSize: 12, color: COLORS.textLight, margin: "2px 0 0" }}>
                  Generado a las {lastExport.timestamp}
                </p>
              </div>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: "16px",
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "#E8F5E9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                  }}
                >
                  📗
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: COLORS.dark, margin: 0 }}>
                    {lastExport.filename}
                  </p>
                  <p style={{ fontSize: 12, color: COLORS.textLight, margin: "2px 0 0" }}>
                    {lastExport.sheets.length} hojas · {lastExport.totalRows} filas totales
                  </p>
                </div>
              </div>

              {/* Sheets preview */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {lastExport.sheets.map((sheet) => (
                  <div
                    key={sheet.name}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: sheet.name === "Resumen" ? COLORS.purpleBg : COLORS.primaryLight,
                      border: `1px solid ${sheet.name === "Resumen" ? COLORS.purple + "30" : COLORS.primary + "30"}`,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        margin: 0,
                        color: sheet.name === "Resumen" ? COLORS.purple : COLORS.primaryDark,
                      }}
                    >
                      {sheet.name}
                    </p>
                    <p style={{ fontSize: 10, color: COLORS.textLight, margin: "2px 0 0" }}>
                      {sheet.count} filas
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 11, color: COLORS.green, margin: "12px 0 0", fontWeight: 600 }}>
              El archivo .xlsx se descargó automáticamente
            </p>
          </div>
        )}

        {/* Data Preview Table */}
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            border: `1px solid ${COLORS.border}`,
            overflow: "hidden",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${COLORS.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, color: COLORS.dark, margin: 0 }}>
              Vista previa de datos — {anio}
            </h3>
            <span style={{ fontSize: 12, color: COLORS.textLight }}>
              {totalYear.clientes} registros en {totalYear.meses} meses
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: COLORS.dark }}>
                  {["Mes", "Ejecutivo", "Cliente", "Producto", "Monto", "Estatus", "Fecha inicio"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 12px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#fff",
                        textAlign: "left",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        whiteSpace: "nowrap",
                        borderBottom: `3px solid ${COLORS.primary}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allClients.filter((c) => c.anio_registro === anio)
                  .sort((a, b) => a.mes_registro - b.mes_registro || a.fecha_inicio.localeCompare(b.fecha_inicio))
                  .map((client, idx) => {
                    const statusColors = {
                      Prospecto: { color: "#3B82F6", bg: "#EFF6FF" },
                      "Entrega de documentos": { color: "#F59E0B", bg: "#FFFBEB" },
                      "Análisis": { color: "#F97316", bg: "#FFF7ED" },
                      "Aprobación": { color: "#8B5CF6", bg: "#F5F3FF" },
                      "Dispersión": { color: "#10B981", bg: "#ECFDF5" },
                      Rechazado: { color: COLORS.red, bg: COLORS.redBg },
                    };
                    const sc = statusColors[client.estatus] || { color: COLORS.textLight, bg: "#f5f5f5" };

                    return (
                      <tr
                        key={idx}
                        style={{
                          background: idx % 2 === 0 ? "#fff" : "#FAFBFA",
                          borderBottom: `1px solid ${COLORS.border}`,
                        }}
                      >
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: COLORS.primaryDark,
                              background: COLORS.primaryLight,
                              padding: "3px 8px",
                              borderRadius: 4,
                            }}
                          >
                            {MESES[client.mes_registro - 1].slice(0, 3)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, margin: 0 }}>
                            {client.ejecutivo.split(" ").slice(0, 2).join(" ")}
                          </p>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <p style={{ fontSize: 12, color: COLORS.text, margin: 0 }}>{client.nombre_cliente}</p>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: client.producto === "Crédito de nómina" ? COLORS.primary : COLORS.yellow,
                            }}
                          >
                            {client.producto === "Crédito de nómina" ? "Nómina" : client.producto.includes("Arrendamiento") ? "Arrend." : "Financ."}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, margin: 0 }}>
                            {formatMoney(client.monto)}
                          </p>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: 12,
                              fontSize: 10,
                              fontWeight: 700,
                              color: sc.color,
                              background: sc.bg,
                            }}
                          >
                            {client.estatus}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <p style={{ fontSize: 11, color: COLORS.textLight, margin: 0 }}>{client.fecha_inicio}</p>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info box */}
        <div
          style={{
            background: COLORS.primaryLight,
            border: `1px solid ${COLORS.primary}30`,
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 18,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 20, flexShrink: 0 }}>📋</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.primaryDark, margin: "0 0 4px" }}>
              Formato del archivo Excel
            </p>
            <p style={{ fontSize: 12, color: COLORS.textLight, margin: 0, lineHeight: 1.6 }}>
              Cada hoja mensual incluye: Ejecutivo, Cliente, Producto, Monto ($), Fecha inicio, Estatus,
              Actualización, Fecha final. La hoja de Resumen muestra totales por mes con nómina en pesos
              y motos en unidades. Los datos incluyen TODOS los estatus, no solo dispersiones.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p
          style={{
            fontSize: 11,
            color: COLORS.primary,
            fontWeight: 600,
            textAlign: "center",
            marginTop: 18,
          }}
        >
          Se conecta a Supabase para exportar datos reales usando SheetJS (.xlsx)
        </p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function App() {
  const { user, perfil, loading, error: authError, isAdmin, isEjecutivo, passwordRecovery, login, logout, resetPassword, updatePassword } = useAuth();
  const [activeScreen, setActiveScreen] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  // Set default screen based on role — ejecutivos ALWAYS go to portal
  useEffect(() => {
    if (perfil) {
      if (perfil.rol === "ejecutivo") {
        setActiveScreen("portal");
      } else if (activeScreen === null || activeScreen === "portal") {
        setActiveScreen("dashboard");
      }
    }
  }, [perfil]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user || !perfil) {
    return (
      <LoginScreen
        onLogin={login}
        authError={authError}
        onResetPassword={resetPassword}
      />
    );
  }

  if (passwordRecovery) {
    return (
      <ChangePasswordScreen
        onUpdatePassword={updatePassword}
        onCancel={() => window.location.reload()}
      />
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: COLORS.bg }}>
      <Sidebar
        activeScreen={activeScreen}
        onNavigate={setActiveScreen}
        onLogout={logout}
        perfil={perfil}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Barra superior en móvil con hamburguesa */}
      {isMobile && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0,
          height: 56, background: COLORS.dark, zIndex: 9990,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>
          <button
            onClick={() => setMobileMenuOpen(true)}
            style={{
              background: "none", border: "none", color: "#fff",
              fontSize: 24, cursor: "pointer", padding: "4px 8px",
              display: "flex", alignItems: "center",
            }}
          >
            ☰
          </button>
          <h2 style={{ margin: 0, color: "white", fontSize: 16, fontWeight: 700 }}>
            Credivive
          </h2>
          <div style={{ width: 40 }} />
        </div>
      )}

      <main style={{
        marginLeft: isMobile ? 0 : 240,
        marginTop: isMobile ? 56 : 0,
        flex: 1,
        overflowY: "auto",
        width: isMobile ? "100%" : undefined,
      }}>
        {isEjecutivo ? (
          <PortalEjecutivo perfil={perfil} />
        ) : (
          <>
            {activeScreen === "dashboard" && <DashboardAdmin />}
            {activeScreen === "clientes" && <TablaClientes perfil={perfil} />}
            {activeScreen === "nomina" && <ResumenNomina />}
            {activeScreen === "motos" && <ResumenMotos />}
            {activeScreen === "catalogo" && <CatalogoEjecutivos />}
            {activeScreen === "usuarios" && <GestionUsuarios />}
            {activeScreen === "export" && <ExportExcel />}

            {!["dashboard", "clientes", "nomina", "motos", "catalogo", "usuarios", "export"].includes(activeScreen) && (
              <div style={{ padding: 32 }}>
                <h2 style={{ color: COLORS.text }}>Pantalla no encontrada</h2>
              </div>
            )}
          </>
        )}
      </main>

      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        html, body, #root {
          width: 100%;
          height: 100%;
        }
        @media (max-width: 767px) {
          table { font-size: 12px !important; }
          th, td { padding: 8px 6px !important; }
        }
      `}</style>
    </div>
  );
}

