import { Howl } from "@hushkey/howl";
import { apiConfig, type State } from "../howl.config.ts";

export const app = new Howl<State>({
  logger: true,
  debug: true,
});

app.get("/", (ctx) => {
  return ctx.html(`
    <h1>@hushkey service layer — three domains, three databases</h1>
    <ul>
      <li><code>users</code> — SQLite (node:sqlite) · <a href="/api/users">GET /api/users</a> · POST /api/users/create</li>
      <li><code>blogs</code> — Postgres (PG_URL or PGlite) · <a href="/api/blogs">GET /api/blogs</a> · POST /api/blogs/create</li>
      <li><code>reviews</code> — MongoDB (MONGO_URL) · <a href="/api/reviews">GET /api/reviews</a> · POST /api/reviews/create</li>
    </ul>
    <p><a href="/api/demo/flow">GET /api/demo/flow</a> — one scenario across all three databases:
    a SQLite author writes Postgres blogs that get MongoDB reviews, with operator queries,
    optimistic locking, and soft delete/restore along the way.</p>
  `);
});

app.fsApiRoutes(apiConfig);

export default { app };
