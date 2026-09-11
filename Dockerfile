# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 ships prebuilt binaries for this platform, but keep a
# toolchain here so a version without one compiles instead of failing the build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Manifests first: this layer is cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
RUN npm run build --workspace=client \
 && npm prune --omit=dev

# -------------------------------------------------------------- runtime stage
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

# Only what the server actually needs at runtime: no toolchain, no client source.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 8080
CMD ["node", "server/src/index.js"]
