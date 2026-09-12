FROM node:24.10.0-slim
WORKDIR /app
COPY package*.json ./
COPY vendor ./vendor
RUN npm ci --omit=dev
COPY keeper ./keeper
COPY lib ./lib
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "keeper/signer-server.ts"]
