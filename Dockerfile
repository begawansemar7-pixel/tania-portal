# syntax=docker/dockerfile:1.7

# ─── Build ────────────────────────────────────────────────────────────────────
# One build stage for the whole workspace: the packages are shared, so building
# them twice would risk two apps shipping different versions of the same types.
FROM node:22-bookworm-slim AS build
WORKDIR /repo

ENV NEXT_TELEMETRY_DISABLED=1

# Manifests first, so a source change does not invalidate the dependency layer.
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/tania/package.json packages/tania/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/

RUN npm ci --ignore-scripts

COPY . .

# Prisma's client is generated, not committed; `--ignore-scripts` above skipped it.
RUN npm run build:packages \
 && npm --workspace @tania/api run prisma:generate \
 && npm --workspace @tania/api run build \
 && npm --workspace @tania/web run build

# Build tooling must not ship. Every high-severity advisory in this tree today
# is in a dev dependency — the Prisma CLI and the Nest CLI — and copying an
# unpruned `node_modules` would put them in the runtime image anyway.
RUN npm prune --omit=dev

# ─── Portal ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS web
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next's standalone output already contains the pruned node_modules it needs.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

# Never root: a container that is compromised should not also be privileged.
USER node
EXPOSE 3000

# Readiness is what an orchestrator should poll; liveness only restarts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]

# ─── Backend ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS api
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Pruned by the build stage: production dependencies only.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main"]
