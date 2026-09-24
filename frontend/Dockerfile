# V-Investment OS — Frontend. Default target = production build (next build + next start);
# `--target dev` = hot-reload dev server (used by docker-compose.dev.yml).
FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

FROM base AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS prod
# NEXT_PUBLIC_* vars are inlined at build time, so the API URL must be a build arg.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
