# Multi-stage build for the TanStack Start / Nitro app.
#
# The build stage runs on the same base image as runtime so the `sharp`
# native binary installed by `npm ci` here is guaranteed compatible — Nitro's
# own file-tracer (used for its "install just the traced deps" flow) picked
# the wrong libc variant for sharp in testing (a bug in this nitro beta's
# tracer, reproduced with both alpine/musl and slim/glibc images), so this
# copies node_modules directly from the build stage instead of trusting that
# trace.

FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.output ./.output
# Nitro bundles everything bundleable into .output/server/_libs/*.mjs — the
# only thing still needed from node_modules at runtime is sharp's native
# binary (and its @img/* platform packages), which can't be bundled as JS.
COPY --from=build /app/node_modules/sharp ./node_modules/sharp
COPY --from=build /app/node_modules/@img ./node_modules/@img

# Local-disk storage for recipe images, avatars, and chat images — mounted
# as a volume in docker-compose.yml. Owned by the non-root `node` user that
# ships in the official Node image.
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads
USER node

EXPOSE 3000
ENV PORT=3000
CMD ["node", ".output/server/index.mjs"]
