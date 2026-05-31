import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light theme with cyan/green accent (#00FFAA). See docs/LANDING.md.
        accent: {
          DEFAULT: "#00FFAA",
          strong: "#00B37A", // readable accent text/links on light bg
          ink: "#04261C", // text on top of an accent fill
        },
        bg: {
          DEFAULT: "#FFFFFF",
          subtle: "#F6FAF8",
        },
        surface: "#FFFFFF",
        border: "#E4EBE8",
        text: {
          DEFAULT: "#0B1F1A",
          muted: "#5B6B66",
        },
      },
      borderRadius: {
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
