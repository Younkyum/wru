# WRU: API + 빌드된 UI를 한 포트(8787)로 서빙
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production WRU_API_PORT=8787
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/samples ./samples
USER node
EXPOSE 8787
CMD ["npx", "tsx", "src/server/index.ts"]
