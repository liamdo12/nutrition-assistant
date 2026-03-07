# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
# Copy everything (filtered by .dockerignore)
COPY . .
# Install all dependencies
RUN yarn install --frozen-lockfile --production=false
# Generate Prisma client
RUN yarn workspace @nutrition/api exec prisma generate
# Build shared package first, then API
RUN yarn workspace @nutrition/shared build || true
RUN yarn workspace @nutrition/api build
# Flatten workspace-local deps into root node_modules for single-dir production image
RUN cp -a /app/apps/api/node_modules/. /app/node_modules/ \
    && rm -rf /app/node_modules/@nutrition/shared \
    && cp -a /app/packages/shared /app/node_modules/@nutrition/shared

# Stage 2: Production
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy built API
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./

# Copy all dependencies (root + workspace-local merged in builder)
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/main.js"]
