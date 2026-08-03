# Security Policy

## Supported version

Security fixes are developed against the `main` branch and the latest published release.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to:

`miguelcrespovenancio@hotmail.com`

Do not open a public issue for a vulnerability, exposed credential, authentication bypass, data leak, or remote code execution report.

Include:

- A clear description of the issue and its impact.
- Affected service, endpoint, or configuration.
- Reproduction steps or a minimal proof of concept.
- Any relevant logs or screenshots with secrets and personal data removed.

You should receive an acknowledgement as soon as practical. Please allow time for validation and remediation before publicly disclosing the issue.

## Secret handling

- Keep the real `.env` file out of Git.
- Use empty values or safe placeholders in `.env.example`.
- Rotate any token that may have been exposed.
- Do not paste production credentials into issues, pull requests, logs, screenshots, or chat transcripts.
- Keep dashboard, database, Ollama, connector, and tunnel services behind the Docker network unless a port is explicitly required for local debugging.

## Deployment baseline

For production deployments:

- Expose only the dashboard through the Cloudflare Tunnel.
- Keep PostgreSQL and internal services unexposed.
- Use strong, unique values for admin, database, internal API, and encryption secrets.
- Keep the host, Docker images, NVIDIA runtime, and dependencies updated.
- Review Cloudflare, OAuth, Discord, Telegram, Google, Notion, and Apple permissions regularly.
