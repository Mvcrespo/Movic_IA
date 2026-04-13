# Imagem base com Node.js leve para correr o serviço.
FROM node:22-alpine

# Pasta de trabalho dentro do container.
WORKDIR /app

# Copia a configuração do monorepo.
COPY package.json package-lock.json ./
# Copia a configuração deste serviço.
COPY apple-connector/package.json ./apple-connector/package.json
COPY apple-connector/tsconfig.json ./apple-connector/tsconfig.json

# Instala as dependências.
RUN npm ci

# Copia o código fonte do connector.
COPY apple-connector/src ./apple-connector/src

# Compila o serviço.
RUN npm run build --workspace apple-connector

# Arranca o serviço quando o container sobe.
CMD ["npm", "run", "start", "--workspace", "apple-connector"]
