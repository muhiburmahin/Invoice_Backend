# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable || true
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build (optional, for tsc output) ----
FROM deps AS build
COPY . .
RUN npx prisma generate

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY package.json ./
USER nodejs
EXPOSE 5000
CMD ["npx", "tsx", "src/server.ts"]
