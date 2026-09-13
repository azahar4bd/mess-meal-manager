import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-bengali)",
          "Noto Sans Bengali",
          "Hind Siliguri",
          "SolaimanLipi",
          "Kalpurush",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          50: "#eef7f2",
          100: "#d6ecdf",
          200: "#aed9c0",
          300: "#7dc09c",
          400: "#4fa478",
          500: "#2f8a5e",
          600: "#226e4a",
          700: "#1c583d",
          800: "#184632",
          900: "#143a2a",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
      },
    },
  },
  plugins: [],
};

export default config;
