# Imagem base com Node.js leve para correr o serviço.
FROM node:22-alpine

# Pasta de trabalho dentro do container.
WORKDIR /app

# Copia a configuração do monorepo.
COPY package.json package-lock.json ./
# Copia a configuração deste serviço.
COPY orchestrator/package.json ./orchestrator/package.json
COPY orchestrator/tsconfig.json ./orchestrator/tsconfig.json

# Instala as dependências.
RUN npm ci

# Copia o código fonte do orchestrator.
COPY orchestrator/src ./orchestrator/src

# Compila o serviço.
RUN npm run build --workspace orchestrator

# Arranca o serviço quando o container sobe.
CMD ["npm", "run", "start", "--workspace", "orchestrator"]
