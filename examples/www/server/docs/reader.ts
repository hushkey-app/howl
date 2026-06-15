import manifestJson from "./manifest.json" with { type: "json" };
import gettingStarted from "./getting-started.json" with { type: "json" };
import routing from "./routing.json" with { type: "json" };
import apiRoutes from "./api-routes.json" with { type: "json" };
import context from "./context.json" with { type: "json" };
import middlewares from "./middlewares.json" with { type: "json" };
import sse from "./sse.json" with { type: "json" };
import cacheAdapters from "./cache-adapters.json" with { type: "json" };
import rateLimiting from "./rate-limiting.json" with { type: "json" };
import configuration from "./configuration.json" with { type: "json" };
import websockets from "./websockets.json" with { type: "json" };
import performance from "./performance.json" with { type: "json" };
import plugins from "./plugins.json" with { type: "json" };

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

export interface ManifestItem {
  slug: string;
  title: string;
  description: string;
  order: number;
}

const DOC_REGISTRY: Record<string, DocPage> = {
  "getting-started": gettingStarted as unknown as DocPage,
  "configuration": configuration as unknown as DocPage,
  "routing": routing as unknown as DocPage,
  "api-routes": apiRoutes as unknown as DocPage,
  "context": context as unknown as DocPage,
  "middlewares": middlewares as unknown as DocPage,
  "sse": sse as unknown as DocPage,
  "cache-adapters": cacheAdapters as unknown as DocPage,
  "rate-limiting": rateLimiting as unknown as DocPage,
  "websockets": websockets as unknown as DocPage,
  "performance": performance as unknown as DocPage,
  "plugins": plugins as unknown as DocPage,
};

export function readManifest(): ManifestItem[] {
  return (manifestJson as ManifestItem[]).sort((a, b) => a.order - b.order);
}

export function readDoc(slug: string): DocPage | null {
  const safe = slug.replace(/[^a-z0-9-]/g, "");
  return DOC_REGISTRY[safe] ?? null;
}
