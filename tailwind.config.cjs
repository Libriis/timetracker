// CommonJS on purpose: Node 22+ loads an ESM config through require(esm) and caches it for the
// life of the dev server, so edits to an ESM tailwind.config.js never reach a running Vite.
const animate = require("tailwindcss-animate");

// Every color is a CSS variable (RGB channels) defined in src/index.css for the light and dark theme.
// `rgb(var(--x) / <alpha-value>)` keeps opacity modifiers working: bg-brand/10, border-fg/20 ...
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"Geist Mono Variable"', "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "14px", letterSpacing: "0.01em" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        md: ["15px", { lineHeight: "22px" }],
        lg: ["17px", { lineHeight: "24px", letterSpacing: "-0.01em" }],
        xl: ["20px", { lineHeight: "28px", letterSpacing: "-0.015em" }],
        "2xl": ["24px", { lineHeight: "30px", letterSpacing: "-0.02em" }],
        "3xl": ["30px", { lineHeight: "36px", letterSpacing: "-0.025em" }],
        "4xl": ["38px", { lineHeight: "42px", letterSpacing: "-0.03em" }],
      },
      colors: {
        // App semantic tokens
        canvas: v("canvas"),
        sidebar: { DEFAULT: v("sidebar"), fg: v("sidebar-fg"), muted: v("sidebar-muted"), hover: v("sidebar-hover"), active: v("sidebar-active"), border: v("sidebar-border") },
        surface: { DEFAULT: v("surface"), 2: v("surface-2"), 3: v("surface-3"), raised: v("surface-raised") },
        line: { DEFAULT: v("line"), strong: v("line-strong") },
        fg: { DEFAULT: v("fg"), muted: v("fg-muted"), subtle: v("fg-subtle"), faint: v("fg-faint") },
        brand: { DEFAULT: v("brand"), hover: v("brand-hover"), text: v("brand-text"), soft: v("brand-soft"), fg: v("brand-fg") },
        ai: { DEFAULT: v("ai"), text: v("ai-text"), soft: v("ai-soft") },
        free: { DEFAULT: v("free"), text: v("free-text"), soft: v("free-soft") },
        invoiced: { DEFAULT: v("invoiced"), text: v("invoiced-text"), soft: v("invoiced-soft") },
        unbilled: v("unbilled"),
        danger: { DEFAULT: v("danger"), hover: v("danger-hover"), text: v("danger-text"), soft: v("danger-soft") },
        warning: { DEFAULT: v("warning"), text: v("warning-text"), soft: v("warning-soft") },
        success: { DEFAULT: v("free"), text: v("free-text"), soft: v("free-soft") },
        // shadcn/ui aliases so ported 21st.dev components work unchanged.
        // NOTE: shadcn's `accent` is a subtle hover surface, NOT the brand color (use `brand`).
        background: v("canvas"),
        foreground: v("fg"),
        card: { DEFAULT: v("surface"), foreground: v("fg") },
        popover: { DEFAULT: v("surface-raised"), foreground: v("fg") },
        // Neutral "do it" color (graphite in light, near-white in dark). Buttons, selected states, checkmarks.
        primary: { DEFAULT: v("primary"), hover: v("primary-hover"), fg: v("primary-fg"), foreground: v("primary-fg") },
        secondary: { DEFAULT: v("surface-3"), foreground: v("fg") },
        muted: { DEFAULT: v("surface-3"), foreground: v("fg-muted") },
        accent: { DEFAULT: v("surface-3"), foreground: v("fg") },
        destructive: { DEFAULT: v("danger"), foreground: "rgb(255 255 255 / <alpha-value>)" },
        border: v("line"),
        input: v("line-strong"),
        ring: v("ring"),
      },
      borderRadius: {
        // Tailwind defaults kept (md 6px, lg 8px, xl 12px, 2xl 16px); these are named aliases.
        control: "8px",
        card: "12px",
        dialog: "16px",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        card: "var(--shadow-card)",
        brand: "var(--shadow-brand)",
        focus: "0 0 0 3px rgb(var(--ring) / 0.22)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
      },
      keyframes: {
        "pulse-dot": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--brand) / 0.55)" },
          "70%": { boxShadow: "0 0 0 6px rgb(var(--brand) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--brand) / 0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.8s cubic-bezier(0.23, 1, 0.32, 1) infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [animate],
};
