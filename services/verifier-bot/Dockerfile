# Production image (built in CI). Build context is the repo root (see
# build_services.yml — buildkit `context=.`).
#
# The js SDKs (js-core, js-node, js-storage-sqlite) and rs-core-wasm are
# built by CI and their `dist/` is pulled into the context as artifacts (the
# verifier-bot image job `needs: [js-sdks-build, rs-core-wasm-wasm-build]`), so
# this image does NOT build them. For a self-contained local build that builds
# the SDKs itself, use Dockerfile.dev. rs-core-wasm ships a compiled `.js`
# (node export condition), so the bot tsc-compiles to dist/ and runs under node.

# Stage 1: Base — Node + pnpm
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

# Stage 2: Install (SDK dist come prebuilt from the context)
FROM base AS build
WORKDIR /app
# Puppeteer's Chromium comes from the runtime image, not the install.
ENV PUPPETEER_SKIP_DOWNLOAD=1
# No git in the build context; make husky's root `prepare` script a no-op.
ENV HUSKY=0
# Toolchain for better-sqlite3's native binding (falls back to compiling when
# no prebuilt binary matches).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches patches
COPY tools tools
# Prebuilt by CI (js-sdks-build, rs-core-wasm-wasm-build); dist/ arrives via
# the job's artifacts.
COPY packages/js-core packages/js-core
COPY packages/js-storage-sqlite packages/js-storage-sqlite
COPY packages/js-storage-postgres packages/js-storage-postgres
COPY packages/js-node packages/js-node
COPY packages/rs-core-wasm packages/rs-core-wasm
COPY services/verifier-bot services/verifier-bot

# allowUnusedPatches: the workspace's patchedDependencies target frontend
# packages (expo, uniffi-bindgen-react-native) absent from this slim install.
RUN pnpm install --frozen-lockfile --config.allowUnusedPatches=true
# Compile the bot to dist/ against the prebuilt SDKs (this also typechecks).
RUN pnpm --filter @polycentric/verifier-bot build
# Flatten the prod dependency closure into a self-contained node_modules with
# `pnpm deploy`. inject-workspace-packages enables the non-legacy deploy (a
# correct prod closure) without changing the monorepo's global install.
RUN pnpm --filter @polycentric/verifier-bot --prod \
  --config.inject-workspace-packages=true --config.allowUnusedPatches=true \
  deploy /deploy

# Stage 3: Run
FROM node:24-slim AS runner
WORKDIR /app/services/verifier-bot
ENV NODE_ENV=production
# System Chromium for the Puppeteer-based verifiers (e.g. Kick).
ENV POLYCENTRIC_VERIFIER_BOT_PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*

# The self-contained deploy (node_modules + package.json) plus the bot's
# tsc-compiled dist/. rs-core-wasm's node export resolves to compiled .js,
# so the whole chain runs under plain node.
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/package.json ./package.json
COPY --from=build /app/services/verifier-bot/dist ./dist
RUN mkdir -p state && chown -R node:node /app/services/verifier-bot/state

USER node
EXPOSE 3002
CMD ["node", "dist/app.js"]
