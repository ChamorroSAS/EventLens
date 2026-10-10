FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && npm install --global pnpm@10.30.3
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY config/database-modules.json ./config/database-modules.json
COPY scripts/database.mjs ./scripts/database.mjs
RUN pnpm install --frozen-lockfile && pnpm --filter @eventlens/database generate && pnpm --filter @eventlens/database build && pnpm --filter @eventlens/job-queue generate
COPY infra/validation/job-queue ./infra/validation/job-queue
CMD ["node","infra/validation/job-queue/run.mjs"]
