# Imagem base com Node.js leve para correr o serviço.
FROM node:22-alpine

# Pasta de trabalho dentro do container.
WORKDIR /app

# Copia a configuração do monorepo.
COPY package.json package-lock.json ./
# Copia a configuração deste serviço.
COPY normalizer-service/package.json ./normalizer-service/package.json
COPY normalizer-service/tsconfig.json ./normalizer-service/tsconfig.json

# Instala as dependências.
RUN npm ci

# Copia o código fonte do serviço.
COPY normalizer-service/src ./normalizer-service/src

# Compila o serviço.
RUN npm run build --workspace normalizer-service

# Arranca o serviço quando o container sobe.
CMD ["npm", "run", "start", "--workspace", "normalizer-service"]
