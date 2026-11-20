FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs relay.js node-store.mjs headers.js ./
COPY public/ ./public/
COPY drizzle/ ./drizzle/
RUN mkdir -p data && chown node:node data
USER node
ENV HOST=0.0.0.0
ENV PORT=5173
EXPOSE 5173
CMD ["node", "server.mjs"]

