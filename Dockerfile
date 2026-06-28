# ---------- Stage 1: frontend bouwen ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- Stage 2: backend bouwen ----------
FROM node:22-alpine AS server-build
WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/opdebank.sqlite

# Alleen productie-afhankelijkheden installeren.
COPY server/package*.json ./
RUN npm ci --omit=dev

# Gecompileerde backend en gebouwde frontend kopiëren.
COPY --from=server-build /server/dist ./dist
COPY --from=web /web/dist ./public

# Database leeft in een gemount volume.
RUN mkdir -p /data
VOLUME /data

EXPOSE 8080
CMD ["node", "dist/index.js"]
