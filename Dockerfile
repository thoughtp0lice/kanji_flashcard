FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run bundle

FROM node:24-slim
WORKDIR /app
COPY --from=build /app/build/kanji-server.mjs .
ENV PORT=8033 KANJI_DATA=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8033
USER node
CMD ["node", "kanji-server.mjs"]
