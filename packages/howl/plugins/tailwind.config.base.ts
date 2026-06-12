import type { Config } from "tailwindcss";

/**
 * Base Tailwind config for howl apps.
 * Extend this in your app's tailwind.config.ts.
 *
 * @example
 * import { baseConfig } from "@howl/plugins/tailwind-config";
 * import daisyui from "daisyui";
 *
 * export default {
 *   ...baseConfig,
 *   content: [
 *     ...baseConfig.content,
 *     "./components/**\/*.{ts,tsx}",
 *   ],
 *   plugins: [daisyui],
 * } satisfies Config;
 */
export const baseConfig: Config = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./layouts/**/*.{ts,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      keyframes: {
        bounceOnce: {
          "0%, 100%": { transform: "scale(1)" },
          "30%": { transform: "scale(1.1)" },
          "60%": { transform: "scale(0.95)" },
        },
      },
      animation: {
        "bounce-once": "bounceOnce 0.4s cubic-bezier(.68,-0.55,.27,1.55)",
      },
    },
  },
};
