# Multi-stage Dockerfile for QuickBooks MCP Server
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code first (before npm ci triggers prepare script)
COPY src/ ./src/

# Install dependencies (including dev dependencies for build)
# This will trigger "prepare" script which runs "npm run build"
RUN npm ci

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies (skip prepare script)
RUN npm ci --omit=dev --ignore-scripts

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create data directory for user realm mappings
RUN mkdir -p /app/data

# Set environment to production by default
ENV NODE_ENV=production

# Expose port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the HTTP server
CMD ["node", "dist/index-http.js"]
