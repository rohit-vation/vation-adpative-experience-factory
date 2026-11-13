# CMS Connections and Direct AEM Implementation

## Connect a CMS

1. Start the application and open **Connections** in the header.
2. Add a meaningful connection name, platform, role, base URL and authentication method.
3. Save and test the connection. Resolve any URL, authentication or permission errors before using it.
4. Select the registered connection from the inline Create workflow when implementing an AEM component.

Credentials are held in the local encrypted connection vault and are not shown in the saved-connection list. Use a least-privilege service account. No project-specific AEM targets or credentials are preloaded.

## Supported direct repository writes

The inline Create implementation can write reviewed repository resources to an authenticated loopback AEM 6.5 Author or local SDK Author. Publisher and hosted cloud targets are not supported by this direct JCR write action.

The workflow checks the selected connection, resolves and checks the component path, then displays the exact repository operations for review. No repository write happens until the user explicitly approves the write. The result is successful only when all requested JCR operations succeed and the server verifies them.

This direct JCR path writes component metadata, a Granite dialog, HTL and client-library resources. It does not compile Java source. If an implementation requires compiled Java/OSGi code or deployment-specific steps, use your approved source-code build and release process instead.

## AI provider

Generation requires a valid provider API key in the server `.env`. Configure `GEMINI_API_KEY` or `OPENAI_API_KEY` and select an available model. API mode is always on; missing or rejected credentials produce an explicit error, never demo content. Provider/model verification and generation requests may incur charges.

## Safety notes

- Keep API keys, CMS passwords, bearer tokens, and `.env` out of source control.
- Keep the server bound to `127.0.0.1` unless external exposure is intentional and adequately protected.
- Use HTTPS for remote CMS targets; HTTP is for loopback development instances.
- Review repository paths before write approval and validate authored output in a non-production environment.
