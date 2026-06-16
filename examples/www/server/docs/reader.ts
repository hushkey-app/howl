import manifestJson from "./manifest.json" with { type: "json" };
import gettingStarted from "./getting-started.json" with { type: "json" };
import configuration from "./configuration.json" with { type: "json" };
import routing from "./routing.json" with { type: "json" };
import pages from "./pages.json" with { type: "json" };
import context from "./context.json" with { type: "json" };
import apiRoutes from "./api-routes.json" with { type: "json" };
import rateLimiting from "./rate-limiting.json" with { type: "json" };
import caching from "./caching.json" with { type: "json" };
import middlewares from "./middlewares.json" with { type: "json" };
import websockets from "./websockets.json" with { type: "json" };
import sse from "./sse.json" with { type: "json" };
import services from "./services.json" with { type: "json" };
import plugins from "./plugins.json" with { type: "json" };
import deployment from "./deployment.json" with { type: "json" };

export type BlockType =
  | { type: "p"; text: string }
  | { type: "code"; lang: string; text: string; filename?: string }
  | { type: "h3"; text: string }
  | { type: "tip"; text: string }
  | { type: "warning"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface DocSection {
  id: string;
  heading: string;
  blocks: BlockType[];
}

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  sections: DocSection[];
}

export type DocCategory = "overview" | "frontend" | "backend";

export interface ManifestItem {
  slug: string;
  title: string;
  description: string;
  category: DocCategory;
  order: number;
}

/** Ordered category metadata — drives menu dividers and section headings. */
export const DOC_CATEGORIES: { id: DocCategory; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "frontend", label: "Frontend" },
  { id: "backend", label: "Backend" },
];

const CATEGORY_ORDER: Record<DocCategory, number> = {
  overview: 0,
  frontend: 1,
  backend: 2,
};

/** A category with its docs, ready to render as a menu section. */
export interface DocGroup {
  id: DocCategory;
  label: string;
  items: ManifestItem[];
}

/**
 * The manifest grouped by category, in category order, with each group's
 * items sorted by their `order`. Empty groups are omitted.
 */
export function readManifestGrouped(): DocGroup[] {
  const items = readManifest();
  return DOC_CATEGORIES.map((cat) => ({
    id: cat.id,
    label: cat.label,
    items: items.filter((item) => item.category === cat.id),
  })).filter((group) => group.items.length > 0);
}

const DOC_REGISTRY: Record<string, DocPage> = {
  "getting-started": gettingStarted as unknown as DocPage,
  "configuration": configuration as unknown as DocPage,
  "routing": routing as unknown as DocPage,
  "pages": pages as unknown as DocPage,
  "context": context as unknown as DocPage,
  "api-routes": apiRoutes as unknown as DocPage,
  "rate-limiting": rateLimiting as unknown as DocPage,
  "caching": caching as unknown as DocPage,
  "middlewares": middlewares as unknown as DocPage,
  "websockets": websockets as unknown as DocPage,
  "sse": sse as unknown as DocPage,
  "services": services as unknown as DocPage,
  "plugins": plugins as unknown as DocPage,
  "deployment": deployment as unknown as DocPage,
};

export function readManifest(): ManifestItem[] {
  return (manifestJson as ManifestItem[])
    .slice()
    .sort((a, b) =>
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.order - b.order
    );
}

export function readDoc(slug: string): DocPage | null {
  const safe = slug.replace(/[^a-z0-9-]/g, "");
  return DOC_REGISTRY[safe] ?? null;
}
