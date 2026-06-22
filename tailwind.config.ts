import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#7c3aed",
          50: "#f5f3ff",
          100: "#ede9fe",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
        },
      },
    },
  },
  plugins: [],
};

export default config;
