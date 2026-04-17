import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: "#080B0F",
          surface: "#0E1318",
          elevated: "#141B24",
          border: "#1A2232",
          "border-bright": "#243044",
        },
        amber: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
          800: "#92400E",
          900: "#78350F",
        },
        ink: {
          primary: "#CDD5E0",
          secondary: "#7A8499",
          dim: "#3D4A5E",
          muted: "#1E2736",
        },
        signal: {
          green: "#10B981",
          "green-dim": "#064E3B",
          red: "#EF4444",
          "red-dim": "#7F1D1D",
          blue: "#3B82F6",
          "blue-dim": "#1E3A5F",
          yellow: "#EAB308",
          "yellow-dim": "#713F12",
        },
      },
      fontFamily: {
        display: ["var(--font-syne)", "sans-serif"],
        body: ["var(--font-outfit)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      animation: {
        "pulse-amber": "pulse-amber 2s ease-in-out infinite",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "slide-up": "slide-up 0.4s ease-out forwards",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "scan": "scan 8s linear infinite",
      },
      keyframes: {
        "pulse-amber": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(245, 158, 11, 0.4)" },
          "50%": { opacity: "0.8", boxShadow: "0 0 0 6px rgba(245, 158, 11, 0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "scan": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
