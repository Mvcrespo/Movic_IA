# Imagem base com Node.js leve para correr o serviço.
FROM node:22-alpine

# Pasta de trabalho dentro do container.
WORKDIR /app

# Copia a configuração do monorepo.
COPY package.json package-lock.json ./
# Copia a configuração deste serviço.
COPY llm-service/package.json ./llm-service/package.json
COPY llm-service/tsconfig.json ./llm-service/tsconfig.json

# Instala as dependências.
RUN npm ci

# Copia o código fonte do serviço.
COPY llm-service/src ./llm-service/src

# Compila o serviço.
RUN npm run build --workspace llm-service

# Arranca o serviço quando o container sobe.
CMD ["npm", "run", "start", "--workspace", "llm-service"]
