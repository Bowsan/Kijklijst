# ---------- Stage 1: frontend bouwen ----------
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- Stage 2: backend bouwen ----------
# better-sqlite3 is een native module; de build-tools zorgen dat hij ook
# wordt gecompileerd als er geen kant-en-klare binary voor Node 24 is.
FROM node:24-alpine AS server-build
RUN apk add --no-cache python3 make g++
WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build
# Dev-afhankelijkheden eruit, de gecompileerde native binary blijft staan.
RUN npm prune --omit=dev

# ---------- Stage 3: runtime ----------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/opdebank.sqlite

# Schone productie-node_modules en gecompileerde backend overnemen.
COPY --from=server-build /server/node_modules ./node_modules
COPY --from=server-build /server/dist ./dist
COPY --from=server-build /server/package.json ./package.json

# Gebouwde frontend serveren vanuit de backend.
COPY --from=web /web/dist ./public

# Database leeft in een gemount volume.
RUN mkdir -p /data
VOLUME /data

EXPOSE 8080
CMD ["node", "dist/index.js"]
