import type { Config } from "tailwindcss";

// Design tokens, grounded in the PriceBook brand (navy shield + green value marks):
// - ink:    the deep navy from the logo, used for chrome, headings, primary actions
// - field:  a warm paper background, not stark white — a receipt/ledger feel
// - value:  the green that means "cheaper" throughout the product
// - flag:   a warm amber used ONLY for the single cheapest result in a list
// - line:   hairline dividers for the price-ledger rows
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#16223F",
          soft: "#2C3A5E"
        },
        field: {
          DEFAULT: "#F6F5F1",
          raised: "#FFFFFF"
        },
        value: {
          DEFAULT: "#1F8A5F",
          soft: "#DCEEE3"
        },
        flag: "#D98A2B",
        line: "#E4E2DA",
        ash: "#5B6472"
      },
      fontFamily: {
        display: ["'Space Grotesk'", "ui-sans-serif", "system-ui"],
        body: ["'Inter'", "ui-sans-serif", "system-ui"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"]
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        lg: "10px"
      }
    }
  },
  plugins: []
};

export default config;
