FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json ./
RUN bun install --frozen-lockfile --production
COPY . .
EXPOSE 8080
CMD ["bun", "server.js"]
