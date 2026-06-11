import type { Config } from "tailwindcss";

/** Colors reference CSS variables (RGB channels) so light/dark swap by theme
 *  and Tailwind's /opacity modifiers keep working. See app/globals.css. */
const withVar = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter var",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      colors: {
        accent: {
          DEFAULT: withVar("--accent"),
          strong: withVar("--accent-strong"),
          ink: withVar("--accent-ink"),
        },
        bg: {
          DEFAULT: withVar("--bg"),
          subtle: withVar("--bg-subtle"),
        },
        surface: withVar("--surface"),
        border: withVar("--border"),
        text: {
          DEFAULT: withVar("--text"),
          muted: withVar("--text-muted"),
        },
      },
      borderRadius: {
        "2xl": "1rem",
      },
      boxShadow: {
        // Soft, theme-agnostic elevation tuned for light surfaces.
        card: "0 1px 2px rgb(11 31 26 / 0.04), 0 4px 16px -6px rgb(11 31 26 / 0.10)",
        "card-hover": "0 2px 4px rgb(11 31 26 / 0.06), 0 12px 28px -8px rgb(11 31 26 / 0.18)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.30), 0 8px 30px -8px rgb(var(--accent) / 0.35)",
        "inner-top": "inset 0 1px 0 0 rgb(255 255 255 / 0.04)",
      },
      backgroundImage: {
        "accent-gradient":
          "linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--accent-strong)) 100%)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "pop-in": "pop-in 0.18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
