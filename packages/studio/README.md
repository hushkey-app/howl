# @hushkey/studio

Admin UI for [`@hushkey/service-core`](../service-core/README.md) services — **one tool across every
backend** (MongoDB, Postgres, SQLite, and whatever comes next).

Unlike a wire-protocol bridge (the FerretDB road), the studio speaks the **service contract**: every
write validates against the schema, bumps the optimistic-lock version, stamps audit fields
(`executionerId`), and respects soft delete — exactly like any other caller. A Compass-style tool
talking to storage directly would bypass all of that.

## Standalone mode (default)

```ts
import { studio } from "@hushkey/studio";

app.use(studio({ services: { users, blogs, reviews } }));
// → dashboard at /studio, JSON API at /studio/api
```

The dashboard page bundles the component on first request (esbuild, react via an import map) and
loads **daisyUI + Tailwind from a CDN** in its `<head>` — no build pipeline, no static assets, and
no daisyUI install needed in the host app. The UI is styled entirely with daisyUI classes and
[heroicons](https://heroicons.com), in a flat, rounded look — Inter for chrome and JetBrains Mono
for data (both from Google Fonts).

## Component mode

Mount only the JSON API and render the component inside your own dashboard island:

```ts
app.use(studio({ services: { users, blogs }, mode: "component", path: "/admin/studio" }));
```

```tsx
// admin panel component (howl-react island or any React tree) — TSX, ships on JSR
import { Studio } from "@hushkey/studio/component";

export default function Admin() {
  return <Studio endpoint="/admin/studio/api" />;
}
```

The component is pure React styled with **daisyUI** classes + heroicons. In component mode the host
app must provide daisyUI/Tailwind (add the [CDN tags](https://daisyui.com/docs/cdn/) to your page,
or use your existing daisyUI setup) — standalone mode loads them for you. It drops into any hydrated
React tree (howl-react islands, Next, anything) that has daisyUI available.

## Theming & style

The UI follows the active **daisyUI theme** via `data-theme` (the sun/moon toggle flips
`dark`/`light` and persists). Override the theme and the primary/secondary action colors to match
your brand — on the middleware (standalone) or as the `<Studio style>` prop (component):

```ts
app.use(studio({
  services: { users, blogs, reviews },
  style: {
    theme: "dracula", // any daisyUI theme the page loads
    primaryColor: "btn-accent", // class for FIND / INSERT / APPLY
    secondaryColor: "btn-info", // class for the migrate confirm
    cssUrl: "/studio-brand.css", // extra stylesheet(s) loaded after daisyUI (standalone only)
  },
}));
```

`cssUrl` (string or array) is loaded in the standalone page `<head>` **after** daisyUI, so your CSS
can override the theme, swap fonts, or add brand tweaks. Component mode is styled by the host, so
`cssUrl` applies to standalone only.

```tsx
<Studio endpoint="/admin/studio/api" style={{ primaryColor: "btn-accent" }} />;
```

## What it does

Compass-style, dark + light themes (toggle persisted):

- **Connections sidebar** grouped by backend (sqlite / sql / mongo accents) — click a collection to
  open it in a **closeable tab**; tabs keep their query/page state like Compass
- **Query bar with autocompletion**: field names sampled from loaded documents (nested dot-paths
  included) and the exact operator grammar after `$` — ↑↓ navigate, Tab/Enter accept, Esc close.
  Relaxed syntax accepted (`{ rating: { $gte: 4 } }`, unquoted keys, single quotes)
- **Document cards** with type-colored values (red ids, green strings, blue numbers) and collapsible
  nested objects
- Filter grammar (`$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists`)
- Document table with sampled columns, version, active/deleted state, pagination
- JSON editor: create + patch (merge semantics; schema errors and **409 optimistic-lock conflicts**
  render inline)
- Soft delete, restore, and guarded hard delete; "deleted" toggle uses `viewDeleted`
- **Schema view** (⚙) — lists the backend's promoted columns and flags **orphans**: columns left
  physically present after a `promote` entry was removed from the live config. Orphans render on a
  yellow row with two actions: `✕` drops the column (and its index) through a yes/no dialog
  (document data untouched — it lives in `doc`, so a drop only reclaims an unused index), and `→`
  **migrates** the orphan into a declared field (a rename) before dropping it. Backends with no
  column concept (Mongo) report "not supported" and the panel hides the controls.

## Schema introspection & orphan cleanup

The promoted-column DDL the SQL backends apply is purely additive (`ADD COLUMN IF NOT EXISTS`):
removing a path from `promote` stops routing queries to its column but never drops the physical
column or its index — leaving an **orphan** that costs write/index maintenance for no read benefit.
The schema view surfaces these and lets an operator drop them.

Dropping is the one studio operation that lives **below** the service contract (no validation, no
version bump) — schema DDL is a different category. It is deliberately **introspect-and-cleanup
only**: authoring new promoted columns stays in code, where the declarative `promote` config is the
source of truth, so the studio never fights that config. `dropColumn` refuses any column still
declared in the live config; only true orphans are droppable.

**Migrate (rename).** When you replace a promoted field — e.g. drop `tech` from the config and add
`is_tech` — the new column is empty (generated columns don't backfill) and the old one is an orphan.
`→` migrates: it copies the orphan's value into the chosen declared field for every document
**through the contract** (each write validates against the schema, bumps `version`, stamps audit —
unlike the raw drop), then auto-drops the orphan column **and** its leftover JSON key. Top-level
fields only (the column name is the JSON key); nested-derived columns need manual SQL.

Wired through an optional `SchemaAdmin` backend capability (`@hushkey/service-core`),
feature-detected via `service.schemaAdmin` — `null` for backends without it. JSON API:

```
GET  /studio/api/services/:key/schema           → { supported, columns: [{ column, type, declared }] }
POST /studio/api/services/:key/schema {column}   → drops one orphan (400 if still declared)
POST /studio/api/services/:key/schema {from,to}  → migrates orphan `from` → declared `to`, then drops `from`
```

## Options

| Option          | Default      |                                                                          |
| --------------- | ------------ | ------------------------------------------------------------------------ |
| `services`      | —            | `Record<string, DocumentService>` to administer                          |
| `path`          | `/studio`    | Mount path                                                               |
| `mode`          | `standalone` | `standalone` (dashboard) or `component` (API only)                       |
| `executionerId` | `"studio"`   | String or `(ctx) => string` — audit identity for writes                  |
| `style`         | —            | daisyUI overrides: `{ theme?, primaryColor?, secondaryColor?, cssUrl? }` |

**Auth is yours**: mount your own guard middleware before `studio()` (it's a plain middleware;
anything with `{ url, req, next() }` can host it).
