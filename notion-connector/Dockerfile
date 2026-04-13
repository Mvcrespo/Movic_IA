# Imagem base com Node.js leve para correr o serviço.
FROM node:22-alpine

# Pasta de trabalho dentro do container.
WORKDIR /app

# Copia a configuração do monorepo.
COPY package.json package-lock.json ./
# Copia a configuração deste serviço.
COPY notion-connector/package.json ./notion-connector/package.json
COPY notion-connector/tsconfig.json ./notion-connector/tsconfig.json

# Instala as dependências.
RUN npm ci

# Copia o código fonte do connector.
COPY notion-connector/src ./notion-connector/src

# Compila o serviço.
RUN npm run build --workspace notion-connector

# Arranca o serviço quando o container sobe.
CMD ["npm", "run", "start", "--workspace", "notion-connector"]
