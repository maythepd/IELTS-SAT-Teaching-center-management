# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci

# Stage 2: Build project (frontend next build + backend typecheck)
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package.json package-lock.json ./
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY database/ ./database/

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV BACKEND_PORT=4000
ENV HOSTNAME=0.0.0.0
ENV API_UPSTREAM=http://127.0.0.1:4000

# Copy installed dependencies (hoisted by npm workspaces)
COPY --from=builder /app/node_modules ./node_modules

# Copy Next.js frontend build output & static files
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/next.config.mjs ./frontend/
COPY --from=builder /app/frontend/package.json ./frontend/

# Copy backend TypeScript source files and scripts
COPY --from=builder /app/backend/src ./backend/src
COPY --from=builder /app/backend/scripts ./backend/scripts
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/backend/tsconfig.json ./backend/

# Copy database migrations and workspace root package.json
COPY --from=builder /app/database ./database
COPY --from=builder /app/package.json ./package.json

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create data directory for uploads and ensure empty .env exists for node --env-file
RUN mkdir -p /app/backend/data && touch /app/backend/.env

EXPOSE 3000 4000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
