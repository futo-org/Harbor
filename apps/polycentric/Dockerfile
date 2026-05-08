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

# Switches expo web export between SSR (`server`, default) and static SPA
# (`single`) modes. Set to `single` for static hosts like Cloudflare Pages.
ARG EXPO_WEB_OUTPUT=
ENV EXPO_WEB_OUTPUT=$EXPO_WEB_OUTPUT

COPY .npmrc turbo.jsonc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches patches
COPY apps apps
COPY packages packages
COPY tools tools
RUN pnpm install --frozen-lockfile
RUN if [ -z "$SKIP_WORKSPACE_BUILD" ]; then pnpm run build; fi
RUN cd apps/polycentric && npx expo export --platform web
# Non symlinked packages and node_modules
RUN pnpm --filter polycentric-app --prod --legacy deploy /deploy

# Stage 3: Export. Emits just the static web bundle for CI deploys.
FROM scratch AS export
COPY --from=build /app/apps/polycentric/dist /

# Stage 4: Run
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/package.json ./package.json
COPY --from=build /app/apps/polycentric/dist ./dist
COPY --from=build /app/apps/polycentric/server.js ./server.js

EXPOSE 8080
CMD ["node", "server.js"]