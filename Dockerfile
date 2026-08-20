# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SITE_URL
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 LD_LIBRARY_PATH=/app/lib
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm/@img+sharp-libvips-linuxmusl-*@*/node_modules/@img/sharp-libvips-linuxmusl-*/lib/libvips-cpp.so.* /app/lib/
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
RUN mkdir -p /app/storage/uploads /app/.next/cache && chown -R nextjs:nodejs /app/storage /app/.next/cache
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/start-production.mjs"]
