# Imagem base com Node.js leve para correr o serviço.
FROM node:22-alpine

# Pasta de trabalho dentro do container.
WORKDIR /app

# Copia a configuração do monorepo.
COPY package.json package-lock.json ./
# Copia a configuração deste serviço.
COPY calendar-service/package.json ./calendar-service/package.json
COPY calendar-service/tsconfig.json ./calendar-service/tsconfig.json

# Instala as dependências.
RUN npm ci

# Copia o código fonte do calendário.
COPY calendar-service/src ./calendar-service/src

# Compila o serviço.
RUN npm run build --workspace calendar-service

# Arranca o serviço quando o container sobe.
CMD ["npm", "run", "start", "--workspace", "calendar-service"]
