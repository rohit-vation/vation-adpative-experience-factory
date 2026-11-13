# Adaptive Experience Factory agent guidance

## Active generation contracts

- Treat `src/ai/system-prompt.js`, `src/ai/rules/aem-component-contract.md`, and `src/ai/rules/cross-cms-content-models.md` as the active generation rulebook. Both Markdown contracts are loaded by `src/ai/prompts.js` and injected into the server-side generation prompt.
- A prompt/rule file is not effective merely because it exists. Confirm it is loaded by the generation path and add a regression test for every new rule.
- The Create workflow generates implementation files only for the selected CMS, but must populate the logical content-model mappings for AEM, EDS, Contentful and Optimizely whenever the component has authored fields.
- When the AEM brief explicitly names a component group, preserve that exact group from the user brief through validation, component metadata, manifest and direct-JCR fallback metadata.

## AEM implementation contract

- The server runs `src/services/aem-generation-repair.js` before strict validation. Keep its schema-derived repairs aligned with the AEM field generator and the Markdown contracts.
- When adding a field type or AEM behavior, update the prompt contract, deterministic repair, validation, source generator, direct-JCR conversion, preview rendering, and regression tests together.
- Preserve exact field-name parity across Granite dialogs, JCR properties, Sling Model injection/getters, HTL bindings, direct-JCR HTL and component manifests.
- Composite multifields persist child resources. Validate nested child-resource rendering and display nested CMS property paths in the preview (for example, `slides[].image`).
- Verify clientlib categories, `css.txt`/`js.txt` indexes, asset locations and HTL includes as one contract. Use the official HTL clientlib template path.
- For a pure proxy component, retain `sling:resourceSuperType` inheritance and do not add competing implementation files.
- Preserve the API-only architecture: generated source files are previews; direct JCR writes must remain explicit, reviewed, and model-free.
- Do not overwrite unrelated user work. Inspect repository state first; if version control is unavailable, make a focused backup before editing.

## Required verification

- Run `npm run check` and `npm test` before handing off a change.
- Add tests for generation output, validation failures, operation-plan conversion and UI rendering whenever a change crosses those boundaries.
- A successful file write is not proof that an AEM component works. Verify dialog persistence, HTL rendering, clientlib loading and component-group visibility in a real AEM Author before calling the component complete.
