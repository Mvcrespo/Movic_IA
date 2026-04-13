# AI Personal Calendar Agent

Arquitetura atual:

```text
Discord DM
   -> discord-gateway (discord.js)
   -> orchestrator
   -> calendar-service
   -> PostgreSQL
```

## O que o projeto faz agora

- recebe mensagens diretas no Discord em tempo real com `discord.js`
- reage enquanto processa a mensagem
- envia a mensagem ao `orchestrator`
- cria, lista, altera e apaga eventos através do `calendar-service`
- guarda os eventos no `PostgreSQL`
- mantém uma dashboard separada para a próxima fase de configuração e ligação por código

## O que já não existe nesta fase

- `mcp-discord`
- polling de um canal fixo
- filtro por `DISCORD_ALLOWED_USER_ID`
- configuração manual do `DISCORD_DM_CHANNEL_ID`
- Docker socket montado no `gateway`

## Preparação no Discord

1. Cria uma aplicação no Discord Developer Portal.
2. Adiciona um bot à aplicação.
3. Copia o `DISCORD_TOKEN`.
4. Ativa `Message Content Intent` para o bot.
5. Adiciona o bot ao teu Discord.
6. Abre uma DM com o bot.

## Configuração principal

Na prática, a única variável específica do Discord que o `gateway` precisa agora é:

- `DISCORD_TOKEN`

Também continuas a precisar das URLs internas normais da stack, por exemplo:

- `ORCHESTRATOR_URL`
- `POSTGRES_URL`
- `OLLAMA_BASE_URL`

## Arranque

```bash
docker compose up --build
```

Ou:

```bash
npm run docker:up
```

A dashboard fica em:

```text
http://localhost:8088
```

## Comandos disponíveis na DM

- `!delete` - apaga mensagens recentes do bot nesta conversa
- `!delete N` - apaga as últimas `N` mensagens do bot
- `!cancel` - cancela o pedido pendente atual
- `!show` - mostra o estado do pedido pendente atual

## Notas importantes

- O bot responde automaticamente a qualquer DM recebida.
- Nesta fase, a dashboard já não define manualmente o chat que o `gateway` observa.
- A próxima evolução natural é a ligação por código temporário para associar utilizador e chat de forma explícita.
