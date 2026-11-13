# Cross-CMS content-model contract

This file is loaded into every Create-component prompt.

- Generate source files only for the selected CMS, but always generate the logical content-model mapping for AEM, Edge Delivery Services, Contentful, and Optimizely.
- Each CMS model must contain one row for every logical authored field. Keep field coverage and order consistent across the four platforms; use platform-appropriate property names and native field types.
- For unselected CMS platforms, return `files: []` but do not return an empty `model` when the component has authored fields.
- When AEM is selected, the recursive `implementations.aem.fields` schema is canonical and must match the AEM dialog, Sling Model, HTL, direct-JCR HTL, and manifest. The other three `model` arrays map those same logical fields to their native CMS properties and types.
- When AEM is not selected, populate `implementations.aem.model` so the AEM tab still displays its field mapping; `implementations.aem.fields` may remain empty because no AEM source implementation is being generated.
- For composite multifields, include the collection and every nested authored field in the logical mapping. Use paths such as `slides[].image` and `tabs[].links[].label` where the target model represents child data.
- Do not use the sample Hero Banner field catalog as a substitute for the requested component schema. Derive mappings from the current component brief and its actual authored fields.
- Empty models are valid only for intentionally fieldless/static components or a pure proxy with no custom authored fields. Do not invent authored fields just to fill a table.
- Validation must reject incomplete cross-CMS mappings when the selected component has authored fields, while allowing implementation files to remain selected-CMS-only. The server-side `repairAemGenerationResponse` derives missing AEM-selected mappings from the canonical recursive field schema before validation; it must not fabricate fields absent from that schema.
