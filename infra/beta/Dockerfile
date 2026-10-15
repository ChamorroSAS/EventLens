# syntax=docker/dockerfile:1.7
#
# Phoeve Beta release images (EL-EP-020 / Etapa 1 "infraestructura Preview").
#
# This file is *prepared* infrastructure: it is reviewed and built locally, but it
# does not create, publish or deploy anything by itself. Reproducible digest
# pinning, SBOM and provenance attestation remain gated by EL-TK-255.
#
# Targets:
#   api  -> NestJS API runtime (+ one-shot migration entrypoint)
#   web  -> verified static SPA server (apps/web/spa-server.mjs, EL-TK-212)
#
# Build (from the repository root):
#   docker build -f infra/beta/Dockerfile --target api -t phoeve-api:local .
#   docker build -f infra/beta/Dockerfile --target web -t phoeve-web:local .

ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${NODE_IMAGE} AS build
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate && chmod -R a+rX /opt/corepack
WORKDIR /workspace
RUN chown node:node /workspace
COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node packages ./packages
COPY --chown=node:node apps ./apps
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node config ./config
COPY --chown=node:node contracts ./contracts
# The deploy bundle travels inside the release image so that the host can extract
# the exact revision that matches the running image (see infra/beta/deploy/).
COPY --chown=node:node infra/beta ./infra/beta
RUN pnpm install --frozen-lockfile
# EVENTLENS_DOCKER=1 keeps scripts/workspace.mjs executing in-place instead of
# delegating to Docker Compose; CI=true disables interactive tooling prompts.
RUN EVENTLENS_DOCKER=1 CI=true node scripts/workspace.mjs prepare
# Angular builds the production configuration by default (apps/web/angular.json).
RUN EVENTLENS_DOCKER=1 CI=true pnpm --filter @eventlens/web build

FROM build AS api
ENV NODE_ENV=production
# scripts/database.mjs rewrites packages/database/prisma on every run, including
# the one-shot migration entrypoint. The build stage assembles it as root, so the
# runtime user has to own it or the entrypoint fails with EACCES.
RUN chown -R node:node /workspace/packages/database/prisma
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production
WORKDIR /workspace
# The SPA server only uses Node builtins, so no dependency tree is shipped.
COPY --from=build /workspace/apps/web/spa-server.mjs ./apps/web/spa-server.mjs
COPY --from=build /workspace/apps/web/dist ./apps/web/dist
# spa-server.mjs binds 127.0.0.1 by default; the edge container sets SPA_HOST.
USER node
EXPOSE 4201
CMD ["node", "apps/web/spa-server.mjs"]
