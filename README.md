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

1. Obtém o token do Discord.

Vai a `https://discord.com/developers/applications`, cria uma aplicação, adiciona um bot e, no separador `Bot`, faz `Reset Token` ou `Copy Token`. Ativa também `Message Content Intent`. Guarda esse token para colocares no `.env`.

2. Duplica o ficheiro de exemplo:

```powershell
Copy-Item .env.example .env
```

3. Preenche pelo menos estas variáveis no `.env`:

- `DISCORD_TOKEN`: cola aqui o token do bot Discord.
- `DASHBOARD_INTERNAL_API_TOKEN`: segredo interno partilhado entre serviços.
- `CONFIG_ENCRYPTION_KEY`: chave usada para cifrar credenciais de integrações.
- `DEFAULT_ADMIN_EMAIL`: email da conta admin inicial.
- `DEFAULT_ADMIN_PASSWORD`: password temporária da conta admin inicial.
- `POSTGRES_URL` e `CONFIG_POSTGRES_URL`: URLs completas das duas bases de dados, sem valores predefinidos no código.

Para `DASHBOARD_INTERNAL_API_TOKEN` e `CONFIG_ENCRYPTION_KEY`, usa dois valores longos e diferentes. Em PowerShell, podes gerar cada valor com:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
```

4. Sobe a stack:

```powershell
docker compose up -d --build
```

No primeiro arranque, o `ollama` pode demorar alguns minutos a descarregar o modelo configurado, por defeito `qwen2.5:3b`. É normal veres logs como `Modelo qwen2.5:3b nao encontrado. A fazer pull...` e várias tentativas `retrying` enquanto o download estabiliza. Se ficar preso durante muito tempo em `connection refused`, confirma a ligação à internet, VPN, proxy ou firewall.

Se quiseres que o Cloudflare Tunnel arranque automaticamente com o `docker compose`, adiciona também `CLOUDFLARE_TUNNEL_TOKEN` ao teu `.env`. A stack já inclui um serviço `cloudflared` para isso.

5. Abre a dashboard:

```text
http://localhost:8088
```

6. Entra com `DEFAULT_ADMIN_EMAIL` e `DEFAULT_ADMIN_PASSWORD`.

Na primeira entrada, a password inicial é forçada a mudar para uma nova password escolhida por ti.

7. Liga o Discord à dashboard.

Depois de entrares na dashboard, gera o código de ligação e envia ao bot por DM:

```text
!code CODIGO
```

## Modelos Ollama `:cloud`

Se preferires usar modelos Ollama com sufixo `:cloud`, como por exemplo `gpt-oss:120b-cloud` ou `qwen3.5:cloud`, a stack atual já os suporta através do `OLLAMA_BASE_URL` e dos modelos definidos no `.env`.

Mas há uma condição importante: depois de subires os containers, tens de fazer login no Ollama Cloud dentro do container `ollama`.

```powershell
docker compose exec ollama ollama signin
```

Este `signin` deve ser feito no container Docker com Ollama, não no utilizador normal da tua máquina, porque os serviços (`llm-service`, `normalizer-service`, `extractor-service` e `validator-service`) falam com o Ollama que está a correr dentro do Docker.

Se não fizeres esse passo, o `docker compose` pode até conseguir fazer `pull` do modelo, mas depois os pedidos reais para `/api/chat` podem falhar com `401 Unauthorized`.

## Modo hibrido Ollama local + Ollama Cloud

A stack suporta escolher o destino do Ollama por servico. A configuracao recomendada para producao na VM e:

```env
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_API_KEY=

LLM_OLLAMA_BASE_URL=https://ollama.com
LLM_OLLAMA_MODEL=gpt-oss:120b-cloud
LLM_OLLAMA_API_KEY=...
LLM_OLLAMA_AUTO_PULL=false

EXTRACTOR_OLLAMA_BASE_URL=https://ollama.com
EXTRACTOR_OLLAMA_MODEL=gpt-oss:120b-cloud
EXTRACTOR_OLLAMA_API_KEY=...
EXTRACTOR_OLLAMA_AUTO_PULL=false

NORMALIZER_OLLAMA_BASE_URL=http://ollama:11434
NORMALIZER_OLLAMA_MODEL=qwen2.5:3b
NORMALIZER_OLLAMA_API_KEY=
NORMALIZER_AUTO_PULL=true

VALIDATOR_OLLAMA_BASE_URL=http://ollama:11434
VALIDATOR_OLLAMA_MODEL=qwen2.5:3b
VALIDATOR_OLLAMA_API_KEY=
VALIDATOR_AUTO_PULL=true
```

Neste modo, `llm-service` e `extractor-service` usam Ollama Cloud com `Authorization: Bearer ...`, enquanto `normalizer-service` e `validator-service` ficam no Ollama local da VM. Quando um servico usa Ollama Cloud com API key, a stack nao tenta fazer `pull` do modelo nesse servico.

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

### Variáveis das integrações opcionais

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: só são necessárias para ativar Google Calendar.
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`: só são necessárias para ativar Notion.
- `NOTION_WEBHOOK_VERIFICATION_TOKEN`: token recebido na verificação do webhook Notion; necessário para aceitar eventos.
- `CLOUDFLARE_TUNNEL_TOKEN`: só é necessária se quiseres arrancar o `cloudflared` no `docker compose`.

### Variáveis úteis mas opcionais

- `PUBLIC_CONTACT_EMAIL`: email mostrado na home pública para pedidos de acesso.
- `APPLE_CALDAV_URL`: por defeito já aponta para `https://caldav.icloud.com`.
- `ORCHESTRATOR_HISTORY_LIMIT`: profundidade do histórico lido pelo orchestrator.
- `DASHBOARD_CONFIG_CACHE_MS`: cache curta do gateway para a configuração da dashboard.

## Integrações opcionais

Google, Notion e Apple não são necessários para o arranque base. Podes deixar estas credenciais para o fim e configurar só quando quiseres ativar cada integração na dashboard.

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

Ver apenas o túnel Cloudflare:

```powershell
docker compose logs -f cloudflared
```

Abrir portas internas apenas para desenvolvimento local. O override fica limitado a `127.0.0.1` e não deve ser usado para expor a VM na rede:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev-ports.yml up -d --build
```

Ativar GPU para o Ollama local, quando o driver NVIDIA e o NVIDIA Container Toolkit estiverem prontos:

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Parar tudo:

```powershell
docker compose down
```

Build local dos workspaces:

```powershell
npm run build
```

## Troubleshooting

### Cloudflare Tunnel no Docker

Se antes arrancavas o túnel manualmente com:

```powershell
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run movic-tunnel
```

isso usava a configuração local do `cloudflared` no Windows. Dentro do Docker, a forma mais simples de automatizar é correr o túnel com token:

1. Vai ao painel Cloudflare Zero Trust e copia o token do teu tunnel `movic-tunnel`.
2. Adiciona `CLOUDFLARE_TUNNEL_TOKEN=...` ao `.env`.
3. Arranca a stack com `docker compose up -d --build`.
4. Confirma com `docker compose logs -f cloudflared`.

Se quiseres mesmo correr o túnel por nome, como `tunnel run movic-tunnel`, o container precisa de montar os ficheiros de configuração e credenciais do `cloudflared`, como `config.yml`, `cert.pem` e o ficheiro JSON do tunnel. Neste repositório ficou preparada a versão por token porque é a forma mais simples de manter tudo automático dentro do `docker compose`.

### Ollama fica preso a descarregar o modelo

Se `docker compose exec ollama ollama list` mostrar apenas o cabeçalho, ainda não há nenhum modelo instalado:

```text
NAME    ID    SIZE    MODIFIED
```

Se o pull ficar muito tempo em `pulling manifest` ou os logs mostrarem erros como `connect: connection refused` para `cloudflarestorage.com`, isola o download do modelo. Para isso, para temporariamente os serviços que usam IA, reinicia o `ollama` e faz o pull manual uma vez:

```powershell
docker compose stop normalizer-service llm-service extractor-service validator-service orchestrator gateway
docker compose restart ollama
docker compose exec ollama ollama pull qwen2.5:3b
```

Quando terminar com `success`, confirma que o modelo ficou instalado:

```powershell
docker compose exec ollama ollama list
```

Deves ver uma linha parecida com:

```text
NAME          ID              SIZE      MODIFIED
qwen2.5:3b    ...             1.9 GB    ...
```

Depois volta a levantar a pipeline:

```powershell
docker compose start normalizer-service llm-service extractor-service validator-service orchestrator gateway
```

Se o download continuar a falhar, confirma ligação à internet, VPN, proxy, firewall ou tenta outra rede. Depois de instalado, o modelo fica guardado no volume `ollama-data` e não precisa de ser descarregado em cada arranque.

### Logs antigos depois de resolver

Depois de reiniciar serviços, `docker compose logs` pode continuar a mostrar erros antigos no histórico. Para veres só o estado recente:

```powershell
docker compose logs --since=1m normalizer-service llm-service extractor-service validator-service orchestrator gateway
```

## Notas importantes

- O `.env` real não deve ser versionado.
- O `.env.example` contém campos sensíveis vazios de propósito; preenche-os no `.env` local e nunca versões esse ficheiro.
- Por defeito, o `docker-compose.yml` não publica portas da aplicação no host. A dashboard fica acessível pelo Cloudflare Tunnel, e Postgres, Ollama, orchestrator e serviços internos ficam protegidos dentro da rede Docker. Usa `docker-compose.dev-ports.yml` apenas para depurar localmente em `127.0.0.1`.
- A GPU do Ollama local fica num override separado (`docker-compose.gpu.yml`) para a stack continuar a arrancar mesmo quando a VM ainda não tem driver/runtime NVIDIA pronto.
- Com `OLLAMA_AUTO_PULL=true`, `NORMALIZER_AUTO_PULL=true`, `EXTRACTOR_AUTO_PULL=true` e `VALIDATOR_AUTO_PULL=true`, os serviços tentam descarregar automaticamente o modelo local no primeiro arranque. Depois de o modelo existir no volume do `ollama`, os arranques seguintes tendem a ser bem mais rápidos.
- Os conectores Google e Notion arrancam sem OAuth real, mas só conseguem ligar contas quando preencheres as credenciais certas.
- A ligação Apple depende do email Apple e da app-specific password introduzidos depois na dashboard.
- Mensagens de sync em background como `Google Calendar não está ligado` ou `A sincronização Apple está desligada` são esperadas enquanto essas integrações ainda não estiverem configuradas na dashboard.
- A remoção de utilizadores na dashboard também limpa dados associados, incluindo sessões, ligações e sincronizações registadas.
