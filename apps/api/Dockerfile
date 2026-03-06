# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
# Copy workspace config
COPY package.json yarn.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN yarn install --frozen-lockfile --production=false

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client
RUN yarn workspace @nutrition/api exec prisma generate
# Build shared package first, then API
RUN yarn workspace @nutrition/shared build || true
RUN yarn workspace @nutrition/api build

# Stage 3: Production
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy built API
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy generated Prisma client from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nodejs
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/main.js"]
