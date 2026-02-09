export const COLORS = {
  primary: "#1DB954",
  primaryDark: "#168F40",
  primaryLight: "#E8F8EF",
  dark: "#1A1A2E",
  darkMid: "#2D2D44",
  bg: "#F5F7F5",
  card: "#FFFFFF",
  text: "#1A1A2E",
  textLight: "#6B7280",
  border: "#E2E8F0",
  error: "#E74C3C",
  inputBg: "#F8FAF8",
  red: "#EF4444",
  redBg: "#FEF2F2",
  yellow: "#F59E0B",
  yellowBg: "#FFFBEB",
  green: "#10B981",
  greenBg: "#ECFDF5",
  blue: "#3B82F6",
  blueBg: "#EFF6FF",
  purple: "#8B5CF6",
  purpleBg: "#F5F3FF",
  orange: "#F97316",
  orangeBg: "#FFF7ED",
  moto: "#F59E0B",
  motoBg: "#FFFBEB",
};

export const STATUS_CONFIG = {
  Prospecto: { color: "#3B82F6", bg: "#EFF6FF", label: "Prospecto" },
  "Entrega de documentos": { color: "#F59E0B", bg: "#FFFBEB", label: "Entrega docs" },
  Análisis: { color: "#F97316", bg: "#FFF7ED", label: "Análisis" },
  Aprobación: { color: "#8B5CF6", bg: "#F5F3FF", label: "Aprobación" },
  Dispersión: { color: "#10B981", bg: "#ECFDF5", label: "Dispersión" },
  Rechazado: { color: "#EF4444", bg: "#FEF2F2", label: "Rechazado" },
};

export const PRODUCTOS = [
  "Crédito de nómina",
  "Arrendamiento de motos",
  "Financiamiento de motos",
];

export const ESTATUS_LIST = [
  "Prospecto",
  "Entrega de documentos",
  "Análisis",
  "Aprobación",
  "Dispersión",
];

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function formatMoney(num) {
  if (!num && num !== 0) return "$0";
  return "$" + Number(num).toLocaleString("es-MX");
}

export function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

export function pctColor(pct) {
  if (pct >= 80) return { color: COLORS.green, bg: COLORS.greenBg };
  if (pct >= 50) return { color: COLORS.yellow, bg: COLORS.yellowBg };
  return { color: COLORS.red, bg: COLORS.redBg };
}

export function getTimeSinceUpdate(estatus_updated_at) {
  if (!estatus_updated_at) return { text: "—", color: COLORS.textLight, days: null };

  const last = new Date(estatus_updated_at);
  const now = new Date();
  const diffMs = now - last;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  let text, color;

  if (diffDays === 0) {
    text = diffHours <= 1 ? "Hace poco" : `${diffHours}h`;
    color = COLORS.green;
  } else if (diffDays === 1) {
    text = "1 día";
    color = COLORS.green;
  } else if (diffDays <= 3) {
    text = `${diffDays} días`;
    color = COLORS.yellow;
  } else if (diffDays <= 6) {
    text = `${diffDays} días`;
    color = COLORS.orange;
  } else {
    text = `${diffDays} días`;
    color = COLORS.red;
  }

  return { text, color, days: diffDays };
}
