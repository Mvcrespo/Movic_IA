FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY telegram/package.json ./telegram/package.json
COPY telegram/tsconfig.json ./telegram/tsconfig.json

RUN npm ci

COPY telegram/src ./telegram/src

RUN npm run build --workspace telegram-gateway

CMD ["npm", "run", "start", "--workspace", "telegram-gateway"]
