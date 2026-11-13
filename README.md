# Adaptive Experience Factory

Adaptive Experience Factory is a local engineering workspace for generating CMS implementation plans and component resources with a configured AI provider API.

## Requirements

- Node.js 20 or newer.
- A valid key for at least one supported AI provider.
- A CMS connection only for workflows that need to read or write against a live instance.

## Run locally

1. Copy `.env.example` to `.env`.
2. Add a valid `GEMINI_API_KEY` or `OPENAI_API_KEY` and confirm the selected model is available to that key.
3. Run `npm install` if dependencies have not been installed, then `npm start`.
4. Open `http://127.0.0.1:3000`.

Generation always uses the configured provider API. There is no demo/sample result path and no API on/off control. Missing, rejected, rate-limited or unreachable provider requests return an error instead of a substitute result. API usage may incur charges.

## Workflows

The workspace keeps four workflows: **Create**, **Map**, **Audit**, and **Migrate**. The Create workflow can generate an AEM component result. Its inline live implementation action can inspect a registered local AEM repository, show the exact JCR paths, and write resources only after explicit approval. The direct JCR write path supports authenticated loopback AEM 6.5 or local SDK Author targets; it does not compile Java source.

## CMS connections

Use **Connections** in the header to register, test, and remove CMS environments. No customer/project-specific targets or credentials are preloaded. Credentials entered through the form are stored in the local encrypted connection vault; saved secrets are not displayed back in the interface. Use a least-privilege account and test a connection before performing any writes.

The direct component implementation supports reviewed repository reads and writes only. Every write requires explicit approval, and no operation runs automatically.

## Configuration and security

- Keep `.env`, API keys, passwords, bearer tokens and encrypted connection-vault data out of source control.
- `HOST=127.0.0.1` keeps the application bound to loopback by default. Change it only when you understand the exposure and authentication implications.
- Use HTTPS for remote CMS environments. Plain HTTP is intended for local loopback endpoints.
- Treat generated code as a proposal: inspect the result and review the listed repository operations before approving writes.

## Verification

- `npm run check` — JavaScript syntax checks.
- `npm test` — workflow, API mock, CMS integration and component implementation tests.

The API tests use local mocks; they do not validate that a real provider key is accepted by the provider. A real generation request is the definitive check of the configured key and model.
