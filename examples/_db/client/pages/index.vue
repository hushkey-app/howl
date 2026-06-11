<template>
  <main class="min-h-screen px-4 py-6 lg:px-8 max-w-[1600px] mx-auto">
    <!-- ── header strip ─────────────────────────────────────────────── -->
    <header class="flex flex-wrap items-center gap-4 border border-base-300 bg-base-200/80 px-5 py-4 rounded-box mb-6">
      <div>
        <h1 class="font-display text-2xl font-bold tracking-widest uppercase">
          Howl <span class="text-primary">//</span> DB Console
        </h1>
        <p class="text-xs opacity-60 mt-1">
          one service contract · three databases · @hushkey/service-core
        </p>
      </div>
      <div class="flex items-center gap-5 ml-auto text-xs">
        <span class="flex items-center gap-2">
          <i class="led led-on" :style="{ color: status.sqlite ? 'var(--db-sqlite)' : 'oklch(40% 0 0)' }" />
          sqlite
        </span>
        <span class="flex items-center gap-2">
          <i class="led led-on" :style="{ color: status.pg ? 'var(--db-pg)' : 'oklch(40% 0 0)' }" />
          postgres
        </span>
        <span class="flex items-center gap-2">
          <i class="led" :class="status.mongo ? 'led-on' : ''" :style="{ color: status.mongo ? 'var(--db-mongo)' : 'oklch(45% 0.16 25)' }" />
          mongo
        </span>
        <button class="btn btn-primary btn-sm font-display tracking-wider" :disabled="flowRunning" @click="runFlow">
          {{ flowRunning ? "RUNNING…" : "▶ RUN FLOW" }}
        </button>
      </div>
    </header>

    <!-- ── the three database panels ─────────────────────────────────── -->
    <div class="grid gap-5 lg:grid-cols-3 items-start">
      <!-- USERS · SQLITE -->
      <section class="bg-base-200/70 rounded-box panel-glow-sqlite overflow-hidden">
        <header class="flex items-center justify-between px-4 py-2.5 border-b border-base-300" :style="{ background: 'oklch(78% 0.16 75 / 0.08)' }">
          <h2 class="font-display font-semibold tracking-wider uppercase text-sm" :style="{ color: 'var(--db-sqlite)' }">users</h2>
          <code class="text-[10px] opacity-60">node:sqlite · data/app.db</code>
        </header>

        <form class="p-4 grid gap-2 border-b border-base-300" @submit.prevent="createUser">
          <div class="grid grid-cols-2 gap-2">
            <input v-model="userForm.name" required placeholder="name" class="input input-sm input-bordered font-mono" />
            <input v-model="userForm.email" required type="email" placeholder="email" class="input input-sm input-bordered font-mono" />
          </div>
          <div class="flex gap-2">
            <select v-model="userForm.role" class="select select-sm select-bordered flex-1">
              <option value="reader">reader</option>
              <option value="author">author</option>
            </select>
            <button class="btn btn-sm" :style="{ background: 'var(--db-sqlite)', color: 'oklch(15% 0.04 75)' }">
              + insert
            </button>
          </div>
        </form>

        <div class="px-4 pt-3 flex gap-1.5 text-[11px]">
          <button
            v-for="r in ['all', 'reader', 'author']"
            :key="r"
            class="btn btn-xs"
            :class="userFilter === r ? 'btn-neutral' : 'btn-ghost opacity-60'"
            @click="userFilter = r; loadUsers()"
          >{{ r }}</button>
          <span class="ml-auto opacity-40 self-center">{{ users.length }} rows</span>
        </div>

        <ul class="p-2">
          <li
            v-for="u in users"
            :key="u.id"
            class="px-2 py-1.5 rounded cursor-pointer flex items-center gap-2 text-xs hover:bg-base-300/60"
            :class="selectedAuthor?.id === u.id ? 'bg-base-300 outline outline-1' : ''"
            :style="selectedAuthor?.id === u.id ? { outlineColor: 'var(--db-sqlite)' } : {}"
            @click="selectAuthor(u)"
          >
            <span class="font-semibold">{{ u.name }}</span>
            <span class="opacity-50 truncate">{{ u.email }}</span>
            <span class="badge badge-xs ml-auto" :class="u.role === 'author' ? 'badge-warning' : 'badge-ghost'">{{ u.role }}</span>
            <code class="opacity-30 text-[10px]">v{{ u.version }}</code>
          </li>
          <li v-if="users.length === 0" class="px-2 py-3 text-xs opacity-40">no rows — insert one ↑</li>
        </ul>
        <p class="px-4 pb-3 text-[10px] min-h-5" :class="logs.users.startsWith('ERR') ? 'text-error' : 'opacity-50'">{{ logs.users }}</p>
      </section>

      <!-- BLOGS · POSTGRES -->
      <section class="bg-base-200/70 rounded-box panel-glow-pg overflow-hidden">
        <header class="flex items-center justify-between px-4 py-2.5 border-b border-base-300" :style="{ background: 'oklch(70% 0.13 245 / 0.08)' }">
          <h2 class="font-display font-semibold tracking-wider uppercase text-sm" :style="{ color: 'var(--db-pg)' }">blogs</h2>
          <code class="text-[10px] opacity-60">postgres · jsonb + promoted cols</code>
        </header>

        <form class="p-4 grid gap-2 border-b border-base-300" @submit.prevent="createBlog">
          <input v-model="blogForm.title" required placeholder="title" class="input input-sm input-bordered font-mono" @input="syncSlug" />
          <div class="grid grid-cols-2 gap-2">
            <input v-model="blogForm.slug" required placeholder="slug" class="input input-sm input-bordered font-mono" />
            <label class="label cursor-pointer justify-start gap-2 text-xs">
              <input v-model="blogForm.published" type="checkbox" class="toggle toggle-sm" />
              published
            </label>
          </div>
          <div class="flex gap-2 items-center">
            <span class="text-[11px] flex-1 truncate" :class="selectedAuthor ? '' : 'text-error'">
              author: {{ selectedAuthor ? `${selectedAuthor.name} (sqlite)` : "← click a user row" }}
            </span>
            <button class="btn btn-sm" :disabled="!selectedAuthor" :style="{ background: 'var(--db-pg)', color: 'oklch(14% 0.03 245)' }">
              + insert
            </button>
          </div>
        </form>

        <div class="px-4 pt-3 flex items-center gap-2 text-[11px]">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input v-model="showDeleted" type="checkbox" class="checkbox checkbox-xs" @change="loadBlogs" />
            show deleted
          </label>
          <span class="ml-auto opacity-40">{{ blogs.length }} rows</span>
        </div>

        <ul class="p-2">
          <li
            v-for="b in blogs"
            :key="b.id"
            class="px-2 py-1.5 rounded flex items-center gap-2 text-xs"
            :class="[b.meta.deleted_at ? 'opacity-45' : '', conflictId === b.id ? 'conflict-flash' : '']"
          >
            <i class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: b.published ? 'var(--db-mongo)' : 'oklch(45% 0.02 255)' }" :title="b.published ? 'published' : 'draft'" />
            <span class="font-semibold" :class="b.meta.deleted_at ? 'line-through' : ''">{{ b.slug }}</span>
            <code class="opacity-30 text-[10px]">v{{ b.version }}</code>
            <span class="ml-auto flex items-center gap-1">
              <button class="btn btn-ghost btn-xs font-mono" title="patch likes+1 (atomic $inc version)" @click="like(b, false)">▲ {{ b.likes }}</button>
              <button class="btn btn-ghost btn-xs text-warning" title="send a STALE version → optimistic lock rejects" @click="like(b, true)">⚠</button>
              <button v-if="!b.meta.deleted_at" class="btn btn-ghost btn-xs text-error" title="soft delete" @click="softDelete(b)">✕</button>
              <button v-else class="btn btn-ghost btn-xs text-success" title="restore" @click="restore(b)">↺</button>
            </span>
          </li>
          <li v-if="blogs.length === 0" class="px-2 py-3 text-xs opacity-40">no rows — pick an author, insert one ↑</li>
        </ul>
        <p class="px-4 pb-3 text-[10px] min-h-5" :class="logs.blogs.startsWith('ERR') ? 'text-error' : 'opacity-50'">{{ logs.blogs }}</p>
      </section>

      <!-- REVIEWS · MONGO -->
      <section class="bg-base-200/70 rounded-box panel-glow-mongo overflow-hidden">
        <header class="flex items-center justify-between px-4 py-2.5 border-b border-base-300" :style="{ background: 'oklch(72% 0.17 150 / 0.08)' }">
          <h2 class="font-display font-semibold tracking-wider uppercase text-sm" :style="{ color: 'var(--db-mongo)' }">reviews</h2>
          <code class="text-[10px] opacity-60">mongodb · howl_db_example</code>
        </header>

        <div v-if="!status.mongo" class="p-6 text-center">
          <p class="font-display text-error tracking-[0.3em] text-lg">● OFFLINE</p>
          <p class="text-[11px] opacity-60 mt-3 leading-relaxed">
            nothing listening on <code class="text-warning">localhost:27017</code> — start one
            and restart the server:<br />
            <code class="opacity-80">docker run -d -p 27017:27017 mongo:7</code><br />
            <code class="opacity-60">(MONGO_URL overrides the default)</code>
          </p>
        </div>

        <template v-else>
          <form class="p-4 grid gap-2 border-b border-base-300" @submit.prevent="createReview">
            <select v-model="reviewForm.blog_id" required class="select select-sm select-bordered font-mono">
              <option disabled value="">blog (postgres ref)</option>
              <option v-for="b in blogs.filter((x) => !x.meta.deleted_at)" :key="b.id" :value="b.id">{{ b.slug }}</option>
            </select>
            <div class="flex gap-1 items-center">
              <button
                v-for="n in 5"
                :key="n"
                type="button"
                class="btn btn-ghost btn-xs px-1 text-base"
                :class="n <= reviewForm.rating ? '' : 'opacity-25'"
                @click="reviewForm.rating = n"
              >★</button>
              <input v-model="reviewForm.comment" placeholder="comment" class="input input-sm input-bordered font-mono flex-1 ml-2" />
            </div>
            <button class="btn btn-sm" :disabled="!reviewForm.blog_id || !selectedAuthor" :style="{ background: 'var(--db-mongo)', color: 'oklch(14% 0.04 150)' }">
              + insert as {{ selectedAuthor?.name ?? "…" }}
            </button>
          </form>

          <div class="px-4 pt-3 flex items-center gap-2 text-[11px]">
            <span class="opacity-60">min rating ≥ {{ minRating }}</span>
            <input v-model.number="minRating" type="range" min="1" max="5" class="range range-xs flex-1" @change="loadReviews" />
            <span class="opacity-40">{{ reviews.length }} rows</span>
          </div>

          <ul class="p-2">
            <li v-for="r in reviews" :key="r.id" class="px-2 py-1.5 rounded flex items-center gap-2 text-xs">
              <span class="text-warning tracking-tighter">{{ "★".repeat(r.rating) }}<span class="opacity-20">{{ "★".repeat(5 - r.rating) }}</span></span>
              <span class="opacity-70 truncate">{{ r.comment || "—" }}</span>
              <code class="ml-auto opacity-30 text-[10px]">→ {{ slugOf(r.blog_id) }}</code>
            </li>
            <li v-if="reviews.length === 0" class="px-2 py-3 text-xs opacity-40">no rows at this rating</li>
          </ul>
        </template>
        <p class="px-4 pb-3 text-[10px] min-h-5" :class="logs.reviews.startsWith('ERR') ? 'text-error' : 'opacity-50'">{{ logs.reviews }}</p>
      </section>
    </div>

    <!-- ── flow transcript ───────────────────────────────────────────── -->
    <section v-if="flow.length > 0" class="mt-6 border border-base-300 bg-base-200/80 rounded-box overflow-hidden">
      <header class="px-4 py-2.5 border-b border-base-300 flex items-center gap-3">
        <h2 class="font-display font-semibold tracking-wider uppercase text-sm">flow transcript</h2>
        <code class="text-[10px] opacity-50">GET /api/demo/flow — one scenario across all three databases</code>
        <button class="btn btn-ghost btn-xs ml-auto" @click="flow = []">clear</button>
      </header>
      <ol class="p-4 grid gap-1 text-xs">
        <li
          v-for="(s, i) in flow"
          :key="i"
          class="tline flex gap-3 items-baseline"
          :style="{ animationDelay: `${i * 90}ms` }"
        >
          <span class="opacity-30 select-none">{{ String(i).padStart(2, "0") }}</span>
          <span class="badge badge-xs font-display uppercase shrink-0" :style="badgeStyle(s.step)">{{ s.step }}</span>
          <span class="opacity-80">{{ s.info }}</span>
        </li>
      </ol>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useHead } from "@hushkey/howl-vue/head";

useHead({
  title: "Howl // DB Console",
  meta: [{ name: "description", content: "One service contract, three databases — interactive demo." }],
});

interface Meta {
  deleted_at: number | null;
  deleted_by: string | null;
}
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  version: number;
}
interface Blog {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  likes: number;
  version: number;
  meta: Meta;
}
interface Review {
  id: string;
  blog_id: string;
  rating: number;
  comment: string;
}

const status = reactive({ sqlite: false, pg: false, mongo: false });
const logs = reactive({ users: "", blogs: "", reviews: "" });

const users = ref<User[]>([]);
const blogs = ref<Blog[]>([]);
const reviews = ref<Review[]>([]);
const flow = ref<{ step: string; info: string }[]>([]);

const userFilter = ref("all");
const showDeleted = ref(false);
const minRating = ref(1);
const selectedAuthor = ref<User | null>(null);
const conflictId = ref("");
const flowRunning = ref(false);

const userForm = reactive({ name: "", email: "", role: "reader" });
const blogForm = reactive({ title: "", slug: "", published: false });
const reviewForm = reactive({ blog_id: "", rating: 4, comment: "" });

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

async function loadUsers() {
  const q = userFilter.value === "all" ? "" : `?role=${userFilter.value}`;
  users.value = await api<User[]>(`users${q}`);
  status.sqlite = true;
}
async function loadBlogs() {
  const q = showDeleted.value ? "?view_deleted=true" : "";
  blogs.value = await api<Blog[]>(`blogs${q}`);
  status.pg = true;
}
async function loadReviews() {
  try {
    reviews.value = await api<Review[]>(`reviews?min_rating=${minRating.value}`);
    status.mongo = true;
  } catch {
    status.mongo = false;
  }
}

async function createUser() {
  try {
    const u = await api<User>("users/create", { ...userForm });
    logs.users = `INSERT ok → id ${u.id.slice(0, 8)}… v${u.version}`;
    userForm.name = "";
    userForm.email = "";
    await loadUsers();
  } catch (e) {
    logs.users = `ERR ${(e as Error).message}`;
  }
}

function selectAuthor(u: User) {
  selectedAuthor.value = selectedAuthor.value?.id === u.id ? null : u;
}

function syncSlug() {
  blogForm.slug = blogForm.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function createBlog() {
  if (!selectedAuthor.value) return;
  try {
    const b = await api<Blog>("blogs/create", { ...blogForm, author_id: selectedAuthor.value.id });
    logs.blogs = `INSERT ok → ${b.slug} by ${selectedAuthor.value.name} (cross-db ref checked)`;
    blogForm.title = "";
    blogForm.slug = "";
    await loadBlogs();
  } catch (e) {
    logs.blogs = `ERR ${(e as Error).message}`;
  }
}

async function like(b: Blog, stale: boolean) {
  try {
    const updated = await api<Blog>("blogs/like", { id: b.id, stale });
    logs.blogs = `PATCH ok → likes=${updated.likes}, version ${b.version}→${updated.version}`;
    await loadBlogs();
  } catch (e) {
    conflictId.value = b.id;
    setTimeout(() => conflictId.value = "", 800);
    logs.blogs = `ERR 409 ${(e as Error).message}`;
  }
}

async function softDelete(b: Blog) {
  try {
    await api("blogs/delete", { id: b.id });
    logs.blogs = `SOFT DELETE → ${b.slug} hidden from reads (meta.deleted_at stamped)`;
    await loadBlogs();
  } catch (e) {
    logs.blogs = `ERR ${(e as Error).message}`;
  }
}

async function restore(b: Blog) {
  try {
    await api("blogs/restore", { id: b.id });
    logs.blogs = `RESTORE → ${b.slug} active again`;
    await loadBlogs();
  } catch (e) {
    logs.blogs = `ERR ${(e as Error).message}`;
  }
}

async function createReview() {
  if (!selectedAuthor.value) return;
  try {
    await api("reviews/create", { ...reviewForm, author_id: selectedAuthor.value.id });
    logs.reviews = `INSERT ok → blog + author verified across pg + sqlite first`;
    reviewForm.comment = "";
    await loadReviews();
  } catch (e) {
    logs.reviews = `ERR ${(e as Error).message}`;
  }
}

async function runFlow() {
  flowRunning.value = true;
  flow.value = [];
  try {
    const res = await fetch("/api/demo/flow");
    const json = await res.json();
    flow.value = json.steps ?? [];
    await Promise.all([loadUsers(), loadBlogs(), loadReviews()]);
  } finally {
    flowRunning.value = false;
  }
}

function slugOf(blogId: string): string {
  return blogs.value.find((b) => b.id === blogId)?.slug ?? blogId.slice(0, 8);
}

function badgeStyle(step: string): Record<string, string> {
  if (step.includes("sqlite") || step.includes("users")) {
    return { background: "var(--db-sqlite)", color: "oklch(15% 0.04 75)" };
  }
  if (step.includes("postgres") || step.includes("blogs") || step.includes("promoted")) {
    return { background: "var(--db-pg)", color: "oklch(14% 0.03 245)" };
  }
  if (step.includes("mongo") || step.includes("reviews")) {
    return { background: "var(--db-mongo)", color: "oklch(14% 0.04 150)" };
  }
  return { background: "oklch(40% 0.02 255)", color: "oklch(90% 0 0)" };
}

onMounted(async () => {
  await Promise.allSettled([loadUsers(), loadBlogs(), loadReviews()]);
});
</script>
