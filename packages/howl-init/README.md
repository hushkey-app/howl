# @hushkey/howl-init

Scaffold a new [Howl](https://jsr.io/@hushkey/howl) project. The CLI composes your project from a
small set of choices — there are no fixed templates to pick from; the generator assembles
`deno.json`, `dev.ts`, `server/main.ts`, pages, and a service layer to match what you ask for.

## Usage

Run directly — no install required, fully interactive:

```sh
deno run -Ar jsr:@hushkey/howl-init
```

You'll be asked four things:

1. **Project name** — the target folder.
2. **App type** — `backend`, `fullstack-react`, or `fullstack-vue`.
3. **UI kit** (fullstack only) — `shadcn/ui` or `daisyUI` (React), `daisyUI` or plain `Tailwind`
   (Vue). React also offers plain Tailwind.
4. **Service layer** — `none`, `sqlite`, `postgres`, or `mongo`. Picking a database wires the
   `@hushkey/service-core` backend, a sample service, and the **Studio** admin UI at `/studio`.

Skip the prompts with flags:

```sh
deno run -Ar jsr:@hushkey/howl-init my-app --type fullstack-react --ui shadcn --service sqlite
```

## Flags

| Flag                 | Values                                          |
| -------------------- | ----------------------------------------------- |
| `-n, --name <name>`  | Project name (also accepted as positional arg)  |
| `-t, --type <type>`  | `backend` · `fullstack-react` · `fullstack-vue` |
| `-u, --ui <kit>`     | `tailwind` · `daisyui` · `shadcn` (fullstack)   |
| `-s, --service <db>` | `none` · `sqlite` · `postgres` · `mongo`        |
| `-h, --help`         | Show help                                       |

## What you get

Every project includes typed API routes (sample `public/ping`), the build/dev/start/compile tasks,
and a generated typed HTTP client (`httpClientGenPlugin`). On top of that:

- **fullstack-react / -vue** — a render engine (SSR → hydrate → SPA), file-system-routed pages, and
  Tailwind v4. With `shadcn`, the `cn` helper plus `Button`/`Card` are vendored into
  `client/components/ui/` (yours to edit), and the `@/` import alias is wired.
- **a service layer** — `server/services/` with a sample `items` service over your chosen backend,
  and `@hushkey/studio` mounted at `/studio`.

```sh
cd my-app
deno task dev
```

## Programmatic use

```ts
import { runInit } from "@hushkey/howl-init";

const result = await runInit({
  name: "my-app",
  appType: "fullstack-react",
  ui: "shadcn",
  service: "sqlite",
  cwd: Deno.cwd(),
});

console.log(result.path, result.spec);
```

`buildProjectFiles(spec)` (from `src/blueprint/mod.ts`) returns the composed file map directly if you
want to inspect or post-process output without writing to disk.

## License

MIT — see [LICENSE](./LICENSE).
