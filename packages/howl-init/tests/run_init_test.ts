import { expect } from "@std/expect";
import { join } from "@std/path";
import { runInit } from "../mod.ts";
import type { PromptDeps, PromptOption } from "../src/prompt.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "howl-init-runtest-" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

/** Records what was asked/picked; pick answers are the option labels to choose. */
function recordingPrompts(answers: { ask?: string[]; pick?: string[] }): {
  prompts: PromptDeps;
  asked: string[];
  picked: string[];
} {
  const askQueue = [...(answers.ask ?? [])];
  const pickQueue = [...(answers.pick ?? [])];
  const asked: string[] = [];
  const picked: string[] = [];
  const prompts: PromptDeps = {
    ask(question, defaultValue) {
      asked.push(question);
      return (askQueue.shift() ?? defaultValue ?? "").toString();
    },
    pick<T>(question: string, options: PromptOption<T>[]): T {
      picked.push(question);
      const want = pickQueue.shift();
      const found = want !== undefined ? options.find((o) => o.label === want) : undefined;
      return (found ?? options[0]).value;
    },
  };
  return { prompts, asked, picked };
}

Deno.test("runInit with explicit options skips all prompts", async () => {
  await withTempDir(async (dir) => {
    const { prompts, asked, picked } = recordingPrompts({});
    const result = await runInit({
      name: "my-app",
      appType: "backend",
      service: "none",
      cwd: dir,
      prompt: prompts,
      format: false,
    });

    expect(result.spec.name).toBe("my-app");
    expect(result.spec.appType).toBe("backend");
    expect(result.path).toBe(join(dir, "my-app"));
    expect(asked).toEqual([]);
    expect(picked).toEqual([]);
    expect((await Deno.stat(join(dir, "my-app", "server/main.ts"))).isFile).toBe(true);
  });
});

Deno.test("runInit prompts name → type → service for a backend (no UI step)", async () => {
  await withTempDir(async (dir) => {
    const { prompts, asked, picked } = recordingPrompts({
      ask: ["from-prompt"],
      pick: ["backend", "none"],
    });
    const result = await runInit({ cwd: dir, prompt: prompts, format: false });

    expect(result.spec.name).toBe("from-prompt");
    expect(result.spec.appType).toBe("backend");
    expect(asked.length).toBe(1);
    // backend skips the UI-kit question → only App type + Service
    expect(picked).toEqual(["App type", "Service layer (database)"]);
  });
});

Deno.test("runInit asks the UI-kit step for a fullstack app", async () => {
  await withTempDir(async (dir) => {
    const { prompts, picked } = recordingPrompts({
      pick: ["fullstack-react", "shadcn/ui", "none"],
    });
    const result = await runInit({ name: "fs", cwd: dir, prompt: prompts, format: false });

    expect(result.spec.appType).toBe("fullstack-react");
    expect(result.spec.ui).toBe("shadcn");
    expect(picked).toEqual(["App type", "UI kit", "Service layer (database)"]);
    expect((await Deno.stat(join(dir, "fs", "client/components/ui/button.tsx"))).isFile).toBe(true);
  });
});

Deno.test("runInit wires service + studio when a database is picked", async () => {
  await withTempDir(async (dir) => {
    const { prompts } = recordingPrompts({ pick: ["backend", "sqlite"] });
    const result = await runInit({ name: "svc", cwd: dir, prompt: prompts, format: false });

    expect(result.spec.service).toBe("sqlite");
    expect((await Deno.stat(join(dir, "svc", "server/services/items/items.service.ts"))).isFile)
      .toBe(true);
    const main = await Deno.readTextFile(join(dir, "svc", "server/main.ts"));
    expect(main).toContain("studio(");
  });
});

Deno.test("runInit rejects an invalid UI kit for the chosen app type", async () => {
  await withTempDir(async (dir) => {
    // shadcn is React-only — invalid for vue
    await expect(
      runInit({
        name: "x",
        appType: "fullstack-vue",
        ui: "shadcn",
        service: "none",
        cwd: dir,
        prompt: recordingPrompts({}).prompts,
      }),
    ).rejects.toThrow(/not valid for fullstack-vue/);
  });
});

Deno.test("runInit rejects invalid project names", async () => {
  await withTempDir(async (dir) => {
    await expect(
      runInit({ name: "../escape", cwd: dir, prompt: recordingPrompts({}).prompts }),
    ).rejects.toThrow(/Invalid project name/);
  });
});

Deno.test("runInit refuses to overwrite a non-empty existing folder", async () => {
  await withTempDir(async (dir) => {
    const target = join(dir, "taken");
    await Deno.mkdir(target);
    await Deno.writeTextFile(join(target, "stuff.txt"), "x");
    await expect(
      runInit({
        name: "taken",
        appType: "backend",
        service: "none",
        cwd: dir,
        prompt: recordingPrompts({}).prompts,
      }),
    ).rejects.toThrow(/not empty/);
  });
});
