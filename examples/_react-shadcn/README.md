# Howl + React + shadcn/ui

A full-React Howl example styled with [shadcn/ui](https://ui.shadcn.com) instead of daisyUI — the
same SSR → hydrate → SPA model as [`examples/_react`](../_react), just with the component library
the React community already reaches for. **No Vite anywhere** — Deno + esbuild + Tailwind v4.

```sh
deno task dev      # dev server (live reload) on :8000
deno task build    # production build → dist/
deno task start    # run the built server
```

## How shadcn works here (no CLI)

shadcn/ui isn't an npm package you install — it's components you copy into your project. The
`shadcn` CLI assumes a Node/Vite project, so in Deno you vendor the pieces directly. This example
already did that:

| Piece                    | Location                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| `cn()` helper            | [`client/lib/utils.ts`](client/lib/utils.ts)                         |
| Button                   | [`client/components/ui/button.tsx`](client/components/ui/button.tsx) |
| Card                     | [`client/components/ui/card.tsx`](client/components/ui/card.tsx)     |
| Design tokens (CSS vars) | [`static/style.css`](static/style.css)                               |

The component source is the canonical upstream shadcn (Tailwind v4 / "new-york") **verbatim**, with
one Deno-mandated tweak: imports carry an explicit extension — `@/lib/utils.ts`, not `@/lib/utils`.
The `@/` alias maps to `./client/` in [`deno.json`](deno.json), matching the shadcn convention.

### Adding more components

Copy a component from [ui.shadcn.com](https://ui.shadcn.com) into `client/components/ui/`, then:

1. add `.ts`/`.tsx` extensions to its relative/`@/` imports (Deno requires them);
2. add any new npm deps to the `imports` map in `deno.json` (e.g. a `@radix-ui/*` primitive);
3. if it pulls design tokens this example doesn't have yet (sidebar, chart…), copy those CSS
   variables into `static/style.css` under `:root` and `.dark`.

### Dependencies

Beyond React, the shadcn baseline: `class-variance-authority`, `clsx`, `tailwind-merge` (v3, for
Tailwind v4), `@radix-ui/react-slot` (Button's `asChild`), and `lucide-react` for icons — all pinned
in `deno.json`.

## Dark mode

Class-based, the shadcn default: the nav's toggle button flips the `dark` class on `<html>` and the
`@custom-variant dark` rule in `static/style.css` does the rest.
