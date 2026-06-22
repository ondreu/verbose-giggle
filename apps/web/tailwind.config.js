/** @type {import('tailwindcss').Config} */
// Dark-fantasy theme (Appendix A). Colors reference CSS custom properties so
// the palette lives in one place (theme/tokens.css). Primary accent is aged
// GOLD — never purple; mauve ("arcane") is reserved for magic semantics only.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Replace the default palette entirely so no stray indigo/violet leaks in.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      bg: { base: "var(--bg-base)", mantle: "var(--bg-mantle)", crust: "var(--bg-crust)" },
      surface: { 0: "var(--surface0)", 1: "var(--surface1)", 2: "var(--surface2)" },
      text: "var(--text)",
      subtext1: "var(--subtext1)",
      subtext0: "var(--subtext0)",
      gold: "var(--gold)",
      ember: "var(--ember)",
      blood: "var(--blood)",
      steel: "var(--steel)",
      verdigris: "var(--verdigris)",
      parchment: "var(--parchment)",
      ink: "var(--ink)",
      arcane: "var(--arcane)",
      bone: "var(--bone)",
    },
    fontFamily: {
      // Display serif with a point of view + readable body serif. Never Inter.
      display: ['"Cinzel"', "Marcellus", "serif"],
      body: ['"EB Garamond"', '"Crimson Pro"', "Georgia", "serif"],
      // Condensed numeric face for the dice log's mechanical detail.
      log: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
    },
    // A real radius scale — mostly tight/squared for a fantasy-document feel.
    borderRadius: {
      none: "0",
      sm: "2px",
      DEFAULT: "3px",
      md: "4px",
      lg: "6px",
      full: "9999px",
    },
    extend: {
      boxShadow: {
        // Warm candlelit lift, not cold neutral drop shadows.
        panel: "0 1px 0 rgba(232,224,211,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.8)",
        ring: "0 0 0 1px var(--gold), 0 0 12px -2px var(--gold)",
      },
    },
  },
  plugins: [],
};
