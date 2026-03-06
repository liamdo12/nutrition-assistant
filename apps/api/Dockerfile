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

# Stage 2: Production
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy built API
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./

# Copy all dependencies (hoisted to root by yarn workspaces)
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/main.js"]
