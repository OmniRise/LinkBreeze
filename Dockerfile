# ─── Build Stage ───────────────────────────────────────
FROM node:22.23.0-alpine AS builder

# Native build tools for better-sqlite3 (compiles from source on Alpine/musl)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
# Generous npm fetch timeouts/retries: under QEMU emulation (local arm64
# verification) tarball downloads are slow enough to trip npm's 30s default
# fetch timeout, aborting the whole install on a random package.
# npm ci = the lockfile is the build input (CD-6): no silent drift between
# what CI tested and what ships. Same generous QEMU timeouts as before.
RUN npm ci --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000

COPY . .

# Demo env vars — passed as build args so next.config.ts can evaluate them
# at build time (Next.js bakes config into the standalone output).
# For non-demo builds, omit these args (defaults to secure mode).
ARG DEMO_MODE=false
ARG DEMO_AUTO_LOGIN=false
ARG DEMO_FRAME_ORIGIN=""
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV DEMO_MODE=${DEMO_MODE}
ENV DEMO_AUTO_LOGIN=${DEMO_AUTO_LOGIN}
ENV DEMO_FRAME_ORIGIN=${DEMO_FRAME_ORIGIN}
ENV NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE}
# Dummy DB path for build-time — the real path is set at runtime via volumes
ENV DATABASE_PATH=/tmp/build-dummy.db

RUN npx next build

# ─── Runner Stage ──────────────────────────────────────
FROM node:22.23.0-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/app/data/linkbreeze.db

# Create data directory as root BEFORE switching to node user
RUN mkdir -p /app/data && chown node:node /app/data

# Copy built app with correct ownership
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Switch to non-root user
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/api/health || exit 1

# Override Docker's HOSTNAME so Next.js binds to 0.0.0.0
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
