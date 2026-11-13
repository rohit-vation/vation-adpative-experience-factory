/**
 * Shared CMS implementation panel used before and after component generation.
 * Connection/path values are retained in the live workflow state between renders.
 */
export function liveImplementationPanelHTML() {
  return `
    <section class="live-aem-panel live-aem-initial" id="create-live-aem-panel" aria-labelledby="create-live-aem-title">
      <div class="live-aem-head">
        <div class="live-aem-mark" aria-hidden="true">↗</div>
        <div class="live-aem-heading">
          <span class="live-aem-kicker">CMS IMPLEMENTATION</span>
          <h4 id="create-live-aem-title">Review and implement directly in CMS</h4>
          <p>Choose your CMS connection and component location, generate your component, then review the exact resources before approving their creation in the CMS.</p>
        </div>
      </div>
      <div class="live-aem-fields">
        <div>
          <label for="create-live-target">CMS connection</label>
          <select id="create-live-target"><option value="">Loading CMS connections...</option></select>
        </div>
        <div>
          <label for="create-live-component-path">Component repository path</label>
          <input id="create-live-component-path" type="text" value="" placeholder="/apps/your-project/components/content/heroBanner" spellcheck="false" autocomplete="off">
          <small class="live-aem-field-hint">Replace your-project with your application namespace. This path is checked during Generate; existing project namespaces are not auto-filled.</small>
        </div>
      </div>
      <p id="create-live-summary" class="live-aem-summary" aria-live="polite">Choose a CMS connection and enter a component path.</p>
      <div id="create-live-review" class="live-aem-review" hidden>
        <div class="live-aem-review-head">
          <div><b>Review before write</b><p id="create-live-operation-count">No operations prepared.</p></div>
          <button type="button" class="live-aem-button secondary" id="create-live-copy" disabled>Copy JSON</button>
        </div>
        <pre id="create-live-operations" class="live-aem-code"></pre>
        <label class="live-aem-confirm"><input type="checkbox" id="create-live-confirm-write"><span>I reviewed these exact paths and authorize writing them to the selected CMS repository.</span></label>
        <div class="live-aem-actions"><button type="button" class="live-aem-button primary" id="create-live-apply" disabled>Apply reviewed resources to CMS</button></div>
      </div>
      <div id="create-live-operation-results" class="live-aem-operation-results" hidden aria-live="polite"></div>
      <pre id="create-live-output" class="live-aem-output is-info" aria-live="polite">Generate validates the component path and prepares the repository plan. Nothing is written until you explicitly approve it.</pre>
    </section>`;
}
