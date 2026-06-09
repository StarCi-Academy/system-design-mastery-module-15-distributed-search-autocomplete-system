# syntax=docker/dockerfile:1

# ---- Stage 1: build the NestJS app ----
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: production image with only runtime deps ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TRANSFORMERS_CACHE=/app/.cache
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3020
CMD ["node", "dist/main.js"]
