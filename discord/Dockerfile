# Imagem base com Node.js leve para correr o serviço.
FROM node:22-alpine

# Pasta de trabalho dentro do container.
WORKDIR /app

# Copia a configuração do monorepo.
COPY package.json package-lock.json ./
# Copia a configuração deste serviço.
COPY discord/package.json ./discord/package.json
COPY discord/tsconfig.json ./discord/tsconfig.json

# Instala as dependências.
RUN npm ci

# Copia o código fonte do gateway.
COPY discord/src ./discord/src

# Compila o serviço.
RUN npm run build --workspace discord-gateway

# Arranca o serviço quando o container sobe.
CMD ["npm", "run", "start", "--workspace", "discord-gateway"]
