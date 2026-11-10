# Stage 1: Base, Node
FROM node:26-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Stage 2: Dependencies + Build
FROM base AS build
WORKDIR /app

# CI populates packages/js-*/dist, packages/react-native/lib, and the
# packages/rs-core-wasm wasm build from upstream artifacts and sets this
# to skip the redundant `pnpm run build`. Local builds leave it unset
# and fall through to a full workspace build.
ARG SKIP_WORKSPACE_BUILD=

COPY turbo.jsonc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN npm install -g "$(node -p "require('./package.json').packageManager")"
COPY patches patches
COPY apps apps
COPY packages packages
COPY tools tools
# --ignore-scripts: the only dependency allowed to run install scripts is
# better-sqlite3 (see onlyBuiltDependencies), and it reaches this image only
# through @polycentric/js-node, which polycentric-app does not depend on.
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN if [ -z "$SKIP_WORKSPACE_BUILD" ]; then pnpm run build; fi
# Non symlinked packages and node_modules
RUN pnpm --filter polycentric-app --prod --legacy deploy /deploy
# Inlined by `expo export` (app.config.ts reads APP_VERSION). Declared after
# install and deploy so a new value keeps their layers cached.
ARG EXPO_PUBLIC_HARBOR_SEED_SERVERS
ARG EXPO_PUBLIC_HARBOR_VERIFIER_SERVERS
ARG APP_VERSION
ENV EXPO_PUBLIC_HARBOR_SEED_SERVERS=${EXPO_PUBLIC_HARBOR_SEED_SERVERS} \
    EXPO_PUBLIC_HARBOR_VERIFIER_SERVERS=${EXPO_PUBLIC_HARBOR_VERIFIER_SERVERS} \
    APP_VERSION=$APP_VERSION
RUN cd /deploy && npx expo export --platform web

# Stage 3: Run
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /deploy .

EXPOSE 8080
CMD ["node", "server.js"]
