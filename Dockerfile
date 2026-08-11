# Tanki Je'ne' — image produksi Next.js (standalone).
#
# Dibangun berlapis supaya rebuild karena perubahan kode tidak ikut mengunduh
# ulang ~470 paket: layer dependencies hanya berubah saat lockfile berubah.

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Template ini memakai stack bleeding-edge (Next 16 / React 19 / Tailwind v4),
# jadi resolusi peer dependency-nya butuh --legacy-peer-deps — sama seperti
# instruksi setup di README.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# OpenSSL dibutuhkan Prisma saat generate & runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Client Prisma di-generate ke src/generated/prisma (lihat schema.prisma) dan
# sengaja tidak ikut di repo, jadi ia harus dibuat di dalam image.
RUN npx prisma generate

# `next build` mengevaluasi modul yang menyentuh env; nilai di bawah hanya
# placeholder agar build tidak gagal, dan SELALU ditimpa env runtime container.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="mysql://build:build@127.0.0.1:3306/build" \
    NODE_ENV=production
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Keluaran `output: "standalone"` sudah memuat node_modules yang benar-benar
# dipakai, jadi image runtime tidak perlu seluruh isi node_modules.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Jangan jalan sebagai root.
USER node

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/lacak > /dev/null || exit 1

CMD ["node", "server.js"]
