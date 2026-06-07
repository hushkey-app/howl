# @hushkey/howl-init

Scaffold a new [Howl](https://jsr.io/@hushkey/howl) project from a template.

## Usage

Run directly — no install required:

```sh
deno run -Ar jsr:@hushkey/howl-init
```

With a name and template:

```sh
deno run -Ar jsr:@hushkey/howl-init my-app --template docs
```

Show all options:

```sh
deno run -Ar jsr:@hushkey/howl-init --help
```

## Templates

| ID             | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `backend-only` | Minimal API-only project with sample ping (GET) + pong (POST)             |
| `fullstack`    | Minimal fullstack — 1 API, 1 page, 1 island, 1 signal component, Tailwind |
| `docs`         | Tailwind + daisyUI docs site with JSON-driven content                     |
| `cv`           | Tailwind + daisyUI developer CV / portfolio with project cards            |

Run `--help` to see the live list from the installed version.

## Flags

| Flag                  | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `-n, --name <name>`   | Project name (also accepted as positional arg) |
| `-t, --template <id>` | Template id (skip the picker)                  |
| `-h, --help`          | Show help                                      |

## What you get

The CLI creates a project folder under the current directory containing the chosen template. After
it finishes:

```sh
cd my-app
deno task dev
```

## Programmatic use

```ts
import { runInit } from "@hushkey/howl-init";

const result = await runInit({
  name: "my-app",
  template: "docs",
  cwd: Deno.cwd(),
});

console.log(result.path);
```

## License

MIT — see [LICENSE](./LICENSE).
