import { Howl, HttpError, staticFiles } from "@hushkey/howl";
import { compression } from "@hushkey/howl/middleware";
import { reactEngine } from "@hushkey/howl-react";
import type { State } from "../howl.config.ts";
import { EMAIL, NAME, ORIGIN } from "../shared/profile.ts";
import { getProject } from "../shared/projects/index.ts";

export const app = new Howl<State>({
  logger: true,
  debug: true,
  engines: { react: reactEngine() },
});

app.use(staticFiles());
app.use(compression());

app.use((ctx) => {
  ctx.state.client = {
    name: NAME,
    origin: Deno.env.get("SITE_ORIGIN") ?? ORIGIN,
    email: EMAIL,
  };
  return ctx.next();
});

/**
 * `pages/[project]/` mounts at the URL root, so without this guard every
 * unknown first-level path would render a blank project shell with a 200.
 * Anything that is not a real slug — or asks for a sub-page the project does
 * not host — is a 404 before the render pipeline is entered.
 */
app.use((ctx) => {
  const segments = ctx.url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return ctx.next();

  const project = getProject(segments[0]);
  if (!project) throw new HttpError(404, "Not found");

  const sub = segments[1];
  if (sub && !project.support) throw new HttpError(404, "Not found");
  if (sub && sub !== "privacy" && sub !== "support") throw new HttpError(404, "Not found");
  if (segments.length > 2) throw new HttpError(404, "Not found");

  return ctx.next();
});

app.fsClientRoutes();

export default { app };
