FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js ./
COPY public ./public
COPY admin ./admin
RUN mkdir -p /data/uploads /data/cache && chown -R node:node /data /app
ENV NODE_ENV=production
USER node
EXPOSE 3000
VOLUME /data
CMD ["node", "server.js"]
