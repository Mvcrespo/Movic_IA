# Roadmap

This roadmap describes the current direction of Movic IA. Items may change as the project is tested in real use.

## v0.1.0 - Public baseline

- Discord DM connection flow.
- Telegram private-chat connection flow.
- Calendar event creation, listing, update, and deletion.
- Apple Calendar, Google Calendar, and Notion connectors.
- Dashboard authentication and user management.
- Local Ollama support for the normalizer and validator.
- Ollama Cloud support for the larger language-model services.
- Docker Compose deployment with optional NVIDIA GPU and Cloudflare Tunnel support.

## Next

- Morning and evening calendar summaries sent only to the selected primary channel.
- Configurable sleep and wake time ranges with editable reminder preferences.
- Clearer connection state and notification preferences across Discord and Telegram.
- Better observability for background sync jobs and model requests.
- More regression coverage for calendar parsing, integrations, and scheduled reminders.

## Later

- Safer deployment upgrades and backup documentation.
- Per-user integration health and sync history.
- More provider-independent model configuration.
- Accessibility and mobile usability pass for the dashboard.
- Community contribution guides and good-first-issue maintenance.
