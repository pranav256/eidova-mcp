FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY vendor ./vendor
COPY scripts ./scripts
COPY assets ./assets
COPY content ./content
COPY tsconfig.json tsup.config.ts ./
COPY LICENSE NOTICE README.md SECURITY.md CHANGELOG.md ./
COPY docs ./docs
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/.open-design /app/.eidova && chown node:node /app/.open-design /app/.eidova
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/main.js"]
