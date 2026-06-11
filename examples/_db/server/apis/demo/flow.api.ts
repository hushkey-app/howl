import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";
import { usersService } from "../../services/users/users.service.ts";
import { blogsService } from "../../services/blogs/blogs.service.ts";
import { reviewsService } from "../../services/reviews/reviews.service.ts";
import type { Blog } from "../../services/blogs/blogs.schema.ts";

export default defineApi({
  name: "Demo Flow",
  directory: "demo",
  method: "GET",
  roles: [],
  responses: {
    200: z.object({
      databases: z.object({ users: z.string(), blogs: z.string(), reviews: z.string() }),
      steps: z.array(z.object({ step: z.string(), info: z.string() })),
    }),
  },
  // One scenario across all three databases: an author in SQLite writes blogs
  // in Postgres that get reviewed in MongoDB — referenced by string ids only.
  // Idempotent: wipes all three collections first.
  handler: async () => {
    const steps: { step: string; info: string }[] = [];
    const log = (step: string, info: string) => steps.push({ step, info });

    for (const service of [usersService, blogsService, reviewsService]) {
      if (!service) continue;
      const leftovers = await service.find({ viewDeleted: true });
      for (const doc of leftovers) await service.delete(doc.id, { hard: true });
    }
    log("cleanup", "all three collections wiped");

    // users — SQLite
    const ada = await usersService.create(
      { email: "ada@example.com", name: "Ada", role: "author" },
      { executionerId: "demo" },
    );
    await usersService.create({ email: "bob@example.com", name: "Bob" });
    const byEmail = await usersService.getByEmail("ada@example.com");
    log("users (sqlite)", `created Ada (${ada.role}) + Bob; getByEmail → ${byEmail?.name}`);

    // blogs — Postgres, authored by the SQLite user
    const post = await blogsService.create(
      { title: "Storage ladders", slug: "storage-ladders", published: true, author_id: ada.id },
      { executionerId: ada.id },
    );
    await blogsService.create(
      { title: "Draft thoughts", slug: "draft-thoughts", author_id: ada.id },
    );
    log(
      "blogs (postgres)",
      `2 created by author ${ada.name}; published() → ${
        (await blogsService.published()).map((b) => b.slug).join(", ")
      }`,
    );

    const liked = await blogsService.patch(post.id, { likes: 42 });
    log("patch + version", `likes=${liked?.likes}, version ${post.version}→${liked?.version}`);
    try {
      await blogsService.patch(post.id, { likes: 0, version: 1 } as Partial<Blog>);
      log("optimistic lock", "UNEXPECTED: stale version accepted");
    } catch {
      log("optimistic lock", "stale version=1 rejected (current is 2)");
    }
    log(
      "find $gte on promoted column",
      `min_likes=10 → ${
        (await blogsService.find({ query: { likes: { $gte: 10 } } })).map((b) => b.slug).join(", ")
      }`,
    );

    // reviews — MongoDB, referencing the Postgres blog and SQLite users
    if (reviewsService) {
      for (const [rating, comment] of [[5, "great"], [4, "good"], [2, "meh"]] as const) {
        await reviewsService.create(
          { blog_id: post.id, author_id: ada.id, rating, comment },
          { executionerId: ada.id },
        );
      }
      const top = await reviewsService.topForBlog(post.id);
      log(
        "reviews (mongo)",
        `3 created; topForBlog($gte 4) → ratings [${top.map((r) => r.rating).join(", ")}]`,
      );
    } else {
      log("reviews (mongo)", "skipped — set MONGO_URL to include MongoDB in the flow");
    }

    // soft delete / restore on the Postgres side
    await blogsService.delete(post.id, { executionerId: "demo" });
    log(
      "soft delete",
      `published() now → [${(await blogsService.published()).map((b) => b.slug)}]`,
    );
    await blogsService.restore(post.id);
    log("restore", `published() again → [${(await blogsService.published()).map((b) => b.slug)}]`);

    return {
      status: 200,
      databases: {
        users: "sqlite (node:sqlite, data/app.db)",
        blogs: Deno.env.get("PG_URL") ? "postgres (server)" : "postgres (embedded PGlite)",
        reviews: reviewsService ? "mongodb" : "not configured (MONGO_URL unset)",
      },
      steps,
    };
  },
});
