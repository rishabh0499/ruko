# Ruko on Cloud Run. Zero npm dependencies, so the image is just Node + the source.
FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY data ./data
COPY public ./public
ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "server.js"]
