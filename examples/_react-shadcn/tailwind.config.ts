import type { Config } from "tailwindcss";

// Tailwind v4 is CSS-first: tokens + dark variant live in `static/style.css`,
// and v4 auto-detects class usage across the project. This file is kept only
// as a familiar place to extend `content` globs / theme if you need to.
export default {
  content: [
    "client/{pages,components,layouts,lib}/**/*.{js,jsx,ts,tsx}",
    "./**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: ["class"],
} satisfies Config;
