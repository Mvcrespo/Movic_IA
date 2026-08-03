# Contributing to Movic IA

Thank you for helping improve Movic IA. Contributions are welcome through bug reports, feature proposals, documentation improvements, tests, and pull requests.

## Before you start

- Read the [README](README.md) and [security policy](SECURITY.md).
- Never commit `.env`, credentials, access tokens, OAuth secrets, database passwords, or production data.
- For security vulnerabilities, follow `SECURITY.md` instead of opening a public issue.

## Local setup

1. Install Docker Desktop with Docker Compose and Node.js 22 or newer.
2. Copy `.env.example` to `.env`.
3. Fill in the required local values without adding secrets to tracked files.
4. Start the stack:

   ```powershell
   docker compose up -d --build
   ```

For changes to a single service, use the workspace scripts in the root `package.json`. The full build can be checked with:

```powershell
npm run build
```

## Development workflow

1. Create a focused branch from `main`.
2. Keep each change scoped to one problem.
3. Update tests and documentation when behavior or configuration changes.
4. Run the relevant tests and `npm run build` before opening a pull request.
5. Use a clear pull request description that explains the problem, the solution, and how it was verified.

## Pull requests

A pull request should:

- Explain the user-facing or operational impact.
- Include tests for new or changed behavior where practical.
- Document new environment variables and migration steps.
- Avoid unrelated formatting or refactoring changes.
- Confirm that no secrets or private data are included.

For frontend changes, include screenshots when the visual behavior is relevant. For deployment changes, include the affected Docker Compose command and any required VM configuration.

## Commit messages

Use short, descriptive commit messages. A simple format such as the following is recommended:

```text
feat: add calendar reminder preferences
fix: reject invalid webhook signatures
docs: clarify local Ollama setup
```

## Issues

Use the issue templates for bug reports and feature requests. Include reproducible steps, expected behavior, actual behavior, and relevant logs with secrets removed.
