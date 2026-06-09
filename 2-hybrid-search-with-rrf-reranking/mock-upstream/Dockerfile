FROM node:20-alpine AS runtime
WORKDIR /app
COPY server.js ./
EXPOSE 4001 4002
CMD ["node", "server.js"]
