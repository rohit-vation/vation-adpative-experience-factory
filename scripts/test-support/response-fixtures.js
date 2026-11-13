const impl = (name, lang, code) => ({
  model: [{ field: 'title', type: 'text', note: 'Test fixture' }],
  files: [{ name, lang, code }],
});

export function responseFixture(id) {
  if (id === 'create') {
    return {
      component: { name: 'Example component', cms: 'aem', summary: 'Example response fixture.' },
      design: { a11y: ['Use meaningful alternative text.'] },
      implementations: {
        aem: {
          model: [{ field: 'title', type: 'text', note: 'Test fixture' }],
          fields: [{ name: 'title', label: 'Title', type: 'text', required: true, role: 'title' }],
          files: [
            { name: 'apps/site/components/example/example.html', lang: 'html', code: '<section class="cmp-example"><h1>${model.title}</h1></section>' },
            { name: 'apps/site/components/example/clientlib/css/example.css', lang: 'css', code: '.cmp-example{display:block;max-width:100%;}' }
          ]
        },
        eds: impl('blocks/example/example.js', 'js', 'export default function decorate() {}'),
        cf: impl('contentful-example.json', 'json', '{}'),
        opti: impl('Views/Shared/Components/Example.cshtml', 'html', '<div>Example</div>'),
      },
    };
  }
  if (id === 'map') {
    return {
      components: [{
        name: 'Example component',
        mapping: [{ field: 'title', source: 'title', target: 'title', transform: 'Copy', confidence: 'high' }],
        sourceFiles: [{ name: 'source.html', lang: 'html', code: '<h1>Example</h1>' }],
        targetFiles: [{ name: 'target.html', lang: 'html', code: '<h1>Example</h1>' }],
      }],
      notes: ['Review the mapping against the target CMS schema.'],
    };
  }
  if (id === 'audit') {
    return {
      subject: 'example.com',
      categories: ['a11y', 'seo', 'perf', 'ds', 'content'].map((id) => ({ id, score: 80, passed: 8 })),
      metrics: [{ label: 'LCP', value: '2.0 s', target: 'Target 2.5 s or less', status: 'good' }],
      findings: [],
    };
  }
  if (id === 'migrate') {
    return {
      site: { host: 'example.com', pages: 1, assets: 1 },
      stats: [{ label: 'Pages found', value: '1' }],
      templates: [{ name: 'Page', pages: 1, components: 'Text' }],
      mapping: [{ source: 'Title', target: 'title', fields: 'title', confidence: 'high' }],
      output: { name: 'example.html', lang: 'html', code: '<main><h1>Example</h1></main>' },
      review: [],
    };
  }
  throw new Error('No mock response fixture for workflow: ' + id);
}
