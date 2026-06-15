// Browser entry for standalone mode: the middleware bundles this on first
// request (react externalized to an import map) and serves it as bundle.js.
import { createRoot } from "react-dom/client";
import { Studio } from "./studio.tsx";
import type { StudioStyle } from "./studio.tsx";

const config =
  (globalThis as { __STUDIO__?: { endpoint?: string; style?: StudioStyle } }).__STUDIO__ ?? {};
const root = document.getElementById("studio-root");
if (root) {
  createRoot(root).render(<Studio endpoint={config.endpoint} style={config.style} fullscreen />);
}
