# AEM component contract

This file is loaded into every Create-component AEM generation prompt.

- Return `componentGroup` when the brief names a group. Use the exact value in both component metadata and `component.json`.
- For a custom component, every authored field must appear in the recursive field schema and match the Granite dialog, Sling Model, source HTL, direct-JCR HTL, and manifest.
- Composite multifields persist child resources. Source HTL that references `model.*` must declare `data-sly-use.model` with the generated component Sling Model class. Direct-JCR HTL must be model-free, locate each exact named group below `resource.children`, iterate its child resources, and read `valueMap` fields.
- Use the exact `name` from the recursive field schema for each multifield group and child property. Never invent a pluralized or renamed group in HTL.
- The server applies deterministic schema-derived repairs before validation: it restores the requested component group, fills incomplete cross-CMS model mappings, inserts the canonical Sling Model binding into source HTL, and rebuilds invalid composite direct-JCR HTL from the canonical AEM field contract. AI-authored behavior and files remain authoritative when they pass the contract.
- If behavior needs JavaScript, emit semantic markup hooks, clientlib JS, `js.txt`, and matching `clientlib.js` HTL inclusion. CSS must likewise be indexed and included with the same clientlib category. Every custom AEM component must emit a CSS asset plus `css.txt` (even minimal CSS), and source/direct-JCR HTL must include the CSS exactly once. Image fields must use a Granite DAM pathbrowser (`rootPath=/content/dam`) and render the saved DAM path with URI context plus authored alt text; do not bind an image field as a plain text string or use an unescaped raw URL. `component.json` is codebase metadata only and must never be included in direct JCR implementation operations.
- A pure Core Component proxy must contain only metadata and `sling:resourceSuperType`; do not generate custom HTL, dialog, Java, or clientlibs unless the brief asks to extend it.
- Fail closed when property names, composite group names, or clientlib categories do not agree. Do not substitute a generic component for the requested behavior.


## Interactive tabs behavior contract

When a brief requests multiple tabs, tabbed content, or show/hide tabs backed by a composite multifield:

- Model the repeatable tab collection as a composite multifield with exact child properties for the tab label/title and tab content. Preserve those exact names in the Granite dialog, Sling Model, source HTL, direct-JCR HTL, manifest and content-model mappings.
- Render each tab control as a native `<button type="button" role="tab">` inside a `role="tablist"`. Do not use an `li`, anchor without a destination, or generic element as the interactive control.
- Render a corresponding `role="tabpanel"` for each tab. Connect controls and panels with unique, matching `id`, `aria-controls` and `aria-labelledby` attributes. Initialize the first tab as selected and visible; all other panels must be hidden in the initial HTML.
- JavaScript must support click activation and WAI-ARIA keyboard navigation: ArrowLeft, ArrowRight, Home and End. Keep `aria-selected`, roving `tabindex` and panel visibility synchronized. Scope behavior to each component instance and do not let nested tabs interfere with their parent.
- CSS must explicitly honor the panel `hidden` attribute and provide a visible selected-tab and focus state.
- The model-free direct-JCR HTL must render the same tab controls and panels by iterating the exact composite group under `resource.children`, then each child resource's `valueMap`. It must not flatten the collection or reference a Sling Model.
- Include both CSS and JavaScript through the component clientlib in source HTL and direct-JCR HTL. Ensure the JS index and asset path are present.
- Validation must reject a tabbed multifield implementation if any of the semantic markup, initial visibility, click behavior, keyboard handling, direct-JCR parity, or CSS hidden-state behavior is missing.


## Natural-language configuration contract

Treat a short, conversational component description as the complete user brief. The user should describe the outcome, authoring experience and desired behaviour; do not require them to specify HTL, Sling Models, Granite UI, JCR, clientlib indexes, ARIA implementation or other internal engineering details. Infer conservative defaults and explain material assumptions in the generated result.

Component group and clientlib category are separate configuration values:
- Extract an explicitly supplied component group from ordinary phrasing (for example, "put this in the Special Components group") and preserve it exactly in component metadata and the component manifest.
- Extract an explicitly supplied clientlib category from ordinary phrasing (for example, "clientlib category should be scotia.components.dynamicTabs" or "use scotia.components.dynamicTabs as the clientlib category") and preserve it exactly.
- The same clientlib category must be used by clientlib .content.xml, source HTL CSS/JS calls, direct-JCR HTL CSS/JS calls, and the component manifest.
- Never derive the clientlib category from the component group, never independently invent a category in a later pipeline stage, and never let defaults override an explicit user value.
- If the user does not specify a component group, use the configured default component group. If no clientlib category is specified, use the configured default clientlib category consistently throughout source assembly and direct-JCR planning.
- Validate the final assembled source files and the final repository operation plan, not just the raw AI response, for category parity.

AEM generation is complete only when the user-visible behaviour, recursive authoring schema, dialog, model, source HTL, direct-JCR HTL, CSS, JavaScript, clientlib metadata and indexes all describe the same component. The generator owns the engineering detail; the user should not have to prompt-engineer it.
