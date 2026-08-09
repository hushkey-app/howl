# Build context must be the repo root — the workspace deno.json and packages/
# live one level up. Invoke from the repo root:
#
#   docker build -f examples/leotermine-www/Dockerfile -t leotermine-www .
#   docker run --rm -p 8000:8000 leotermine-www
#
# Pass the commit so chunk URLs get a stable per-deploy build id:
#   --build-arg GIT_REVISION=$(git rev-parse HEAD)

FROM denoland/deno:2.9.4 AS builder

ARG GIT_REVISION
ENV DENO_DEPLOYMENT_ID=${GIT_REVISION}
ENV DENO_BUILD_STAGE=PRODUCTION

WORKDIR /app
COPY . .

WORKDIR /app/examples/leotermine-www

RUN deno task build
RUN deno cache --reload ./dist/compiled-entry.js
RUN deno task compile

# `deno compile` embeds the runtime, dist/ and static/ into one binary, so the
# final image needs no Deno and no source — just a libc. Debian slim keeps it
# a fraction of the builder's size.
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --create-home --uid 10001 app

WORKDIR /app
COPY --from=builder --chown=app:app /app/examples/leotermine-www/dist/bin/leotermine /app/bin/leotermine

USER app

# Read by dist/compiled-entry.js. Hostname is left unset so Deno.serve binds
# 0.0.0.0 — binding 127.0.0.1 inside a container makes it unreachable.
ENV DENO_PORT=8000
# Canonical origin for OG and canonical URLs. Override per environment.
ENV SITE_ORIGIN=https://leotermine.com

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${DENO_PORT}/" > /dev/null || exit 1

CMD ["/app/bin/leotermine"]
