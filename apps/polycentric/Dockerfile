# Stage 1: Base — Node + pnpm
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

# Stage 2: Dependencies + Build
FROM base AS build
WORKDIR /app

COPY .npmrc turbo.jsonc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps apps
COPY packages packages
COPY tools tools
RUN pnpm install --frozen-lockfile
# Build js-*
RUN pnpm run build
# Export Expo static app
RUN cd apps/polycentric && npx expo export --platform web
# Self-contained prod bundle: real-file node_modules + package.json (no symlinks)
RUN pnpm --filter polycentric-app --prod --legacy deploy /deploy

# Stage 3: Run
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/package.json ./package.json
COPY --from=build /app/apps/polycentric/dist ./dist
COPY --from=build /app/apps/polycentric/server.js ./server.js

EXPOSE 3000
CMD ["node", "server.js"]