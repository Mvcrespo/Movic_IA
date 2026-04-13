# Movic IA

Movic IA é uma plataforma para orquestrar conversas no Discord, gerir eventos numa base local e sincronizar integrações externas a partir de uma dashboard web moderna. A stack atual junta um bot Discord, um orchestrator com serviços de IA, um calendar hub local e conectores para Apple Calendar, Google Calendar e Notion.

## O que o projeto faz hoje

- Recebe mensagens diretas no Discord em tempo real.
- Interpreta pedidos com uma pipeline separada de normalização, intenção, extração e validação.
- Guarda eventos e histórico numa base PostgreSQL local.
- Expõe uma dashboard pública e privada em `Vue + Vite + Tailwind`.
- Permite ligar Discord, Apple, Google e Notion por utilizador.
- Cria uma conta admin inicial automaticamente quando a base de configuração está vazia.
- Permite criar, desativar, reativar e apagar utilizadores a partir da dashboard.

## Arquitetura atual

```text
Discord DM
  -> gateway (discord.js)
  -> orchestrator
      -> normalizer-service
      -> llm-service
      -> extractor-service
      -> validator-service
  -> calendar-service
      -> postgres
      -> apple-connector
      -> google-connector
      -> notion-connector

Dashboard (Vue + Node)
  -> config-postgres
  -> calendar-service
  -> orchestrator
  -> connectors
```

## Serviços incluídos

- `gateway`: bot Discord e comandos `!code`, `!show`, `!cancel`, `!delete`.
- `dashboard-service`: home pública, login, gestão de utilizadores e integrações.
- `orchestrator`: cérebro conversacional e coordenação do fluxo.
- `calendar-service`: fonte local de verdade para eventos e sincronização.
- `apple-connector`: ligação CalDAV ao ecossistema Apple.
- `google-connector`: ligação OAuth ao Google Calendar.
- `notion-connector`: ligação OAuth ao Notion e base operacional.
- `postgres`: dados operacionais.
- `config-postgres`: configurações, utilizadores, sessões e credenciais cifradas.
- `ollama`: runtime local dos modelos.
- `llm-service`, `normalizer-service`, `extractor-service`, `validator-service`: pipeline de IA.

## Requisitos

- Docker Desktop com `docker compose`
- Node.js 22+ e npm
- Acesso ao Discord Developer Portal
- Credenciais Google e Notion se quiseres ativar essas integrações
- Uma Apple ID com app-specific password se quiseres ativar Apple Calendar

## Arranque rápido

1. Copia o ficheiro de exemplo:

```powershell
Copy-Item .env.example .env
```

2. Preenche pelo menos estas variáveis no `.env`:

- `DISCORD_TOKEN`
- `DASHBOARD_INTERNAL_API_TOKEN`
- `CONFIG_ENCRYPTION_KEY`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

3. Sobe a stack:

```powershell
docker compose up -d --build
```

4. Abre a dashboard:

```text
http://localhost:8088
```

5. Entra com `DEFAULT_ADMIN_EMAIL` e `DEFAULT_ADMIN_PASSWORD`.

Na primeira entrada, a password inicial é forçada a mudar para uma nova password escolhida por ti.

## Variáveis do `.env`

O `.env.example` já vem alinhado com a stack atual e dividido por grupos:

- Core services
- Dashboard and auth
- Config database and encryption
- Apple connector
- Google connector
- Notion connector
- Ollama / local AI models

### Variáveis obrigatórias para o arranque base

- `DISCORD_TOKEN`: token do bot Discord.
- `DASHBOARD_INTERNAL_API_TOKEN`: segredo interno partilhado entre serviços.
- `CONFIG_ENCRYPTION_KEY`: chave usada para cifrar credenciais de integrações no `config-postgres`.
- `DEFAULT_ADMIN_EMAIL`: email da conta admin inicial.
- `DEFAULT_ADMIN_PASSWORD`: password temporária da conta admin inicial.

### Variáveis obrigatórias só se quiseres usar certas integrações

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: ligação Google Calendar
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`: ligação Notion

### Variáveis úteis mas opcionais

- `PUBLIC_CONTACT_EMAIL`: email mostrado na home pública para pedidos de acesso.
- `APPLE_CALDAV_URL`: por defeito já aponta para `https://caldav.icloud.com`.
- `ORCHESTRATOR_HISTORY_LIMIT`: profundidade do histórico lido pelo orchestrator.
- `DASHBOARD_CONFIG_CACHE_MS`: cache curta do gateway para a configuração da dashboard.

## Como gerar os segredos internos

Para `DASHBOARD_INTERNAL_API_TOKEN` e `CONFIG_ENCRYPTION_KEY`, usa valores longos e aleatórios. Em PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
```

Gera dois valores diferentes e coloca um em cada variável.

## Como obter as credenciais

### Discord

1. Vai a `https://discord.com/developers/applications`.
2. Cria uma nova aplicação.
3. Entra em `Bot` e adiciona o bot à aplicação.
4. Em `Bot`, faz `Reset Token` ou `Copy Token` e coloca o valor em `DISCORD_TOKEN`.
5. Ativa pelo menos `Message Content Intent`.
6. Adiciona o bot a um servidor teu, ou usa o link de instalação apresentado depois na dashboard.

Sem `DISCORD_TOKEN`, o gateway não arranca.

### Google Calendar

1. Vai à Google Cloud Console.
2. Cria ou escolhe um projeto.
3. Ativa a `Google Calendar API`.
4. Configura o `OAuth consent screen`.
5. Cria credenciais do tipo `OAuth Client ID` para `Web application`.
6. Em `Authorized redirect URIs`, adiciona exatamente o valor de `GOOGLE_REDIRECT_URI`.
7. Copia o `Client ID` para `GOOGLE_CLIENT_ID`.
8. Copia o `Client Secret` para `GOOGLE_CLIENT_SECRET`.

Se estiveres a correr localmente com a configuração base deste projeto, o redirect é:

```text
http://localhost:8088/dashboard/google/callback
```

### Notion

1. Vai a `https://developers.notion.com/`.
2. Cria uma integração com suporte a OAuth para utilizador.
3. Define o redirect URI para o mesmo valor usado em `NOTION_REDIRECT_URI`.
4. Copia o `Client ID` para `NOTION_CLIENT_ID`.
5. Copia o `Client Secret` para `NOTION_CLIENT_SECRET`.

O redirect local esperado por defeito é:

```text
http://localhost:8088/dashboard/notion/callback
```

### Apple Calendar

Apple não usa `client_id` e `client_secret` globais no `.env` desta stack.

O fluxo atual é este:

1. O utilizador entra na dashboard.
2. Abre o separador Apple.
3. Introduz o email Apple.
4. Gera uma `app-specific password` na Apple ID em `Sign-In and Security > App-Specific Passwords`.
5. Cola essa password na dashboard para testar e guardar a ligação.

O endereço CalDAV por defeito já vem preenchido:

```text
https://caldav.icloud.com
```

## Contacto público e onboarding

- A home pública usa `PUBLIC_CONTACT_EMAIL` para orientar pedidos de acesso.
- A conta admin inicial nasce a partir de `DEFAULT_ADMIN_EMAIL` e `DEFAULT_ADMIN_PASSWORD`.
- Depois de criares mais utilizadores na dashboard, cada conta pode gerir as próprias integrações separadamente.

## Comandos úteis

Arrancar tudo:

```powershell
docker compose up -d --build
```

Ver logs:

```powershell
docker compose logs -f
```

Parar tudo:

```powershell
docker compose down
```

Build local dos workspaces:

```powershell
npm run build
```

## Notas importantes

- O `.env` real não deve ser versionado.
- O `.env.example` foi preparado para servir de ponto de partida funcional da stack atual.
- Os conectores Google e Notion arrancam sem OAuth real, mas só conseguem ligar contas quando preencheres as credenciais certas.
- A ligação Apple depende do email Apple e da app-specific password introduzidos depois na dashboard.
- A remoção de utilizadores na dashboard também limpa dados associados, incluindo sessões, ligações e sincronizações registadas.
