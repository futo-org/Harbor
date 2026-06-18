# Stage 1: Base — Node + pnpm
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

# Stage 2: Dependencies + Build
FROM base AS build
WORKDIR /app

# Don't let puppeteer download its own Chromium during install — the runtime
# image provides a system Chromium (see PUPPETEER_EXECUTABLE_PATH in the run
# stage).
ENV PUPPETEER_SKIP_DOWNLOAD=1

# Only the workspace pieces the scraper needs: the root manifests, patches,
# `tools` (for @polycentric/tsconfig), and the service itself. The other
# workspace packages (apps/*, packages/*) are absent here — pnpm tolerates
# missing workspace members and installs only what's present.
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches patches
COPY tools tools
COPY services/scraper services/scraper

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @polycentric/scraper build
# Flatten into a self-contained, non-symlinked prod node_modules + package.json.
# `allowUnusedPatches`: the workspace's patchedDependencies target frontend
# packages (expo, uniffi-bindgen-react-native) not present in this slim build,
# which `deploy` would otherwise reject.
RUN pnpm --filter @polycentric/scraper --prod --legacy \
  --config.allowUnusedPatches=true deploy /deploy

# Stage 3: Run
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# System Chromium provided below; puppeteer/browserless launch it.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# PORT is supplied at runtime (compose / `docker run -e PORT=…`); the service
# falls back to 3002 when unset.

# Headless Chromium for prerendering. The Debian `chromium` package installs
# to /usr/bin/chromium and pulls in the shared libs it needs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/package.json ./package.json
COPY --from=build /app/services/scraper/dist ./dist

# Drop root for the service (and the Chromium it spawns).
USER node

EXPOSE 3002
CMD ["node", "dist/index.js"]
