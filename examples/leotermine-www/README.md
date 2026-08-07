# leotermine-www

Personal site for **leotermine.com** — Howl + the React engine, Tailwind v4, shadcn-style
primitives.

It does two jobs:

1. **The personal site** — a short intro, a filterable project grid, work history and contact.
2. **Hosted app pages** — `/{project}` , `/{project}/support` and `/{project}/privacy` for shipped
   apps, so an App Store listing can point at `leotermine.com/nobiru/support` and there is no
   separate site to maintain per app.

```
deno task dev      # http://localhost:8000
deno task build    # → dist/
deno task start    # run the production bundle
deno task compile  # single self-contained binary → dist/bin/leotermine
```

## Deploying

`deno compile` folds the runtime, `dist/` and `static/` into one binary, so the image that ships has
no Deno, no source and no `node_modules` — just a libc and the executable. Build context is the
**repo root**, because the workspace `deno.json` and `packages/` live a level up:

```sh
docker build -f examples/leotermine-www/Dockerfile -t leotermine-www \
  --build-arg GIT_REVISION=$(git rev-parse HEAD) .

docker run --rm -p 8000:8000 -e SITE_ORIGIN=https://leotermine.com leotermine-www
```

| Variable             | Default                  | Why                                                                                                  |
| -------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `DENO_PORT`          | `8000`                   | Port to bind.                                                                                        |
| `DENO_HOSTNAME`      | unset                    | Leave unset: `Deno.serve` then binds `0.0.0.0`. Setting `127.0.0.1` makes the container unreachable. |
| `SITE_ORIGIN`        | `https://leotermine.com` | Canonical and OG URLs.                                                                               |
| `DENO_DEPLOYMENT_ID` | build arg `GIT_REVISION` | Becomes the build id in chunk URLs, so each deploy busts its own cache.                              |

The image runs as a non-root user and carries a `HEALTHCHECK` that polls `/`. Any host that takes a
container works — the binary is self-contained, so no volume mounts and no working-directory
assumptions.

## Adding a project

One file, one line. Everything else — the card, the filter chips, the footer links, the hosted pages
— is derived.

```ts
// shared/projects/newthing.ts
import type { Project } from "./types.ts";

export const newthing: Project = {
  slug: "newthing",
  name: "New Thing",
  tagline: "Six words about it",
  summary: "Two or three sentences.",
  year: "2026",
  status: "live",
  hue: 260, // ← the only styling decision; re-themes the whole project subtree
  languages: ["TypeScript", "Rust"], // ← these become the filter chips
  cover: "/projects/newthing.jpg", // ← or `icon:` for an app with no site
  links: [{ label: "Visit", href: "https://…", icon: "globe", primary: true }],
};
```

```ts
// shared/projects/index.ts
export const PROJECTS: Project[] = [nobiru, howl, hound, pack, hushkey, spellit, newthing];
```

Every project gets `/newthing` — a standard overview page with the cover, what it is written in, and
its outbound links in their own block. Give it a `support` block as well and it also gains
`/newthing/support` and `/newthing/privacy`, plus the tab bar that switches between the three.
Without one, the sub-pages 404.

**In-site and off-site links are kept apart.** A card's cover and title go to `/{slug}`, and the
external link sits separately in the footer row — so "read about it" and "leave for the real site"
are never the same click.

### The 404 guard

`pages/[project]/` mounts at the URL root, so `/:project` would otherwise match _every_ unknown
first-level path and render a blank shell with a 200. A middleware in `server/main.ts` resolves the
slug up front and throws `HttpError(404)` for anything that is not a real project — or that asks for
a sub-page the project does not host.

## Design notes

**Everything is an object on a surface.** One narrow column of cards floating above the canvas —
nothing spans the viewport, including the nav. Depth comes from a single recipe reused everywhere
(`--lift` in `static/style.css`): a 1 px contact shadow, a mid shadow, and a wide ambient one.
`.card-hover` raises an interactive card 3 px and swaps in `--lift-high`. In dark the ramp deepens
so cards still read as floating rather than dissolving into the background.

**The filter is languages only.** `Language` in `shared/projects/types.ts` is a closed union —
TypeScript, Rust, Swift, React, React Native, Vue — so a stray `"Redis"` is a compile error rather
than a sixth chip nobody wanted. Frameworks, datastores and platforms live in each project's
`summary`, where they read as prose instead of piling up as a dozen near-useless pills.

**Project covers are real, in three tiers.** `cover` is a screenshot of the live site
(`static/projects/*.jpg`, 1200×750, ~50–100 KB — recapture by screenshotting and cropping to 16:10).
`icon` is the app's own mark, floated on the project's accent, for products with no site to shoot —
Nobiru uses its App Store icon. Everything else falls back to a monogram on the same accent panel.
No mock screenshots: a fake one of something nobody can go and look at is worse than none.

**Cards are picture-first.** Cover, name, tagline, languages — the prose lives on the project page,
not in the grid. Hovering a card slides in one overlay layer, scrim and both buttons together,
carrying **Overview** and the outbound link. The cover itself does not move. That reveal is gated on
`(hover: hover)`, not on screen width: a touch device has no hover state to reveal anything with, so
the CSS removes the overlay entirely and shows an always-visible link row under the languages
instead. `:focus-within` keeps the overlay reachable by keyboard.

**Frost with something to sample.** `components/wash.tsx` lays three very pale pools of colour
behind the page. They are close to invisible alone; their job is to give
`backdrop-filter: blur() saturate()` something to pick up, so a card sitting over one warms very
slightly instead of being flat on flat.

**Light and dark.** One toggle in the pill, sun and moon stacked in the same well so the swap is a
rotation rather than a glyph popping. The resolved theme is stamped onto `<html>` as `data-theme` by
a blocking script in `_app.tsx` (`THEME_BOOT_SCRIPT` in `lib/theme.ts`) **before first paint** —
that script is deliberately render-blocking, because it is the only way to avoid a flash of the
wrong palette. Stored choice wins; otherwise the OS preference does.

Per-project accents have to be theme-aware too, and a custom property cannot branch — so `hueVars()`
writes _both_ pairs inline (`--accent-l` / `--accent-d`) and the `.hued` class picks one. `--accent`
is declared on that class, on the element carrying the inline values, because declaring it at
`:root` would substitute the root hue and ignore the descendant entirely.

**Sound** (`lib/sound.ts`) is a Web Audio synth, not audio files — nothing to download, nothing to
cache-bust, no decode latency on the first tap. The context is created lazily on the first gesture.
There is no mute control: at these levels a switch for it was more chrome than it was worth.

**Type is the system stack** — no webfonts, no third-party requests, nothing to preload.

**No scroll-triggered reveals.** They were tried and removed: hiding server-rendered content until
JavaScript un-hides it means one hiccup leaves a blank page. The only load motion is a short lift on
the intro, and it never hides anything that is already on screen.

**Reduced motion is honoured without going mute.** The usual blanket `transition-duration: 0.01ms`
on `*` was tried and rejected — it turns every hover into a hard cut, which reads as broken rather
than as calm. What the setting asks for is an end to things _travelling_ across the screen, so
transforms and keyframes stop (the overlay rests at its final position, the intro lift and pointer
tilt never arm) while fades, colours and shadows still transition at a real 320 ms.

## Before this goes live

- **Add `static/portrait.jpg`.** Until it exists the intro falls back to an "LT" monogram —
  deliberately, so a missing file never shows a broken image. Square, ~600 px.
- **The full CV is not on the site.** `shared/cv.ts` holds only the work history the experience
  section renders; anyone wanting the document asks by email.
- **Point `hello@leotermine.com` somewhere.** It is the only address in the markup; the personal
  inbox and phone number appear nowhere on the site by design (`shared/profile.ts`).
- **Spellit is written but not listed** — its import is commented out in `shared/projects/index.ts`
  until it has an icon and a shipped build. Uncomment both lines there and fill in the placeholder
  copy in `spellit.ts` to bring the card and its `/spellit` page back.
- **Set the real Nobiru App Store URL** in `shared/projects/nobiru.ts`.
- **Set `SITE_ORIGIN`** in the deployment environment if it is ever served from somewhere other than
  `https://leotermine.com` — canonical and OG URLs read it.
