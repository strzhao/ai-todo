# ai-todo Dockerfile (Next.js standalone, no Prisma)
# 多阶段:base → deps → builder → runner
# 参照 HANDOFF-VPS-MIGRATION.md 步骤 3.2

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
# 复制 monorepo 根 + workspace 包的 package.json 目录结构（npm ci 需要完整的 workspace 配置）
COPY package*.json ./
RUN mkdir -p apps/web apps/cli
COPY apps/web/package*.json ./apps/web/
COPY apps/cli/package*.json ./apps/cli/
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
# --ignore-scripts 跳过 prepare（husky），生产构建不需要 git hooks
RUN npm ci --legacy-peer-deps --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat wget
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=0.0.0.0
# monorepo: web 产物在 apps/web/.next 下（apps/cli 为 npm 发布包，不进镜像）
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3002
CMD ["node", "apps/web/server.js"]
