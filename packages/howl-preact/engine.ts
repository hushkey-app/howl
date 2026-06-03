/**
 * The built-in Preact render engine. Its implementation lives in `@hushkey/howl`
 * core (Preact is the framework's native substrate — `ctx.render`, islands, and
 * the client runtime are all in core), so this is a re-export that gives the
 * engine a home symmetric with `@hushkey/howl-vue` / `@hushkey/howl-react`.
 */
export { preactEngine } from "@hushkey/howl";
