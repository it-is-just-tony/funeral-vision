// Theme colors matching the actual Funeral Vision product
export const THEME = {
  // Primary brand colors (pink gradient)
  pink: "#e96089",
  pinkLight: "#e189a4",

  // Background colors (dark theme)
  bgPrimary: "#0D1117",
  bgSecondary: "#161b22",
  bgCard: "rgba(31, 41, 55, 0.5)",
  bgHover: "#374151",
  bgInput: "#1f2937",

  // Border colors
  border: "#374151",
  borderInput: "#4b5563",

  // Text colors
  textPrimary: "rgba(255, 255, 255, 0.87)",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",

  // Semantic colors
  green: "#22c55e",
  red: "#ef4444",
  greenDark: "#16a34a",
  redDark: "#dc2626",

  // Terminal colors
  terminalBg: "#0d0e14",
  terminalGreen: "#9ece6a",
  terminalCyan: "#7dcfff",
  terminalPurple: "#bb9af7",
  terminalYellow: "#e0af68",
  terminalGray: "#565f89",
} as const;

// Font family matching the product
export const FONT = {
  sans: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
  mono: "'Fira Code', 'JetBrains Mono', 'SF Mono', Consolas, monospace",
} as const;
