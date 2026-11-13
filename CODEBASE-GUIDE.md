# Adaptive Experience Factory — Codebase Guide

This guide describes the current repository structure, the generation path, where the rules live, how direct AEM writes are guarded, and where future component support should be added.

## 1. Project at a glance

Adaptive Experience Factory is a Node.js ES-module application with a browser UI and a server API. The browser requests generated results from a configured AI provider; the server builds prompts, calls the provider, validates its JSON, and returns a normalized result. For AEM, the Create workflow also produces an instance-only JCR plan. Repository writes require explicit user approval and are not a substitute for compiling or deploying an AEM codebase.

Main runtime entry points:
- package.json — scripts, project metadata and syntax/test commands.
- server/server.js — HTTP server, API routing, static source serving and AI generation route.
- src/main.js — browser application entry, workflow selection and Generate lifecycle.
- src/ai/system-prompt.js — canonical AI rules and shared field normalization.
- src/ai/prompts.js — workflow-specific prompt and response contracts.
- src/ai/validate.js — deterministic response validation/normalization.
- src/services/generate.js — front-end generation service and AEM source-file completion.
- src/ui/live-implementation.js — AEM connection selection, path validation, plan preparation, operation preview and approved write flow.

## 2. Root files

- README.md — quick setup, supported workflows, security notes and test commands.
- AEM-INTEGRATION.md — AEM integration details and constraints.
- index.html — browser app HTML shell and stylesheet/script entry.
- .env.example — documented environment variable template; safe defaults and names only.
- .env — local secrets/configuration; do not commit or share.
- .gitignore — protects secrets, local state and generated files.
- package.json and package-lock.json — runtime scripts and dependency lock.

## 3. Server

### server/server.js
Creates the Node server, exposes API routes, serves public browser resources, validates inbound generation requests and calls the AI layer. Start the project with npm start from this repository root.

### server/ai/
- index.js — provider/model resolution, retries, configured fallback model, model discovery and API readiness state.
- errors.js — AI provider error types.
- http.js — provider HTTP response/error normalization.
- providers/ — provider-specific API adapters. When adding another provider, implement its adapter and register it in the provider index instead of adding provider-specific logic to every workflow.

### server/aem-client.js
Low-level AEM HTTP client. It validates target URLs and authentication, performs bounded repository reads, resolves exact/ancestor paths, checks resource types, writes approved node/file operations, retries only where safe, and returns detailed per-operation results. A successful read must distinguish present, verified absent and unverifiable. Never interpret a permission error, ambiguous HTTP response or partial tree as proof that a resource is unused.

### server/aem-forge.js
CMS connection and repository API routes: registered targets, connection tests, encrypted connections, runtime logs, repository reads and reviewed repository writes. It records per-resource success/failure details. Keep HTTP route policy here; keep repository-specific low-level operations in aem-client.js.

### server/connection-vault.js
Encrypts and stores dashboard-managed CMS connection credentials locally. Do not log or return raw credentials.

### server/logger.js
Structured application log levels, filtering, query and secret redaction. Use this for actionable diagnostics rather than showing vague errors without path/status context.

### server/env.js and server/server-utils.js
Environment loading and shared server request/response utilities. Add configuration defaults/documentation here only when the variable is genuinely required.

## 4. Browser source

### src/main.js
Main UI controller: renders home/workflow screens, reads form input, validates it, calls the generation service, renders results, and invokes live AEM plan preparation after successful generation. It should orchestrate workflow modules, not contain CMS-specific JCR conversion logic.

### src/config.js
CMS IDs, labels and shared application configuration. Keep product-wide identifiers here.

### src/views/
- home.js — home workflow dashboard.
- workflow.js — generic workflow shell, loading state and error state.

### src/ui/
- ai-picker.js — provider and model selectors.
- connections.js — CMS connections UI and interactions.
- live-implementation-template.js — markup for the inline CMS implementation panel.
- live-implementation.js — CMS target list, path validation, FileVault-to-JCR mapping, clientlib normalization, model-free HTL conversion, prepared operation JSON, operation results and explicit approval flow.
- log-panel.js — browser-facing view of structured runtime logs.
- code-block.js — source-file tabs and code preview.
- tabs.js and table.js — shared result tabs/tables.
- form.js and events.js — shared form and browser event wiring.
- pills.js — result-source labels.
Do not create another implementation panel or add a second path-check action. Generate should own preflight/plan preparation; the review checkbox and Apply action own the write.

### src/workflows/
- index.js — workflow registry.
- create/ — component generation UI contract and result renderer. The selected CMS is shown first; other platform implementations remain accessible in tabs.
- map/ — CMS-to-CMS component mapping.
- audit/ — quality audit workflow and check definitions.
- migrate/ — content migration workflow.
Each workflow defines form input, checks, prompt data, response validation requirements and rendering. Shared workflow mechanics belong in main.js/services, not duplicated inside each workflow.

### src/data/
- fields.js — general/shared content model examples used by workflow results.
- implementations/ — CMS implementation file generators/templates.
- implementations/aem.js — AEM codebase source files driven by the normalized AEM field contract. This is where AEM metadata, Granite dialog XML, model-bound HTL, Sling Model Java, component.json and clientlib source output are assembled.
- implementations/helpers.js and css-template.js — path/name helpers and CSS template helpers.
When adding an AEM field type, update the canonical field schema/rulebook, dialog generator, Sling Model type/getter mapping, HTL renderer, manifest, direct-JCR conversion if relevant, and tests together.

### src/aem/instance-only-plan.js
Converts source-style resource paths into supported instance/JCR node and file operations and validates the direct-write plan. It does not build Maven bundles, compile Java, install packages or activate OSGi services.

### src/lib/
Shared DOM escaping, icon definitions and text helpers. Keep rendering-time HTML escaping centralized.

### src/styles/
- tokens.css — design tokens.
- base.css — global base styles/reset.
- components.css — shared components.
- workflow.css and home.css — page/workflow layout.
- results.css — result/model/source preview styling.
- aem-forge.css — CMS connection, review/operation status and AEM preview styling.
- ai-picker.css — provider/model picker.
Keep project styling scoped and avoid global selectors that affect generated content unintentionally.

## 5. Canonical AI rulebook and prompt flow

There should be one canonical file for rules: src/ai/system-prompt.js. It holds the shared system instruction, AEM component generation standards, complex component patterns, proxy/Core Component guidance, normalized field contract, and rule suggestion filtering.

src/ai/prompts.js imports the rulebook and adds the actual user description and workflow-specific JSON response contract. It defines the required response shape; it should not become a second competing store of AEM best practices.

src/ai/validate.js validates model output. For AEM Create it normalizes field names/types/roles/options and filters any proposed rule improvements. UI output and later resource generation should consume the normalized fields—not infer a different schema from a generic sample.

This is prompt-guided generation plus deterministic validation, not automatic training of model weights. A new reusable pattern should be returned as a ruleSuggestions proposal. A maintainer reviews it, merges accepted guidance into src/ai/system-prompt.js, and adds a regression test. Never auto-write model-authored text into source rules; that would permit prompt injection or an AI response to weaken security and write safeguards.

## 6. AEM Create request flow

1. User enters component name, description, CMS and CMS connection/path.
2. src/main.js validates the form and asks live-implementation.js to run the AEM path preflight before the AI request.
3. server/server.js passes the prompt to the configured provider through server/ai/index.js.
4. src/ai/prompts.js builds the response contract and appends the canonical component rules.
5. src/ai/validate.js rejects incomplete output and normalizes the shared fields contract.
6. src/services/generate.js ensures the AEM source-code files are complete and field-driven.
7. src/workflows/create/render.js shows all CMS tabs and the source code previews.
8. src/ui/live-implementation.js prepares the exact direct-JCR plan and previews it, using the normalized field schema. It must not run a second validation when the user is only editing the path or connection; Generate is the point where preflight runs.
9. User reviews the exact operations, explicitly checks the approval box and clicks Apply.
10. server/aem-forge.js routes the write to server/aem-client.js. Each operation is reported as verified success or an exact failure. A partial write is not rolled back automatically.

## 7. Source files vs direct JCR implementation

Codebase source deliverables can include component metadata, Granite dialog XML, model-bound HTL, Sling Model Java, component.json, clientlib metadata, CSS/JS and their indexes. They are meant to be copied into and built with the actual AEM Maven/code repository.

Direct JCR deployment writes only supported repository nodes/files. Since Java source cannot be compiled or activated through a JCR write, the operation plan excludes Java and component.json, and converts the HTL output to a properties-based model-free version. These two outputs must use the same field schema but must not be confused with each other.

The clientlib folder must use cq:ClientLibraryFolder. The clientlib root must contain css.txt/js.txt; referenced assets live under clientlib/css or clientlib/js. Categories in clientlib metadata and HTL must match. Never report source-only files as if they were installed into AEM.

## 8. Adding complex component support

Start with the component description and define the field tree:
- Carousel/image carousel: composite slides, asset paths, alt/caption, optional actions, control/pagination/autoplay/reduced-motion rules and accessible slide state.
- Video carousel: video source type, poster, transcript/captions, controls, loading/error states and external provider allowlisting.
- Tabs/hide-show: repeatable tab data, IDs, labels, panel association, keyboard navigation, focus and ARIA behavior.
- Dynamic/composite multifield: nested child schema, correct Granite structure, stable persisted values and add/remove/reorder/empty behavior.
- Proxy components: identify the right OOTB supertype and version, retain inheritance, add only the required project-specific dialog/policy/model/style extension.
- Shared/compound components: clearly separate parent options from child fields, scope style and script per component instance, and test multiple instances.

For each pattern, keep the field contract consistent across dialog, Sling Model, HTL and component.json. Add fixtures for the generated files and direct-JCR transform. Do not use a single Hero Banner fixture as proof that every component shape works.

## 9. Tests and their purpose

- scripts/smoke-test.js — core application/API smoke coverage.
- scripts/ai-test.js — AI request, response parsing, validation and provider behavior against a local mock.
- scripts/aem-forge-test.js — CMS connection/repository API tests using mock AEM responses, including path verification, clientlib type checks, logging and write approval.
- scripts/live-component-test.js — source-file generation, path conversion, clientlib layout, HTL model-to-properties conversion and generated field consistency.
- scripts/test-support/ — controlled mock AI replies and fixtures.
- scripts/sample-inputs.js — test workflow inputs.
npm run check runs JavaScript syntax checks. npm test runs the listed test suites. Mock tests do not prove a live provider key/model or real AEM instance is valid; those require a separate live, non-destructive check.

## 10. Cleanup and change-location map

- All reusable AI rules: src/ai/system-prompt.js only.
- Prompt shape and user-input instructions: src/ai/prompts.js.
- Deterministic field and response validation: src/ai/validate.js.
- AEM source-code files and field-aware templates: src/data/implementations/aem.js.
- Direct JCR conversion/path validation/approval UI: src/ui/live-implementation.js.
- AEM repository HTTP, selectors, permissions and write verification: server/aem-client.js.
- CMS endpoints, logs and connections: server/aem-forge.js.
- Generated UI and rule-suggestion rendering: src/workflows/create/render.js.
- Visual changes: src/styles/*.css.
- Add each feature together with a regression test in scripts/.
- Keep .env, credentials, target IDs and client/customer data out of committed source.

Before deleting any remaining module, search imports/references, migrate its logic to the canonical location, run npm run check and npm test, and only then remove the unused file. Avoid duplicate prompt rules in workflow code comments or generated sample data.

## 11. General description-driven component generation

- src/ai/system-prompt.js is the single canonical rulebook. It tells the AI to treat short descriptions as feature briefs, infer normal implementation details from the request, use Adobe guidance and avoid restricting generation to a catalog of known component names. A rule-only change belongs here; a capability change also needs implementation updates and a regression test.
- src/ai/prompts.js gives the model the required recursive field and source-file contract. It asks for component-specific HTL and CSS, JavaScript when the behavior needs it, and Sling Model/helper source where server-side logic or the user's request requires it. Users should not need to paste Adobe's implementation checklist into each request.
- src/ai/validate.js verifies the AI response before rendering it. For AEM custom components it requires real HTL/HTML and CSS, JavaScript when the short feature description implies client-side behavior, Java Sling Model source when explicitly requested, and the multifield fields in the recursive schema. Composite multifield or Sling Model-based components also require a separate, model-free directJcrHtl rendering. Incomplete responses are retried/rejected rather than silently presented as working code.
- src/data/implementations/aem.js generates shared AEM scaffolding from the validated schema: component metadata, Granite dialog XML, Sling Model field bindings, a generic schema-driven fallback HTL, component.json and clientlib/CSS setup. It does not select a prewritten implementation based on component name.
- src/services/generate.js preserves the AI-authored implementation for any component. It maps the primary source HTL/CSS/JS into stable component paths, preserves additional safe source files including Java helper/model files, aligns clientlib categories, builds css.txt/js.txt from the assets actually emitted, and inserts missing source-HTL clientlib includes. It does not replace an arbitrary component with a Hero Banner or Carousel implementation.
- Composite multifields use relative nested field names and persisted child-resource nodes. Source HTL should use the proper Sling Model; directJcrHtl supplies the model-free alternate that the direct-JCR planner installs because that route does not compile Java source. The field tree is kept in component.json, and direct HTL must iterate the matching child resource/valueMap structure. The UI prepends a scoped clientlib definition and connects CSS/JS indexes to the same category.
- Pure OOTB Core Component proxies remain a separate explicit mode using proxyComponent and resourceSuperType. They do not get a competing custom HTL/dialog/clientlib unless the user requested an extension, and the UI checks the selected Author for the target supertype before preparing the reviewed write plan.
- Regression coverage in scripts/live-component-test.js uses nested navigation and a concise image-carousel brief as examples of the general pipeline—not special production component types. It verifies schema/dialog consistency, retention of AI-authored HTL/CSS/JS/Java files, clientlib wiring, JS syntax and direct-JCR conversion. scripts/ai-test.js verifies the short-description response contract, recursive schemas, proxy validation, and fail-closed handling of missing behavior assets.

Mock tests verify code structure and local operation-plan conversion. They cannot prove that a real AEM Author has every requested dependency or that the component behaves correctly on the actual page. The final acceptance check still requires applying the reviewed plan to the target test Author and checking the rendered page, authoring dialog, saved content and browser console.
