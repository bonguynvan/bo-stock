# V-Investment OS — Frontend (Phase 1: dev server)
FROM node:24-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

EXPOSE 3000

# Phase 1: run the dev server. Swap for `npm run build && npm run start` for prod.
CMD ["npm", "run", "dev"]
