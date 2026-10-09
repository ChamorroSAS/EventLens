FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
RUN apt-get update && apt-get install -y --no-install-recommends openssl docker.io && rm -rf /var/lib/apt/lists/* && npm install --global pnpm@10.30.3
WORKDIR /workspace
ENV DOCKER_API_VERSION=1.44
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/job-queue ./packages/job-queue
COPY packages/media-execution ./packages/media-execution
RUN pnpm install --frozen-lockfile && pnpm --filter @eventlens/job-queue generate && pnpm --filter @eventlens/job-queue build && pnpm --filter @eventlens/media-execution generate && pnpm --filter @eventlens/media-execution build
COPY infra/validation/media-execution ./infra/validation/media-execution
RUN chmod +x /workspace/infra/validation/media-execution/late-docker.mjs
CMD ["node","infra/validation/media-execution/run.mjs"]
