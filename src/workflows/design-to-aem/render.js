import { esc } from '../../lib/dom.js';
import { tableHTML } from '../../ui/table.js';

const badge = (text, kind = 'good') => '<span class="pill ' + kind + '">' + esc(text) + '</span>';

function tree(data) {
  return '<div class="code-preview"><strong>' + esc(data.page.name) + '</strong><br>' +
    data.sections.map((s) => '├── <strong>' + esc(s.name) + '</strong><br>' +
      s.components.map((c, i) => '│   ' + (i === s.components.length - 1 ? '└── ' : '├── ') + esc(c) + '<br>').join('')
    ).join('') + '</div>';
}

function operations(data) {
  const page = data.page.path.replace(/\/+$/, '');
  const content = page + '/jcr:content';
  const ops = [
    { type: 'node', path: page, action: 'create', primaryType: 'cq:Page', properties: { 'jcr:title': data.page.title } },
    { type: 'node', path: content, action: 'create', primaryType: 'cq:PageContent', properties: {
      'jcr:title': data.page.title, 'jcr:description': data.page.description,
      'cq:template': data.template.path, 'sling:resourceType': 'core/wcm/components/page/v3/page'
    } }
  ];
  const components = new Map(data.components.map(c => [c.name.toLowerCase(), c]));
  const authored = new Map(data.authoring.map(a => [a.component.toLowerCase(), a]));
  data.sections.forEach((section, si) => {
    const sectionName = section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    const sectionPath = content + '/section-' + (si + 1) + '-' + sectionName;
    ops.push({ type: 'node', path: sectionPath, action: 'create', primaryType: 'nt:unstructured',
      properties: { 'sling:resourceType': 'core/wcm/components/container/v1/container', layout: section.layout } });
    section.components.forEach((name, ci) => {
      const c = components.get(name.toLowerCase());
      if (!c) return;
      const a = authored.get(c.name.toLowerCase());
      const node = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (ci + 1);
      ops.push({ type: 'node', path: sectionPath + '/' + node, action: 'create', primaryType: 'nt:unstructured',
        properties: { 'sling:resourceType': c.resourceType, ...(a?.properties || {}) } });
    });
  });
  return ops;
}

export function render(data) {
  return `
    <div class="res">
      <div class="res-head"><div><h3>Design → AEM: ${esc(data.page.name)}</h3><p class="sumline">7-stage page generation workflow</p></div>${badge(data.source.analysisStatus === 'semantic-input' ? 'Semantic analysis' : 'Reference-based analysis', data.source.analysisStatus === 'semantic-input' ? 'good' : 'warn')}</div>
      <div class="stats"><div><b>${data.sections.length}</b><span>Sections</span></div><div><b>${data.components.length}</b><span>Components</span></div><div><b>${data.components.filter(c=>c.action==='reuse').length}</b><span>Reused</span></div><div><b>${data.components.filter(c=>c.action==='generate').length}</b><span>Generate</span></div></div>

      <section class="sec"><h4 class="sec-title">1. Design Input</h4><p><strong>Source:</strong> ${esc(data.source.type)}</p><p><strong>URL:</strong> <code>${esc(data.source.url)}</code></p><p class="muted">The URL is retained as the design source reference. Private Figma inspection is not performed without an API integration.</p></section>
      <section class="sec"><h4 class="sec-title">2. Analyze Design</h4>${tree(data)}</section>
      <section class="sec"><h4 class="sec-title">3. Template</h4><p><strong>${esc(data.template.name)}</strong> ${badge(data.template.strategy === 'reuse' ? 'Reuse' : 'Generate plan', data.template.strategy === 'reuse' ? 'good' : 'warn')}</p><p><code>${esc(data.template.path)}</code></p><p>${esc(data.template.reason)}</p></section>
      <section class="sec"><h4 class="sec-title">4. Components</h4>${tableHTML(['Design element','AEM resource type','Action','Confidence','Fields'], data.components.map(c=>['<code>'+esc(c.name)+'</code>','<code>'+esc(c.resourceType)+'</code>',badge(c.action,c.action==='reuse'?'good':'warn'),c.confidence+'%',esc(c.fields.join(', ')||'Inferred')]))}</section>
      <section class="sec"><h4 class="sec-title">5. Page Structure</h4>${tree(data)}</section>
      <section class="sec"><h4 class="sec-title">6. Author Content</h4>${data.authoring.length ? tableHTML(['Component','Properties'],data.authoring.map(a=>['<code>'+esc(a.component)+'</code>','<code>'+esc(JSON.stringify(a.properties))+'</code>'])) : '<p class="muted">No authored properties inferred.</p>'}${data.assets.length ? tableHTML(['Source','DAM path','Action'],data.assets.map(a=>[esc(a.source),'<code>'+esc(a.damPath)+'</code>',badge(a.action,a.action==='reference'?'good':'warn')])) : ''}</section>
      <section class="sec"><h4 class="sec-title">7. Review & Generate AEM Page</h4><p><strong>Page:</strong> <code>${esc(data.page.path)}</code></p><p><strong>Template:</strong> <code>${esc(data.template.path)}</code></p>${data.review.map(r=>'<p class="notice">'+esc(r)+'</p>').join('')}</section>

      <section class="sec design-aem-write-panel"><h4 class="sec-title">Final operation</h4><p class="muted">Select an authenticated AEM connection, review the exact repository operations, then explicitly approve the write.</p>
        <div class="field"><label for="design-aem-target">AEM connection</label><select id="design-aem-target"><option value="">Choose an AEM connection...</option></select></div>
        <button class="btn secondary" type="button" id="design-aem-load-targets">Refresh AEM connections</button>
        <button class="btn success" type="button" id="design-aem-generate-page" disabled>✓ Generate AEM Page</button>
        <label class="confirm-row"><input type="checkbox" id="design-aem-confirm"> I reviewed the exact page paths and authorize this AEM write.</label>
        <pre id="design-aem-operations" class="code-preview" hidden></pre><pre id="design-aem-result" class="code-preview" hidden></pre>
      </section>
      <script type="application/json" id="design-aem-plan">${JSON.stringify(data).replace(/</g, "\\u003c").replace(/&/g, "\\u0026")}</script>
      <script type="application/json" id="design-aem-ops">${JSON.stringify(operations(data)).replace(/</g, "\\u003c").replace(/&/g, "\\u0026")}</script>
    </div>`;
}
