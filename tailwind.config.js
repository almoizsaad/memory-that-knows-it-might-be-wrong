/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Memory-status palette — the five statuses a record can carry.
           Color always appears next to the status word and the confidence
           number that produced it, never as the only signal. */
        mem: {
          active: "#3FB27F",
          "active-dim": "rgba(63,178,127,0.14)",
          verify: "#C9A227",
          "verify-dim": "rgba(201,162,39,0.14)",
          superseded: "#5B8DEF",
          "superseded-dim": "rgba(91,141,239,0.14)",
          revoked: "#E15554",
          "revoked-dim": "rgba(225,85,84,0.14)",
          expired: "#8B92A3",
          "expired-dim": "rgba(139,146,163,0.14)",
        },
        ink: {
          950: "#0D0F14",
          900: "#12141A",
          800: "#181B22",
          700: "#1E222B",
          600: "#262B36",
          500: "#333A48",
          400: "#4A5263",
          300: "#6B7386",
          200: "#8B92A3",
          100: "#B7BCC8",
          50: "#EDEEF2",
        },
        signal: {
          DEFAULT: "#2FA8A0",
          dim: "rgba(47,168,160,0.14)",
        },
      },
      fontFamily: {
        serif: ['"Source Serif 4"', "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"IBM Plex Mono"', '"Courier New"', "monospace"],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
