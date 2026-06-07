# software-www

**SOFTWARE by Hushkey** — the studio site listing the products we ship. A single Howl app, Tailwind
v4 + daisyUI, JSON-driven, with status-aware product cards that drill into per-product detail pages.

## Setup

```sh
deno install
cp .env.example .env
deno task dev
```

Open <http://127.0.0.1:8000>.

## Environment

| Variable        | Default     | Purpose                             |
| --------------- | ----------- | ----------------------------------- |
| `APP_NAME`      | `Software`  | Brand title — shown in header / tab |
| `DENO_PORT`     | `8000`      | Dev / start server port             |
| `DENO_HOSTNAME` | `127.0.0.1` | Dev / start server bind hostname    |

## Editing the site

Everything is JSON. No DB, no CMS — edit a file, save, refresh.

1. **Studio profile** — name, kicker, tagline, about, social links and the team grid live in
   [`server/cv/profile.json`](server/cv/profile.json).
2. **Products list** — [`server/cv/projects/manifest.json`](server/cv/projects/manifest.json) is the
   ordered list of cards. Each entry has a `status` of `"shipped"`, `"production"` or `"archived"` —
   the home page badge picks colour from there.
3. **Product detail** — drop a JSON file under [`server/cv/projects/`](server/cv/projects/) (same
   shape as [`howl.json`](server/cv/projects/howl.json)) and register the import in
   [`server/cv/reader.ts`](server/cv/reader.ts) — the file ships with commented examples showing
   exactly where.

The slug in the project JSON body, the manifest entry, and the registry key must all match.

## Status model

| Status       | Visual                            | Use for                                    |
| ------------ | --------------------------------- | ------------------------------------------ |
| `shipped`    | Green check + "Shipped"           | Released and available (Howl, Hound)       |
| `production` | Pulsing primary + "In production" | Running in production with users (Hushkey) |
| `archived`   | Muted "Archived"                  | No longer maintained                       |

## Page anatomy

The home page has four stacked sections:

1. Hero — centered glow logo, kicker, big `SOFTWARE.` wordmark, "by Hushkey"
2. **Products** — single grid of every product, each with its status badge
3. **Team** — accent-coloured initials cards with optional GitHub link
4. About + contact CTA in a single rounded panel

Top-right nav (`Products` / `Team` / `Get in touch`) anchor-scrolls on the home page; the gallery
(`/projects`) lists every product with the same status badges.

## Project layout

```
server/
  main.ts                # Howl app, middleware order, env wiring
  apis/                  # File-system API routes (.api.ts)
  cv/
    profile.json         # name, studio, kicker, tagline, about, social, team
    reader.ts            # registers profile + project files — edit when adding
    projects/
      manifest.json      # ordered product list with status flags
      *.json             # individual product detail pages
client/
  pages/
    _app.tsx             # HTML shell + <head>
    _layout.tsx          # site chrome (top bar + mobile tabs)
    _error.tsx           # error page
    index.tsx            # studio home — hero, products, team, contact
    projects/
      index.tsx          # full products gallery
      [slug].tsx         # generic product detail renderer
static/
  style.css              # Tailwind entry, theme tokens, animations
  logo.svg               # placeholder — swap for your own brand mark
howl.config.ts           # State, roles, defineApi factory
dev.ts                   # HowlBuilder entry — dev server + production build
tailwind.config.ts       # daisyUI plugin + content globs
```

## Public APIs

The same data the pages render is also exposed as JSON:

| Endpoint                         | Returns                           |
| -------------------------------- | --------------------------------- |
| `GET /api/public/profile`        | Studio profile + team             |
| `GET /api/public/projects`       | Products manifest (with `status`) |
| `GET /api/public/projects/:slug` | A single product detail           |
| `GET /api/public/ping`           | Health probe                      |

## Production

```sh
deno task build && deno task start          # plain Deno run
deno task build && deno task compile         # single-binary
```
