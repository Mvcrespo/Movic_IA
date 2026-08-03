# Movic IA

Movic IA is a platform for orchestrating Discord conversations, managing events in a local database, and synchronizing external integrations through a modern web dashboard. The current stack combines a Discord bot, an AI orchestrator, a local calendar hub, and connectors for Apple Calendar, Google Calendar, and Notion.

## What the project does today

- Receives direct Discord messages in real time.
- Interprets requests through separate normalization, intent, extraction, and validation pipelines.
- Stores events and history in a local PostgreSQL database.
- Provides a public and private dashboard built with `Vue + Vite + Tailwind`.
- Lets each user connect Discord, Apple, Google, and Notion.
- Automatically creates an initial admin account when the configuration database is empty.
- Lets administrators create, disable, reactivate, and delete users from the dashboard.

## Current architecture

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

## Included services

- `gateway`: Discord bot and the `!code`, `!show`, `!cancel`, and `!delete` commands.
- `dashboard-service`: public home page, login, user management, and integrations.
- `orchestrator`: conversational engine and flow coordination.
- `calendar-service`: local source of truth for events and synchronization.
- `apple-connector`: CalDAV connection to the Apple ecosystem.
- `google-connector`: OAuth connection to Google Calendar.
- `notion-connector`: OAuth connection to Notion and operational database.
- `postgres`: operational data.
- `config-postgres`: configuration, users, sessions, and encrypted credentials.
- `ollama`: local model runtime.
- `llm-service`, `normalizer-service`, `extractor-service`, `validator-service`: AI pipeline.

## Requirements

- Docker Desktop with `docker compose`
- Node.js 22+ and npm
- Access to the Discord Developer Portal
- Google and Notion credentials if you want to enable those integrations
- An Apple ID with an app-specific password if you want to enable Apple Calendar

## Quick start

1. Get the Discord token.

Go to `https://discord.com/developers/applications`, create an application, add a bot, and use `Reset Token` or `Copy Token` in the `Bot` tab. Also enable `Message Content Intent`. Store the token so you can place it in `.env`.

2. Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

3. Fill in at least these variables in `.env`:

- `DISCORD_TOKEN`: Discord bot token.
- `DASHBOARD_INTERNAL_API_TOKEN`: internal secret shared between services.
- `CONFIG_ENCRYPTION_KEY`: key used to encrypt integration credentials.
- `DEFAULT_ADMIN_EMAIL`: initial admin account email.
- `DEFAULT_ADMIN_PASSWORD`: temporary initial admin password.
- `POSTGRES_URL` and `CONFIG_POSTGRES_URL`: complete database URLs, with no defaults in the code.

For `DASHBOARD_INTERNAL_API_TOKEN` and `CONFIG_ENCRYPTION_KEY`, use two long and different values. In PowerShell, you can generate each value with:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
```

4. Start the stack:

```powershell
docker compose up -d --build
```

On the first start, `ollama` may take a few minutes to download the configured model, which defaults to `qwen2.5:3b`. It is normal to see logs such as `Model qwen2.5:3b not found. Pulling...` and several `retrying` attempts while the download stabilizes. If it remains stuck on `connection refused` for a long time, check your internet connection, VPN, proxy, or firewall.

If you want the Cloudflare Tunnel to start automatically with `docker compose`, also add `CLOUDFLARE_TUNNEL_TOKEN` to `.env`. The stack already includes a `cloudflared` service for this.

5. Open the dashboard:

```text
http://localhost:8088
```

6. Sign in with `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`.

On the first login, the initial password must be changed to a new password of your choice.

7. Connect Discord to the dashboard.

After signing in to the dashboard, generate the connection code and send it to the bot by DM:

```text
!code CODE
```

## Ollama `:cloud` models

If you prefer to use Ollama models with the `:cloud` suffix, such as `gpt-oss:120b-cloud` or `qwen3.5:cloud`, the current stack already supports them through `OLLAMA_BASE_URL` and the models defined in `.env`.

There is one important requirement: after starting the containers, you must sign in to Ollama Cloud inside the `ollama` container.

```powershell
docker compose exec ollama ollama signin
```

This `signin` must be performed in the Docker container running Ollama, not as the normal user on your machine, because the services (`llm-service`, `normalizer-service`, `extractor-service`, and `validator-service`) communicate with the Ollama instance running inside Docker.

If you skip this step, `docker compose` may be able to pull the model, but real requests to `/api/chat` can then fail with `401 Unauthorized`.

## Hybrid local Ollama + Ollama Cloud mode

The stack supports choosing the Ollama destination per service. The recommended production configuration for the VM is:

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

In this mode, `llm-service` and `extractor-service` use Ollama Cloud with `Authorization: Bearer ...`, while `normalizer-service` and `validator-service` use the VM's local Ollama instance. When a service uses Ollama Cloud with an API key, the stack does not try to pull the model for that service.

## `.env` variables

The `.env.example` file is aligned with the current stack and grouped by area:

- Core services
- Dashboard and authentication
- Configuration database and encryption
- Apple connector
- Google connector
- Notion connector
- Ollama / local AI models

### Required variables for the base startup

- `DISCORD_TOKEN`: Discord bot token.
- `DASHBOARD_INTERNAL_API_TOKEN`: internal secret shared between services.
- `CONFIG_ENCRYPTION_KEY`: key used to encrypt integration credentials in `config-postgres`.
- `DEFAULT_ADMIN_EMAIL`: initial admin account email.
- `DEFAULT_ADMIN_PASSWORD`: temporary initial admin password.

### Optional integration variables

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: only required to enable Google Calendar.
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`: only required to enable Notion.
- `NOTION_WEBHOOK_VERIFICATION_TOKEN`: token received during Notion webhook verification; required to accept events.
- `CLOUDFLARE_TUNNEL_TOKEN`: only required if you want to start `cloudflared` through `docker compose`.

### Useful but optional variables

- `PUBLIC_CONTACT_EMAIL`: email shown on the public home page for access requests.
- `APPLE_CALDAV_URL`: defaults to `https://caldav.icloud.com`.
- `ORCHESTRATOR_HISTORY_LIMIT`: amount of history read by the orchestrator.
- `DASHBOARD_CONFIG_CACHE_MS`: short gateway cache for dashboard configuration.

## Optional integrations

Google, Notion, and Apple are not required for the base startup. You can leave these credentials until later and configure each integration when you want to enable it in the dashboard.

### Google Calendar

1. Go to Google Cloud Console.
2. Create or select a project.
3. Enable the `Google Calendar API`.
4. Configure the `OAuth consent screen`.
5. Create `OAuth Client ID` credentials for a `Web application`.
6. Under `Authorized redirect URIs`, add exactly the value of `GOOGLE_REDIRECT_URI`.
7. Copy the `Client ID` to `GOOGLE_CLIENT_ID`.
8. Copy the `Client Secret` to `GOOGLE_CLIENT_SECRET`.

When running locally with this project's base configuration, the redirect is:

```text
http://localhost:8088/dashboard/google/callback
```

### Notion

1. Go to `https://developers.notion.com/`.
2. Create an integration with user OAuth support.
3. Set the redirect URI to the same value used in `NOTION_REDIRECT_URI`.
4. Copy the `Client ID` to `NOTION_CLIENT_ID`.
5. Copy the `Client Secret` to `NOTION_CLIENT_SECRET`.

The default local redirect is:

```text
http://localhost:8088/dashboard/notion/callback
```

### Apple Calendar

Apple does not use global `client_id` and `client_secret` values in this stack's `.env`.

The current flow is:

1. The user signs in to the dashboard.
2. Opens the Apple tab.
3. Enters their Apple email.
4. Generates an `app-specific password` in Apple ID under `Sign-In and Security > App-Specific Passwords`.
5. Enters that password in the dashboard to test and save the connection.

The default CalDAV address is already filled in:

```text
https://caldav.icloud.com
```

## Public contact and onboarding

- The public home page uses `PUBLIC_CONTACT_EMAIL` to guide access requests.
- The initial admin account is created from `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`.
- After creating more users in the dashboard, each account can manage its own integrations separately.

## Useful commands

Start everything:

```powershell
docker compose up -d --build
```

View logs:

```powershell
docker compose logs -f
```

View only the Cloudflare Tunnel:

```powershell
docker compose logs -f cloudflared
```

Expose internal ports only for local development. This override is limited to `127.0.0.1` and must not be used to expose the VM on the network:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev-ports.yml up -d --build
```

Enable the GPU for local Ollama when the NVIDIA driver and NVIDIA Container Toolkit are ready:

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Stop everything:

```powershell
docker compose down
```

Build the local workspaces:

```powershell
npm run build
```

## Troubleshooting

### Cloudflare Tunnel in Docker

If you previously started the tunnel manually with:

```powershell
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run movic-tunnel
```

that used the local `cloudflared` configuration on Windows. Inside Docker, the simplest way to automate it is to run the tunnel with a token:

1. Go to the Cloudflare Zero Trust dashboard and copy the token for your `movic-tunnel`.
2. Add `CLOUDFLARE_TUNNEL_TOKEN=...` to `.env`.
3. Start the stack with `docker compose up -d --build`.
4. Check the logs with `docker compose logs -f cloudflared`.

If you really want to run the tunnel by name, such as `tunnel run movic-tunnel`, the container must mount the `cloudflared` configuration and credential files, such as `config.yml`, `cert.pem`, and the tunnel JSON file. This repository uses the token-based version because it is the simplest way to keep everything automated inside `docker compose`.

### Ollama is stuck downloading the model

If `docker compose exec ollama ollama list` shows only the header, no model has been installed yet:

```text
NAME    ID    SIZE    MODIFIED
```

If the pull stays on `pulling manifest` for a long time or the logs show errors such as `connect: connection refused` for `cloudflarestorage.com`, isolate the model download. Stop the services that use AI, restart `ollama`, and pull the model manually once:

```powershell
docker compose stop normalizer-service llm-service extractor-service validator-service orchestrator gateway
docker compose restart ollama
docker compose exec ollama ollama pull qwen2.5:3b
```

When it finishes with `success`, confirm that the model is installed:

```powershell
docker compose exec ollama ollama list
```

You should see a line similar to:

```text
NAME          ID              SIZE      MODIFIED
qwen2.5:3b    ...             1.9 GB    ...
```

Then start the pipeline again:

```powershell
docker compose start normalizer-service llm-service extractor-service validator-service orchestrator gateway
```

If the download keeps failing, check your internet connection, VPN, proxy, firewall, or try another network. Once installed, the model is stored in the `ollama-data` volume and does not need to be downloaded on every start.

### Old logs after resolving an issue

After restarting services, `docker compose logs` may continue to show old errors from the history. To see only recent output:

```powershell
docker compose logs --since=1m normalizer-service llm-service extractor-service validator-service orchestrator gateway
```

## Important notes

- The real `.env` file must not be committed.
- `.env.example` intentionally contains empty sensitive fields; fill them in the local `.env` file and never commit that file.
- By default, `docker-compose.yml` does not publish application ports on the host. The dashboard is accessible through the Cloudflare Tunnel, while PostgreSQL, Ollama, the orchestrator, and internal services stay protected inside the Docker network. Use `docker-compose.dev-ports.yml` only for local debugging on `127.0.0.1`.
- The local Ollama GPU is kept in a separate override (`docker-compose.gpu.yml`) so the stack can still start when the VM does not yet have the NVIDIA driver/runtime ready.
- With `OLLAMA_AUTO_PULL=true`, `NORMALIZER_AUTO_PULL=true`, `EXTRACTOR_AUTO_PULL=true`, and `VALIDATOR_AUTO_PULL=true`, the services automatically try to download the local model on the first start. Once the model exists in the `ollama` volume, subsequent starts are usually much faster.
- Google and Notion connectors start without real OAuth credentials, but they can only connect accounts after the correct credentials are provided.
- Apple connection depends on the Apple email and app-specific password entered later in the dashboard.
- Background sync messages such as `Google Calendar is not connected` or `Apple synchronization is disabled` are expected while those integrations have not yet been configured in the dashboard.
- Deleting users in the dashboard also removes associated data, including sessions, connections, and registered synchronizations.
