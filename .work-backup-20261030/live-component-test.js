import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { convertSourceProjectPlanToInstancePlan } from '../src/aem/instance-only-plan.js';
import { aemFiles } from '../src/data/implementations/aem.js';
import { ensureCompleteAemFiles } from '../src/services/generate.js';
import { normalizeComponentFields } from '../src/ai/system-prompt.js';
import { normalizeComponentRoot, componentResourceSuffix, normalizeClientlibResourceSuffix, normalizeClientlibCategoryReferences, htlOnly } from '../src/ui/live-implementation.js';

const componentName = 'Hero Banner';
const componentKey = 'heroBanner';
const componentSlug = 'hero-banner';
const baselineFields = [
  { name: 'title', label: 'Headline', type: 'text', required: true, role: 'title', options: [] },
  { name: 'description', label: 'Description', type: 'textarea', required: false, role: 'body', options: [] },
  { name: 'fileReference', label: 'Background image', type: 'path', required: false, role: 'image', rootPath: '/content/dam', options: [] },
  { name: 'imageAlt', label: 'Image alt text', type: 'text', required: false, role: 'imageAlt', options: [] },
  { name: 'linkText', label: 'Button label', type: 'text', required: false, role: 'ctaLabel', options: [] },
  { name: 'linkURL', label: 'Button link', type: 'path', required: false, role: 'ctaLink', rootPath: '/content', options: [] },
  { name: 'alignment', label: 'Text alignment', type: 'select', required: false, role: 'alignment', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] }
];
const files = aemFiles(componentName, baselineFields);
const byName = new Map(files.map((file) => [file.name, file]));
const mustHave = [
  `apps/site/components/${componentKey}/.content.xml`,
  `apps/site/components/${componentKey}/_cq_dialog/.content.xml`,
  `apps/site/components/${componentKey}/${componentKey}.html`,
  `apps/site/components/${componentKey}/clientlib/.content.xml`,
  `apps/site/components/${componentKey}/clientlib/css.txt`,
  `apps/site/components/${componentKey}/clientlib/css/${componentKey}.css`,
  `apps/site/components/${componentKey}/component.json`,
  'core/models/HeroBannerModel.java',
];
for (const name of mustHave) assert.ok(byName.has(name), `Missing required AEM resource: ${name}`);

const dialog = byName.get(`apps/site/components/${componentKey}/_cq_dialog/.content.xml`).code;
assert.ok(dialog.includes('fieldLabel="Description"') && dialog.includes('name="./description"') && dialog.includes('rows="{Long}5"'));
assert.match(dialog, /granite\/ui\/components\/coral\/foundation\/form\/textarea/);
assert.match(dialog, /name="\.\/imageAlt"/);
assert.match(dialog, /name="\.\/title"/);
assert.match(dialog, /name="\.\/fileReference"/);
assert.match(dialog, /name="\.\/linkText"/);
assert.match(dialog, /name="\.\/linkURL"/);
assert.doesNotMatch(dialog, /authoring\/dialog\/richtext/);

const htl = byName.get(`apps/site/components/${componentKey}/${componentKey}.html`).code;
for (const property of ['model.title', 'model.description', 'model.fileReference', 'model.imageAlt', 'model.linkText', 'model.linkURL', 'model.alignment']) {
  assert.ok(htl.includes(property), `Model-bound HTL does not render dialog property ${property}`);
}
assert.ok(htl.includes('data-sly-use.model="com.example.site.core.models.HeroBannerModel"'), 'Codebase HTL should adapt the component Sling Model');
assert.ok(htl.includes('${model.title}') && htl.includes('${clientlib.css @ categories='), 'Source HTL must use valid ${...} HTL expressions, not %{...} placeholders');
assert.ok(htl.includes(`site.components.${componentKey}`), 'HTL should load the component CSS category');
for (const badProperty of ['properties.headline', 'properties.text', 'properties.ctaLabel']) {
  assert.ok(!htl.includes(badProperty), `HTL contains stale property name ${badProperty}`);
}
const directHtl = htlOnly(htl, `site.components.${componentKey}`);
assert.ok(!directHtl.includes('data-sly-use.model'), 'Direct instance HTL must not reference an uncompiled Sling Model');
for (const property of ['properties.title', 'properties.description', 'properties.fileReference', 'properties.imageAlt', 'properties.linkText', 'properties.linkURL', 'properties.alignment']) {
  assert.ok(directHtl.includes(property), `Direct-JCR HTL does not bind to property ${property}`);
}
assert.ok(!directHtl.includes('${model.'), 'Direct-JCR HTL must remove all uncompiled Sling Model expressions');
const manifest = byName.get(`apps/site/components/${componentKey}/component.json`).code;
assert.ok(manifest.includes('"fields"') && manifest.includes('"title"'), 'Codebase component.json should describe the actual fields');
assert.ok(!/localhost|4502|targetId|connectionId|password|apiKey/i.test(manifest), 'component.json must not contain connection or instance-specific data');

const clientlib = byName.get(`apps/site/components/${componentKey}/clientlib/.content.xml`).code;
assert.ok(clientlib.includes(`site.components.${componentKey}`), 'Client library category must match HTL');
const cssTxt = byName.get(`apps/site/components/${componentKey}/clientlib/css.txt`).code;
assert.equal(cssTxt.trim(), `#base=css\n${componentKey}.css`, 'css.txt must reference the CSS folder using #base=css');
const css = byName.get(`apps/site/components/${componentKey}/clientlib/css/${componentKey}.css`).code;
assert.ok(css.includes(`.cmp-${componentSlug}`), 'CSS selectors must match the HTL markup');
assert.ok(css.includes(`.cmp-${componentSlug}__content`), 'CSS content selector missing');

const thinAiResult = {
  component: { name: componentName },
  implementations: {
    aem: {
      model: [],
      files: [{ name: 'apps/site/components/hero-banner/hero.html', lang: 'htl', code: '<section>${properties.headline}</section>' }],
    },
    eds: { files: [] },
    cf: { files: [] },
    opti: { files: [] },
  },
};
const completed = ensureCompleteAemFiles(thinAiResult, { cms: 'aem', name: componentName });
const completedFiles = completed.implementations.aem.files;
const completedByName = new Map(completedFiles.map((file) => [file.name, file]));
for (const name of mustHave) assert.ok(completedByName.has(name), `Thin AI output did not restore required resource ${name}`);
assert.ok(completedByName.get(`apps/site/components/${componentKey}/${componentKey}.html`).code.includes('${properties.headline}'), 'The supplied AI-authored markup must be preserved rather than replaced by an unrelated generic template.');
assert.ok(completedByName.has(`apps/site/components/${componentKey}/component.json`));
assert.ok(!completedFiles.some((file) => file.name.endsWith('/hero.html')), 'Stale AI HTL filename should not replace the component-name-matched template');
const withJs = ensureCompleteAemFiles({
  ...thinAiResult,
  implementations: {
    ...thinAiResult.implementations,
    aem: { files: [{ name: 'anything.js', lang: 'js', code: 'document.body.dataset.test = "ok";' }] },
  },
}, { cms: 'aem', name: componentName });
assert.ok(withJs.implementations.aem.files.some((file) => file.name === `apps/site/components/${componentKey}/clientlib/js/${componentKey}.js`));
assert.equal(withJs.implementations.aem.files.find((file) => file.name === `apps/site/components/${componentKey}/clientlib/js.txt`).code.trim(), `#base=js\n${componentKey}.js`);
assert.ok(withJs.implementations.aem.files.find((file) => file.name === `apps/site/components/${componentKey}/${componentKey}.html`).code.includes('clientlib.js'));


const customFields = [
  { name: 'eyebrow', label: 'Eyebrow', type: 'text', required: false, role: 'other', options: [] },
  { name: 'headline', label: 'Headline', type: 'text', required: true, role: 'title', options: [] },
  { name: 'richCopy', label: 'Rich copy', type: 'richtext', required: false, role: 'body', options: [] },
  { name: 'linkText', label: 'Button label', type: 'text', required: false, role: 'ctaLabel', options: [] },
  { name: 'linkURL', label: 'Button link', type: 'path', required: false, role: 'ctaLink', rootPath: '/content', options: [] },
  { name: 'displayMode', label: 'Display mode', type: 'select', required: true, role: 'alignment', options: [{ label: 'Stacked', value: 'stacked' }, { label: 'Overlay', value: 'overlay' }] }
];
const customFiles = aemFiles('Editorial Card', customFields);
const customByName = new Map(customFiles.map((file) => [file.name, file]));
const customKey = 'editorialCard';
const customDialog = customByName.get(`apps/site/components/${customKey}/_cq_dialog/.content.xml`).code;
const customSourceHtl = customByName.get(`apps/site/components/${customKey}/${customKey}.html`).code;
const customSlingModel = customByName.get('core/models/EditorialCardModel.java').code;
const customManifest = JSON.parse(customByName.get(`apps/site/components/${customKey}/component.json`).code);
assert.match(customDialog, /fieldLabel="Headline" name="\.\/headline" required="\{Boolean\}true"/);
assert.match(customDialog, /fieldLabel="Rich copy" name="\.\/richCopy"/);
assert.match(customDialog, /text="Stacked" value="stacked"/);
assert.match(customSlingModel, /@ValueMapValue\(name = "headline"\)/);
assert.match(customSlingModel, /getHeadline\(\)/);
assert.ok(customSourceHtl.includes('model.headline') && customSourceHtl.includes('model.richCopy'), 'Custom HTL must bind to generated Sling Model fields');
assert.ok(customManifest.fields.some((field) => field.name === 'headline' && field.required === true));
assert.ok(customManifest.fields.some((field) => field.name === 'displayMode' && field.options.length === 2));
assert.ok(!/localhost|4502|targetId|connectionId|password|apiKey/i.test(JSON.stringify(customManifest)), 'Generated component.json must be namespace-only and contain no connection secrets');
const customDirectHtl = htlOnly(customSourceHtl, 'customer-app.components.editorialCard', customFields);
assert.ok(!customDirectHtl.includes('data-sly-use.model') && !customDirectHtl.includes('${model.'));
for (const property of ['properties.headline', 'properties.richCopy', 'properties.linkText', 'properties.linkURL', 'properties.displayMode']) {
  assert.ok(customDirectHtl.includes(property), `Direct-JCR conversion dropped custom field binding ${property}`);
}
assert.ok(customDirectHtl.includes("categories='customer-app.components.editorialCard'"), 'Direct-JCR HTL should use the selected CMS namespace category');
const customClientlib = customByName.get(`apps/site/components/${customKey}/clientlib/.content.xml`).code;
assert.ok(customClientlib.includes('categories="[site.components.editorialCard]"'), 'Codebase clientlib should use a generic namespace category');

assert.equal(normalizeComponentRoot('/apps/any-client/components', componentName), '/apps/any-client/components/heroBanner');
assert.equal(normalizeComponentRoot('/apps/any-client/components/content', componentName), '/apps/any-client/components/content/heroBanner');
assert.equal(normalizeComponentRoot('/apps/another-project/components/content', componentName), '/apps/another-project/components/content/heroBanner');
assert.equal(componentResourceSuffix(`apps/site/components/${componentKey}/clientlib/${componentKey}.css`), `clientlib/${componentKey}.css`);
assert.equal(normalizeClientlibResourceSuffix('clientlib/heroBanner.css'), 'clientlib/css/heroBanner.css');
assert.equal(normalizeClientlibResourceSuffix('clientlib/heroBanner.js'), 'clientlib/js/heroBanner.js');
assert.equal(normalizeClientlibResourceSuffix('clientlib/css/heroBanner.css'), 'clientlib/css/heroBanner.css');
assert.equal(normalizeClientlibResourceSuffix('clientlib/js/heroBanner.js'), 'clientlib/js/heroBanner.js');
const categoryAlignedHtl = normalizeClientlibCategoryReferences('<sly data-sly-call="${clientlib.css @ categories=\'site.components.heroBanner\'}"></sly><sly data-sly-call="${clientlib.js @ categories=\'site.components.heroBanner\'}"></sly>', 'my-app.components.heroBanner');
assert.ok(categoryAlignedHtl.includes("clientlib.css @ categories='my-app.components.heroBanner'"));
assert.ok(categoryAlignedHtl.includes("clientlib.js @ categories='my-app.components.heroBanner'"));
assert.ok(!categoryAlignedHtl.includes("categories='site.components.heroBanner'"));

// Composite-field contract matching real AEM nested multifield structures.
const navigationFields = normalizeComponentFields([
  {
    name: 'tabs', label: 'Navigation tabs', type: 'multifield', composite: true, minItems: 1, maxItems: 8,
    children: [
      { name: 'tabTitle', label: 'Tab title', type: 'text', required: true, role: 'title' },
      { name: 'links', label: 'Links', type: 'multifield', composite: true, children: [
        { name: 'linkLabel', label: 'Link label', type: 'text', required: true, role: 'title' },
        { name: 'linkURL', label: 'Link URL', type: 'path', rootPath: '/content', role: 'ctaLink' },
        { name: 'subLinks', label: 'Nested links', type: 'multifield', composite: true, children: [
          { name: 'subLabel', label: 'Sub-link label', type: 'text', role: 'title' },
          { name: 'subURL', label: 'Sub-link URL', type: 'path', rootPath: '/content', role: 'ctaLink' }
        ] }
      ] }
    ]
  }
]);
assert.equal(navigationFields[0].composite, true);
assert.equal(navigationFields[0].children[1].composite, true);
assert.equal(navigationFields[0].children[1].children[2].composite, true);

const nestedFiles = aemFiles('Dynamic Navigation', navigationFields, 'Create a dynamic mega navigation with tabs, links, and nested sub-links');
const nestedByName = new Map(nestedFiles.map((file) => [file.name, file]));
const nestedDialog = nestedByName.get('apps/site/components/dynamicNavigation/_cq_dialog/.content.xml').code;
assert.equal((nestedDialog.match(/composite="{Boolean}true"/g) || []).length, 3, 'Every level of composite multifield must be enabled.');
assert.ok(nestedDialog.includes('name="./tabs"'), 'Top-level composite field must store under ./tabs.');
assert.ok(nestedDialog.includes('name="tabTitle"'), 'Child properties inside a composite item must be relative, without ./');
assert.ok(nestedDialog.includes('name="links"'), 'Nested links must be a composite child resource.');
assert.ok(nestedDialog.includes('name="subLinks"'), 'Third-level child must preserve its nested multifield node name.');
assert.ok(nestedDialog.includes('name="subURL"'), 'Nested pathfield must keep its exact child property name.');
const nestedJava = nestedByName.get('core/models/DynamicNavigationModel.java').code;
assert.ok(nestedJava.includes('@ChildResource(name = "tabs")') && nestedJava.includes('List<Resource> tabs'),
  'Sling Model must represent composite items as child resources, not String[].');
const nestedManifest = JSON.parse(nestedByName.get('apps/site/components/dynamicNavigation/component.json').code);
assert.equal(nestedManifest.fields[0].children[1].children[2].name, 'subLinks', 'Manifest must preserve the complete recursive field schema.');
const nestedSourceHtl = nestedByName.get('apps/site/components/dynamicNavigation/dynamicNavigation.html').code;
assert.ok(nestedSourceHtl.includes('resource.children') && nestedSourceHtl.includes('.valueMap.subLabel'),
  'Nested source HTL must iterate child resources and read child value maps.');
const nestedDirectHtl = htlOnly(nestedSourceHtl, 'customer-app.components.dynamicNavigation', navigationFields);
assert.ok(!nestedDirectHtl.includes('data-sly-use.model') && !nestedDirectHtl.includes('${model.'),
  'Direct-JCR nested markup must not depend on an uncompiled Sling Model.');
assert.ok(nestedDirectHtl.includes('resource.children') && nestedDirectHtl.includes('.valueMap.subURL'),
  'Direct-JCR output must retain the nested resource hierarchy.');

const carouselSchema = normalizeComponentFields([
  { name: 'accessibilityLabel', label: 'Carousel label', type: 'text', role: 'other', defaultValue: 'Image carousel' },
  { name: 'autoplay', label: 'Automatically rotate slides', type: 'checkbox', role: 'other', defaultValue: 'false' },
  { name: 'slides', label: 'Slides', type: 'multifield', composite: true, minItems: 1, maxItems: 10, children: [
    { name: 'image', label: 'Image asset', type: 'path', role: 'image', rootPath: '/content/dam', required: true },
    { name: 'altText', label: 'Alternative text', type: 'text', role: 'imageAlt' },
    { name: 'caption', label: 'Caption', type: 'textarea', role: 'body' },
    { name: 'linkURL', label: 'Slide link', type: 'path', role: 'ctaLink', rootPath: '/content' },
    { name: 'linkText', label: 'Link label', type: 'text', role: 'ctaLabel' }
  ] }
]);
const conciseCarouselDescription = 'Create a multifield image carousel with proper JS and CSS handling, HTL and Sling Model.';
const conciseCarouselAiFiles = [
  { name: 'ImageCarousel.html', lang: 'htl', code: '<section class="cmp-image-carousel" data-carousel role="region" aria-roledescription="carousel"><div data-sly-list.slide="${model.slides}"><img src="${slide.valueMap.image}" alt="${slide.valueMap.altText}"/><p>${slide.valueMap.caption}</p></div><button type="button" data-carousel-prev aria-label="Previous slide">Previous</button><button type="button" data-carousel-next aria-label="Next slide">Next</button><div data-carousel-pagination></div><span aria-live="polite" data-carousel-status></span></section>' },
  { name: 'carousel-styles.css', lang: 'css', code: '.cmp-image-carousel{display:grid;gap:1rem;max-width:100%;}.cmp-image-carousel img{display:block;max-width:100%;height:auto;}' },
  { name: 'carousel-controls.js', lang: 'js', code: '(function(){document.querySelectorAll("[data-carousel]").forEach(function(root){var slides=Array.from(root.querySelectorAll("[data-sly-list]"));root.querySelector("[data-carousel-next]")?.addEventListener("click",function(){root.dataset.interacted="true";});});})();' },
  { name: 'ImageCarouselModel.java', lang: 'java', code: 'package example; public class ImageCarouselModel { /* generated Sling Model source */ }' }
];

const completedCarousel = ensureCompleteAemFiles({
  component: { name: 'Image Carousel', cms: 'aem', summary: 'Image carousel' },
  design: { a11y: [] },
  implementations: {
    aem: {
      fields: carouselSchema,
      files: conciseCarouselAiFiles,
      directJcrHtl: '<section class="cmp-image-carousel" data-carousel><sly data-sly-list.slideGroup="${resource.children}"><sly data-sly-test="${slideGroup.name == \'slides\'}"><div data-sly-list.slide="${slideGroup.children}"><img src="${slide.valueMap.image}" alt="${slide.valueMap.altText}"/><p>${slide.valueMap.caption}</p></div></sly></sly><button data-carousel-prev>Previous</button><button data-carousel-next>Next</button><div data-carousel-pagination></div><span data-carousel-status aria-live="polite"></span></section>'
    }
  }
}, { name: 'Image Carousel', cms: 'aem', description: conciseCarouselDescription });
const carouselByName = new Map(completedCarousel.implementations.aem.files.map((file) => [file.name, file]));
const carouselDialog = carouselByName.get('apps/site/components/imageCarousel/_cq_dialog/.content.xml').code;
const carouselHtml = carouselByName.get('apps/site/components/imageCarousel/imageCarousel.html').code;
const carouselJs = carouselByName.get('apps/site/components/imageCarousel/clientlib/js/imageCarousel.js').code;
const carouselCss = carouselByName.get('apps/site/components/imageCarousel/clientlib/css/imageCarousel.css').code;
const carouselDirectHtl = htlOnly(completedCarousel.implementations.aem.directJcrHtl, 'site.components.imageCarousel', carouselSchema, true);
assert.ok(carouselDirectHtl.includes('resource.children') && carouselDirectHtl.includes('slide.valueMap.image'));
assert.ok(!carouselDirectHtl.includes('data-sly-use.model') && !carouselDirectHtl.includes('${model.'));
assert.ok(carouselDirectHtl.includes('clientlib.css') && carouselDirectHtl.includes('clientlib.js'));
assert.doesNotThrow(() => new Script(carouselJs, { filename: 'imageCarousel.js' }), 'AI-authored client-side code must parse before it is offered for installation.');
assert.ok(carouselDialog.includes('composite="{Boolean}true"') && carouselDialog.includes('name="./slides"'));
assert.ok(carouselDialog.includes('name="image"') && carouselDialog.includes('rootPath="/content/dam"'));
assert.ok(carouselDialog.includes('name="altText"') && carouselDialog.includes('name="caption"'));
assert.ok(carouselHtml.includes('data-carousel') && carouselHtml.includes('model.slides') && carouselHtml.includes('slide.valueMap.image'));
assert.ok(carouselHtml.includes('clientlib.css') && carouselHtml.includes('clientlib.js'));
assert.ok(carouselHtml.includes('data-carousel-prev') && carouselHtml.includes('data-carousel-next') &&
  carouselHtml.includes('data-carousel-pagination') && carouselHtml.includes('aria-live="polite"'));
assert.ok(carouselCss.includes('.cmp-image-carousel') && carouselCss.includes('max-width:100%'));
assert.ok(carouselByName.has('apps/site/components/imageCarousel/clientlib/js.txt'));
assert.ok(carouselByName.get('apps/site/components/imageCarousel/clientlib/js.txt').code.includes('imageCarousel.js'));
assert.ok(carouselByName.get('apps/site/components/imageCarousel/clientlib/css.txt').code.includes('imageCarousel.css'));
assert.ok(carouselByName.get('core/models/ImageCarouselModel.java').code.includes('class ImageCarouselModel'),
  'AI-authored Sling Model source must be retained when it matches the generated model class.');
assert.deepEqual(
  JSON.parse(carouselByName.get('apps/site/components/imageCarousel/component.json').code).fields[2].children.map((field) => field.name),
  ['image', 'altText', 'caption', 'linkURL', 'linkText'],
  'The recursive source manifest must preserve the model-authored field schema.'
);
assert.ok(!carouselByName.has('apps/site/components/imageCarousel/clientlib/js/imageCarousel.js') ||
  carouselByName.get('apps/site/components/imageCarousel/clientlib/js/imageCarousel.js').code.includes('data-carousel-next'));
assert.ok(byName.get('apps/site/components/heroBanner/.content.xml').code.includes('xmlns:cq="http://www.day.com/jcr/cq/1.0"'),
  'Component metadata must declare the cq namespace used by cq:Component.');

const proxyFiles = aemFiles(
  'Image Carousel Proxy',
  [],
  'Create a proxy component that inherits the AEM Core Components Carousel without changing its behavior',
  { proxyComponent: true, resourceSuperType: '/core/wcm/components/carousel/v1/carousel' }
);
const proxyByName = new Map(proxyFiles.map((file) => [file.name, file]));
assert.equal(proxyFiles.length, 2, 'A pure proxy should not generate competing HTL, dialog, Java or clientlib resources.');
assert.ok(proxyByName.get('apps/site/components/imageCarouselProxy/.content.xml').code.includes('sling:resourceSuperType="core/wcm/components/carousel/v1/carousel"'));
assert.ok(proxyByName.get('apps/site/components/imageCarouselProxy/.content.xml').code.includes('xmlns:sling="http://sling.apache.org/jcr/sling/1.0"'));
const proxyManifest = JSON.parse(proxyByName.get('apps/site/components/imageCarouselProxy/component.json').code);
assert.equal(proxyManifest.component.proxyComponent, true);
assert.equal(proxyManifest.component.resourceSuperType, 'core/wcm/components/carousel/v1/carousel');
assert.deepEqual(proxyManifest.fields, []);
const proxyPlan = convertSourceProjectPlanToInstancePlan({
  title: 'Image Carousel Proxy',
  fileChanges: [{
    path: 'apps/site/components/image-carousel-proxy/.content.xml',
    action: 'create',
    content: '<?xml version="1.0" encoding="UTF-8"?><jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0" jcr:primaryType="cq:Component" sling:resourceSuperType="core/wcm/components/carousel/v1/carousel" componentGroup="Content"/>'
  }]
});
const proxyNodeOp = proxyPlan.plan.repositoryOperations.find((operation) => operation.path === '/apps/site/components/image-carousel-proxy');
assert.equal(proxyNodeOp?.primaryType, 'cq:Component');
assert.equal(proxyNodeOp?.properties?.['sling:resourceSuperType'], 'core/wcm/components/carousel/v1/carousel', 'Instance-only path conversion must retain sling:resourceSuperType.');
assert.throws(() => aemFiles('Invalid Proxy', [], 'Proxy component', { proxyComponent: true, resourceSuperType: '../../content/dam' }), /safe, exact Sling resourceSuperType/);

const proxyResult = ensureCompleteAemFiles({
  component: { name: 'Image Carousel Proxy', cms: 'aem', summary: 'A proxy for the Core Carousel' },
  design: { a11y: [] },
  implementations: { aem: { fields: [], proxyComponent: true, resourceSuperType: 'core/wcm/components/carousel/v1/carousel', files: [] } }
}, { name: 'Image Carousel Proxy', cms: 'aem', description: 'A proxy component for the OOTB Core Component Carousel' });
assert.deepEqual(proxyResult.implementations.aem.files.map((file) => file.name), [
  'apps/site/components/imageCarouselProxy/.content.xml',
  'apps/site/components/imageCarouselProxy/component.json'
], 'Completion must preserve a pure proxy instead of adding custom component files.');

const customAiFiles = ensureCompleteAemFiles({
  component: { name: 'Editorial Card', cms: 'aem', summary: 'Expanding editorial card' },
  design: { a11y: [] },
  implementations: {
    aem: {
      fields: [{ name: 'headline', label: 'Headline', type: 'text', required: true, role: 'title' }],
      files: [
        { name: 'apps/site/components/editorialCard/editorialCard.html', lang: 'htl', code: '<section class="ai-editorial-card"><p>${model.headline}</p></section>' },
        { name: 'apps/site/components/editorialCard/clientlib/css/editorialCard.css', lang: 'css', code: '.ai-editorial-card{color:rebeccapurple}' },
        { name: 'apps/site/components/editorialCard/clientlib/js/editorialCard.js', lang: 'js', code: 'document.querySelectorAll(".ai-editorial-card").forEach(function(root){root.dataset.ready="true";});' }
      ]
    }
  }
}, { name: 'Editorial Card', cms: 'aem', description: 'An editorial card with optional client-side interaction' });
const customAiByName = new Map(customAiFiles.implementations.aem.files.map((file) => [file.name, file]));
assert.ok(customAiByName.get('apps/site/components/editorialCard/editorialCard.html').code.includes('ai-editorial-card'),
  'Canonical completion must not discard the AI-generated component markup.');
assert.ok(customAiByName.get('apps/site/components/editorialCard/clientlib/css/editorialCard.css').code.includes('rebeccapurple'),
  'Canonical completion must not discard the AI-generated styling.');
assert.ok(customAiByName.get('apps/site/components/editorialCard/clientlib/js/editorialCard.js').code.includes('dataset.ready'),
  'When the AI returns required interaction JS, keep it as a clientlib asset.');
assert.ok(customAiByName.get('apps/site/components/editorialCard/clientlib/js.txt').code.includes('editorialCard.js'),
  'When interaction JS is emitted, include the matching JS index.');
assert.ok(customAiByName.get('apps/site/components/editorialCard/editorialCard.html').code.includes('clientlib.js'));

const mismatchedClientlibFiles = ensureCompleteAemFiles({
  component: { name: 'Hero Banner', cms: 'aem' },
  implementations: { aem: { fields: baselineFields, files: [
    { name: 'heroBanner.html', lang: 'htl', code: '<sly data-sly-use.clientlib="/libs/granite/sitemode/components/clientlibs.html" data-sly-call="${clientlib.all @ categories=\'wknd.components.herobanner\'}"></sly><sly data-sly-call="${clientlib.css @ categories=\'weretail.components.heroBanner\'}"></sly><section>${model.title}</section><sly data-sly-call="${clientlib.js @ categories=\'weretail.components.heroBanner\'}"></sly>' },
    { name: 'heroBanner.css', lang: 'css', code: '.cmp-hero-banner{}' },
    { name: 'heroBanner.js', lang: 'js', code: 'document.querySelectorAll(".cmp-hero-banner");' }
  ] } }
}, { name: 'Hero Banner', cms: 'aem' });
const normalizedHeroHtl = mismatchedClientlibFiles.implementations.aem.files.find((file) => file.name === 'apps/site/components/heroBanner/heroBanner.html').code;
assert.ok(normalizedHeroHtl.includes('/libs/granite/sightly/templates/clientlib.html'), 'Generated HTL must use the official clientlib template path.');
assert.ok(!normalizedHeroHtl.includes('wknd.components') && !normalizedHeroHtl.includes('weretail.components'), 'Generated HTL must not retain unrelated clientlib categories.');
assert.ok(!normalizedHeroHtl.includes('clientlib.all') && normalizedHeroHtl.includes("clientlib.css @ categories='site.components.heroBanner'") && normalizedHeroHtl.includes("clientlib.js @ categories='site.components.heroBanner'"), 'Generated HTL must reference one canonical CSS/JS clientlib category.');

const requestedGroupFiles = aemFiles('Group-Aware Card', baselineFields, '', { componentGroup: 'Marketing - Featured' });
const requestedGroupMetadata = requestedGroupFiles.find((file) => file.name === 'apps/site/components/groupAwareCard/.content.xml').code;
const requestedGroupManifest = JSON.parse(requestedGroupFiles.find((file) => file.name === 'apps/site/components/groupAwareCard/component.json').code);
assert.ok(requestedGroupMetadata.includes('componentGroup="Marketing - Featured"'), 'Requested AEM component group must propagate into component metadata.');
assert.equal(requestedGroupManifest.component.group, 'Marketing - Featured', 'Manifest must retain the requested component group.');
const groupAwareCompleted = ensureCompleteAemFiles({
  component: { name: 'Group-Aware Card', cms: 'aem' },
  implementations: { aem: { componentGroup: 'Marketing - Featured', fields: baselineFields, files: [] } }
}, { cms: 'aem', name: 'Group-Aware Card' });
assert.ok(groupAwareCompleted.implementations.aem.files.find((file) => file.name === 'apps/site/components/groupAwareCard/.content.xml').code.includes('componentGroup="Marketing - Featured"'),
  'Completion must preserve the requested component group instead of falling back to Content.');

console.log('All live component, composite/nested multifield, image-carousel, source merge, and direct-JCR conversion tests passed.');
