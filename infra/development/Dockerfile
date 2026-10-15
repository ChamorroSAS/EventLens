FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS workspace
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate && chmod -R a+rX /opt/corepack
WORKDIR /workspace
RUN chown node:node /workspace
USER node
RUN mkdir -p /home/node/.eventlens/admin-authority && chmod 700 /home/node/.eventlens/admin-authority
ENV EVENTLENS_DOCKER=1 CI=true
COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node packages ./packages
COPY --chown=node:node apps ./apps
COPY --chown=node:node e2e ./e2e
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node config ./config
COPY --chown=node:node contracts ./contracts
RUN pnpm install --frozen-lockfile
RUN node scripts/workspace.mjs prepare
CMD ["node", "apps/api/dist/main.js"]
FROM workspace AS browser
USER root
RUN pnpm --filter @eventlens/e2e exec playwright install --with-deps chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN mv /root/.cache/ms-playwright /opt/playwright && chmod -R a+rX /opt/playwright
USER node
