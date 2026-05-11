import type { Config } from "tailwindcss";
import daisyui from "daisyui";

export default {
  content: [
    "client/{pages,islands,components}/**/*.{ts,tsx}",
  ],
  plugins: [daisyui],
  darkMode: ["class", '[data-theme="dark"]'],
} satisfies Config;
