FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY dist ./dist
RUN mkdir -p /data
ENV HOST=0.0.0.0 PORT=10425 RECORDER_PATH=/data/parity-recorder.jsonl
VOLUME ["/data"]
EXPOSE 10425
CMD ["node", "dist/src/server.js"]
