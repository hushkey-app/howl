import { Howl, staticFiles } from "@hushkey/howl";
import { vueEngine } from "@hushkey/howl-vue";
import { studio } from "@hushkey/studio";
import { apiConfig, type State } from "../howl.config.ts";
import { usersService } from "./services/users/users.service.ts";
import { blogsService } from "./services/blogs/blogs.service.ts";
import { reviewsService } from "./services/reviews/reviews.service.ts";
import { sessionsService } from "./services/sessions/sessions.service.ts";

export const app: Howl<State> = new Howl<State>({
  logger: true,
  debug: true,
  engines: { vue: vueEngine() },
});

app.use(staticFiles());

// One admin over all four databases, speaking the service contract —
// dashboard at /studio (use mode: "component" to mount only the JSON API
// and embed <Studio /> from @hushkey/studio/component in your own page).
app.use(studio({
  services: {
    users: usersService,
    blogs: blogsService,
    reviews: reviewsService,
    sessions: sessionsService,
  },
}));

app.fsApiRoutes(apiConfig);
app.fsClientRoutes();

export default { app };
