FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/backend
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci
COPY backend ./
RUN npm run prisma:generate && npm run build

FROM node:22-bookworm-slim
WORKDIR /app/backend
ENV NODE_ENV=production \
    HOME=/home/app \
    XDG_CACHE_HOME=/home/app/.cache
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && groupadd --system app \
    && useradd --system --gid app --create-home --home-dir /home/app --shell /usr/sbin/nologin app \
    && mkdir -p /app/backend/uploads /home/app/.cache \
    && chown -R app:app /app /home/app \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=app:app --from=backend-build /app/backend/node_modules ./node_modules
COPY --chown=app:app --from=backend-build /app/backend/package*.json ./
COPY --chown=app:app --from=backend-build /app/backend/prisma ./prisma
COPY --chown=app:app --from=backend-build /app/backend/dist ./dist
COPY --chown=app:app --from=frontend-build /app/frontend/dist /app/frontend/dist
COPY --chown=app:app docs/prototype /app/docs/prototype
COPY --chown=app:app ["GenBioCa-Compliance-Platform (1).html", "/app/GenBioCa-Compliance-Platform (1).html"]
USER app
CMD ["npm", "run", "start:docker"]
