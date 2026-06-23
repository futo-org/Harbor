# Stage 1: Base — Node + pnpm
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

# Stage 2: Dependencies + Build
FROM base AS build
WORKDIR /app

# EXPO_PUBLIC_* env vars are inlined into the bundle at build time, so
# they must be present during `expo export`. Passed in via build-arg.
ARG EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS
ENV EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS=$EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS

# CI populates packages/js-*/dist, packages/react-native/lib, and
# packages/rs-core-wasm-browser from upstream artifacts and sets this
# to skip the redundant `pnpm run build`. Local builds leave it unset
# and fall through to a full workspace build.
ARG SKIP_WORKSPACE_BUILD=

COPY .npmrc turbo.jsonc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches patches
COPY apps apps
COPY packages packages
COPY tools tools
RUN pnpm install --frozen-lockfile
RUN if [ -z "$SKIP_WORKSPACE_BUILD" ]; then pnpm run build; fi
# Non symlinked packages and node_modules
RUN pnpm --filter polycentric-app --prod --legacy deploy /deploy
RUN cd /deploy && npx expo export --platform web

# Stage 3: Run
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /deploy .

EXPOSE 8080
CMD ["node", "server.js"]