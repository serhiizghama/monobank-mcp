FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
ENV MONOBANK_TOKEN=""
CMD ["node", "dist/index.js"]
