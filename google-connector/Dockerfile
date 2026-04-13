# Imagem base com Node.js leve para correr o serviço.
FROM node:22-alpine

# Pasta de trabalho dentro do container.
WORKDIR /app

# Copia a configuração do monorepo.
COPY package.json package-lock.json ./
# Copia a configuração deste serviço.
COPY google-connector/package.json ./google-connector/package.json
COPY google-connector/tsconfig.json ./google-connector/tsconfig.json

# Instala as dependências.
RUN npm ci

# Copia o código fonte do connector.
COPY google-connector/src ./google-connector/src

# Compila o serviço.
RUN npm run build --workspace google-connector

# Arranca o serviço quando o container sobe.
CMD ["npm", "run", "start", "--workspace", "google-connector"]
