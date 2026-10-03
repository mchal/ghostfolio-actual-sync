# Dependency build stage.
# better-sqlite3 (pulled in by @actual-app/api) has no prebuilt binary for every
# platform, so it falls back to node-gyp and needs python3 + a C++ toolchain.
FROM node:22-slim AS deps

WORKDIR /app

COPY package*.json ./

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    npm ci --omit=dev && \
    npm cache clean --force && \
    rm -rf /var/lib/apt/lists/*

# Runtime stage - no compiler toolchain in the final image.
FROM node:22-slim

# Set working directory in container
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Copy application code
COPY sync.js ./

# Create volume mount point for config
VOLUME ["/app/config"]

# Set default environment variables
ENV NODE_ENV=production
ENV CONFIG_PATH=/app/config/config.json

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Default command
CMD ["node", "sync.js"]