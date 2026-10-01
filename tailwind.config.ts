import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

// Design tokens, grounded in the PriceBook brand (dark-teal shield + orange value marks):
// - ink:     the deep teal from the logo shield and the sidebar's base color.
//            Primary buttons use it too, so they match the sidebar — .soft is
//            the lighter shade (also the sidebar's top band) used for hover,
//            .dark is a darker shade used for active/pressed
// - field:   a warm paper background, not stark white — a receipt/ledger feel
// - value:   the orange that means "cheaper"/price-drop throughout the product
// - flag:    a warm amber used ONLY for the single cheapest result in a list
// - line:    hairline dividers for the price-ledger rows
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#00333E",
          soft: "#135E78",
          dark: "#001A20"
        },
        field: {
          DEFAULT: "#F6F5F1",
          raised: "#FFFFFF"
        },
        value: {
          DEFAULT: "#FF5700",
          soft: "#FFE4D6"
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
  plugins: [
    // Redefines `hover:` everywhere in the app to only fire for a real mouse
    // (hover: hover, pointer: fine). Without this, tapping a button on a
    // touchscreen triggers :hover with no mouse-leave to clear it afterward,
    // so the button is stuck showing its hover color until something else
    // is tapped — this is what made "Search items" look permanently green
    // instead of only on hover.
    plugin(({ addVariant }) => {
      addVariant("hover", "@media (hover: hover) and (pointer: fine) { &:hover }");
    })
  ]
};

export default config;
