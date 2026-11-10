# Multi-stage Dockerfile for InvoiceDesk
# Node 20 LTS Alpine image for minimal size and high security

FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy source code and migrations
COPY src ./src
COPY migrations ./migrations

# Compile TypeScript
RUN npm run build

# --- Production Runner Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled files and migrations from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start the server
CMD ["node", "dist/server.js"]
