# nobiru-www

The marketing site for **Nobiru**, a paid-once iOS gym + nutrition tracker — built on
[Howl](../../packages/howl) with the [`@hushkey/howl-react`](../../packages/howl-react) engine and
[shadcn/ui](https://ui.shadcn.com), the same way [`examples/_react-shadcn`](../_react-shadcn) wires
it up (components vendored into `client/components/ui/`, no CLI, no Vite).

Deliberately plain: default system type — **no webfont** — flat surfaces and a light theme only. The
colour comes from the app itself rather than from effects:

| Token group   | What it is                                                              | Used for                                         |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| `--primary`   | the app's violet `#7d3bed`                                              | buttons, links, eyebrows, the price              |
| `--chart-1…5` | the per-muscle accents (chest, back, shoulders, biceps, triceps), vivid | bars, dots, icon chips, macro fills              |
| `--ink-1…5`   | the same hues darkened until they pass contrast on white                | coloured numerals and icon glyphs                |
| `--tint-*`    | near-white violet / sky / lime washes                                   | flat panels (hero offer, Watch, Reports, closer) |

The `chart` / `ink` split matters: `#ff9429` is fine as a bar and unreadable as 24px text.

## Run

```sh
deno task dev                        # → http://localhost:8000  (DENO_PORT to override)
deno task build && deno task start   # production build + snapshot server
deno task compile                    # single binary → dist/bin/nobiru
```

## What's here

- **`client/pages/_app.tsx`** — document shell: stylesheet, icons. Nothing else.
- **`client/pages/_layout.tsx`** — sticky top bar + footer, shared by every page.
- **`client/pages/index.tsx`** — the landing page: hero (which carries the whole offer — price and
  the full included list, above the fold), numbers, features, Apple Watch, nutrition scanning,
  reports, FAQ, closer. There is no separate pricing section; it only repeated the hero.
- **`client/pages/privacy.tsx`** — privacy policy matching what the app actually does.
- **`client/components/ui/`** — vendored shadcn: `button`, `card`, `badge`, plus `faq-item` (see
  below).
- **`client/components/`** — the product illustrations, drawn in markup so they use the site's own
  tokens (no screenshots):
  - `phone.tsx` — iPhone dashboard with the calorie ring and macro bars.
  - `watch.tsx` — Apple Watch session card; heart rate, energy and elapsed time tick client-side.
  - `label-scan.tsx` — nutrition label beside the draft entry it parses into.
  - `week-chart.tsx` — weekly volume stacked by muscle group in the chart tokens.
- **`shared/facts.ts`** — price, store URL and catalogue counts, imported by both the server (state
  injection) and the pages, so no number is stated twice.
- **`static/style.css`** — Tailwind v4 entry: the shadcn token block plus the `chart` / `ink` /
  `tint` groups above.

## Notable patterns

- **`@/` alias** → `./client/`, the shadcn convention; imports carry explicit `.ts`/`.tsx`
  extensions because Deno requires them.
- **No hydration mismatch on live numbers** — the Watch card renders fixed values on the server and
  only starts walking them inside `useEffect`.
- **Radix components that call `useId()` do not survive hydration here.** Howl SSRs the `_app` shell
  _and_ the page, but hydrates only `#howl-app`, so React's id counter starts from a different tree
  position on the client and every generated id differs (React logs a hydration warning). That rules
  out shadcn's Accordion, Dialog, Tooltip, … as-is — the FAQ uses
  [`faq-item.tsx`](client/components/ui/faq-item.tsx), a `<details>` disclosure styled the same way,
  which needs no ids and works without JavaScript. Radix parts with no `useId` (Button's `Slot`) are
  fine.
- **Light-only** — no `.dark` block and no theme toggle, so there is no flash and no toggle state to
  persist.
- **Cross-page section links opt out of client nav** (`client-nav="false"`) — a client swap replays
  the server URL, which drops the `#fragment`, so those links do a real load.
- **One source of truth for claims** — `shared/facts.ts`. `FOOD_COUNT` (5,772) and `EXERCISE_COUNT`
  (721) are the real bundle counts from `Foods.json` / `Exercises.json`; the copy quotes
  `EXERCISE_CLAIM` ("up to 1,000") so it survives the catalogue growing between releases. Update
  both with the app release.
- **No API routes** — pages plus static assets, so `server/main.ts` only registers `staticFiles()`,
  `compression()`, one state middleware and `fsClientRoutes()`.

## Dependencies beyond React

The shadcn baseline: `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`
(Button `asChild`) and `lucide-react` for icons — all pinned in [`deno.json`](deno.json).

## Before launch

- `APP_STORE_URL` in `shared/facts.ts` is a placeholder (`id0000000000`) — swap in the real listing.
- `static/logo.png` is the 1024px app icon, kept as the source. The page never loads it — the
  derivatives do: `logo-192.png` (nav, footer, Live Activity mock, favicon), `logo-512.png` (closer,
  OG image), `apple-touch-icon.png` (180px). Regenerate them after an icon change with
  `sips -Z <size> logo.png --out <file>`.
- Support address `support@nobiru.app` is a placeholder.
