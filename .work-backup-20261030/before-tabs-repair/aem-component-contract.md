# AEM component contract

This file is loaded into every Create-component AEM generation prompt.

- Return `componentGroup` when the brief names a group. Use the exact value in both component metadata and `component.json`.
- For a custom component, every authored field must appear in the recursive field schema and match the Granite dialog, Sling Model, source HTL, direct-JCR HTL, and manifest.
- Composite multifields persist child resources. Source HTL that references `model.*` must declare `data-sly-use.model` with the generated component Sling Model class. Direct-JCR HTL must be model-free, locate each exact named group below `resource.children`, iterate its child resources, and read `valueMap` fields.
- Use the exact `name` from the recursive field schema for each multifield group and child property. Never invent a pluralized or renamed group in HTL.
- The server applies deterministic schema-derived repairs before validation: it restores the requested component group, fills incomplete cross-CMS model mappings, inserts the canonical Sling Model binding into source HTL, and rebuilds invalid composite direct-JCR HTL from the canonical AEM field contract. AI-authored behavior and files remain authoritative when they pass the contract.
- If behavior needs JavaScript, emit semantic markup hooks, clientlib JS, `js.txt`, and matching `clientlib.js` HTL inclusion. CSS must likewise be indexed and included with the same clientlib category.
- A pure Core Component proxy must contain only metadata and `sling:resourceSuperType`; do not generate custom HTL, dialog, Java, or clientlibs unless the brief asks to extend it.
- Fail closed when property names, composite group names, or clientlib categories do not agree. Do not substitute a generic component for the requested behavior.
