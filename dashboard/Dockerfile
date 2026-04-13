# Imagem base com Node.js leve para correr o serviço.
FROM node:22-alpine

# Pasta de trabalho dentro do container.
WORKDIR /app

# Copia a configuração do monorepo.
COPY package.json package-lock.json ./
# Copia a configuração deste serviço.
COPY dashboard/package.json ./dashboard/package.json
COPY dashboard/tsconfig.json ./dashboard/tsconfig.json
COPY dashboard/vite.config.ts ./dashboard/vite.config.ts

# Instala as dependências.
RUN npm ci

# Copia o código fonte da dashboard.
COPY dashboard/src ./dashboard/src
COPY dashboard/frontend ./dashboard/frontend
COPY dashboard/public ./dashboard/public

# Compila o serviço.
RUN npm run build --workspace dashboard-service

# Arranca o serviço quando o container sobe.
CMD ["npm", "run", "start", "--workspace", "dashboard-service"]
