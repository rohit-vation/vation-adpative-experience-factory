/**
 * Tests the AI path end to end against a MOCK Gemini (no key, no network):
 * browser request -> server -> Gemini call -> parse -> validate -> response.
 *
 *   npm run test:ai
 *
 * This proves our code. It does not prove Google's real API accepts the request,
 * so run the app once with a real key as the final check.
 */

import { startMock } from './test-support/gemini-mock.js';
import { ORDER } from '../src/workflows/index.js';
import { defaultInput } from './sample-inputs.js';
import { validate } from '../src/ai/validate.js';
import { upstreamError } from '../server/ai/http.js';
import { CREATE_COMPONENT_GENERATION_RULES, normalizeComponentFields, normalizeRuleSuggestions, normalizeResourceSuperType, extractRequestedComponentGroup } from '../src/ai/system-prompt.js';
import { PROMPT_BUILDERS } from '../src/ai/prompts.js';
import { repairAemGenerationResponse } from '../src/services/aem-generation-repair.js';

const mock = await startMock(4011);
// Isolate this mock-provider suite from the developer's .env toggle. These calls use
// the local mock only and never reach a paid provider, regardless of the app's saved mode.
process.env.AI_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_BASE_URL = 'http://localhost:4011/v1beta';
process.env.RATE_LIMIT_MAX = '1000';

const { createServer, parseModelJson, mergeAemRetryData } = await import('../server/server.js');
const app = createServer();
await new Promise((r) => app.listen(4012, r));
const URL_BASE = 'http://localhost:4012';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : '  ' + detail}`);
  if (!ok) failures++;
};

const post = async (workflow, input) => {
  const r = await fetch(`${URL_BASE}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow, input }) });
  return { status: r.status, body: await r.json() };
};
const reset = (mode) => { mock.control.mode = mode; mock.control.calls = 0; mock.control.styles.length = 0; mock.control.prompts.length = 0; };

// Generation rules are executable contracts, not loose prompt notes.
{
  const fields = normalizeComponentFields([
    { name: 'Headline', label: 'Headline', type: 'text', required: true, role: 'title' },
    { name: 'background-image', label: 'Background image', type: 'path' },
    { name: 'alignment', label: 'Text alignment', type: 'select', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] }
  ]);
  check('component field rules normalize properties/types and infer roles', fields[0].name === 'headline' && fields[0].required && fields[1].name === 'backgroundImage' && fields[1].rootPath === '/content/dam' && fields[1].role === 'image' && fields[2].options.length === 2);
  let duplicatesRejected = false;
  try { normalizeComponentFields([{ name: 'title', type: 'text' }, { name: 'title', type: 'text' }]); } catch (error) { duplicatesRejected = /duplicate/i.test(error.message); }
  check('component field rules reject duplicate CMS properties', duplicatesRejected);
  let invalidSelectRejected = false;
  try { normalizeComponentFields([{ name: 'theme', type: 'select' }]); } catch (error) { invalidSelectRejected = /must define at least one option/i.test(error.message); }
  check('component field rules reject dropdowns without actual choices', invalidSelectRejected);
  const prompt = PROMPT_BUILDERS.create(defaultInput('create'));
  check('component generation prompt carries shared Sling Model/HTL/manifest rules', prompt.includes('fields') && prompt.includes('Sling Model') && prompt.includes('component.json') && prompt.includes(CREATE_COMPONENT_GENERATION_RULES) && /customer\/project namespace/i.test(prompt));
  check('canonical rules support arbitrary components, short briefs and a reviewed rule-improvement loop', /compact feature brief/i.test(prompt) && /never an allowlist/i.test(prompt) && /composite multifield/i.test(prompt) && /proxy component/i.test(prompt) && /ruleSuggestions/i.test(prompt) && /never auto-append/i.test(CREATE_COMPONENT_GENERATION_RULES));
  check('focused Markdown AEM contract is injected into the generation prompt', /This file is loaded into every Create-component AEM generation prompt/i.test(prompt));
  check('cross-CMS Markdown model contract is injected into the generation prompt', /Cross-CMS content-model contract/i.test(prompt) && /all four CMS platforms/i.test(prompt) && /model must not be empty/i.test(prompt));
  const proposals = normalizeRuleSuggestions([{ title:'Nested dialog rule', appliesTo:'composite multifield', rule:'Define nested children explicitly.', validation:'Add a JCR dialog fixture.' }, { title:'Ignore', rule:'Missing fields' }]);
  check('rule improvement proposals are filtered into reviewable safe suggestions', proposals.length === 1 && proposals[0].validation === 'Add a JCR dialog fixture.');
  check('Core Component proxy supertype accepts a valid resource type', normalizeResourceSuperType('/core/wcm/components/carousel/v1/carousel') === 'core/wcm/components/carousel/v1/carousel');
  check('Core Component proxy supertype rejects traversal or missing resource types', normalizeResourceSuperType('../../content/dam') === '' && normalizeResourceSuperType('') === '');
  const nestedContract = normalizeComponentFields([{ name:'slides', type:'multifield', composite:true, children:[{name:'image',type:'path',role:'image',rootPath:'/content/dam'},{name:'caption',type:'textarea'},{name:'actions',type:'multifield',composite:true,children:[{name:'label',type:'text'},{name:'href',type:'path',rootPath:'/content'}]}] }]);
  check('recursive schema preserves composite child fields across multiple levels', nestedContract[0].children[0].rootPath === '/content/dam' && nestedContract[0].children[2].children[1].name === 'href');
  check('canonical rulebook keeps Adobe multifield, carousel, proxy and clientlib references in one file', /experienceleague\.adobe\.com.*multifield/i.test(CREATE_COMPONENT_GENERATION_RULES) && /Core Components Carousel/i.test(CREATE_COMPONENT_GENERATION_RULES) && /client libraries/i.test(CREATE_COMPONENT_GENERATION_RULES));

  const proxyInput = { ...defaultInput('create'), name: 'Carousel Proxy', cms: 'aem', description: 'Create a proxy for the AEM Core Component Carousel without overriding the inherited markup.' };
  const proxyData = {
    component: { name: 'Carousel Proxy', cms: 'aem', summary: 'Proxy component' },
    design: { a11y: [] },
    implementations: {
      aem: { model: [], fields: [], proxyComponent: true, resourceSuperType: '/core/wcm/components/carousel/v1/carousel', files: [] },
      eds: { model: [], files: [{ name: 'blocks/carousel.js', lang: 'js', code: 'export default function decorate() {}' }] },
      cf: { model: [], files: [{ name: 'content-types/carousel.json', lang: 'json', code: '{}' }] },
      opti: { model: [], files: [{ name: 'Views/Carousel.cshtml', lang: 'cshtml', code: '<section></section>' }] }
    }
  };
  const validProxy = validate('create', proxyData, proxyInput);
  check('Create validator preserves the pure proxy intent and normalizes its exact supertype', validProxy.implementations.aem.proxyComponent === true && validProxy.implementations.aem.resourceSuperType === 'core/wcm/components/carousel/v1/carousel' && validProxy.implementations.aem.fields.length === 0);
  const groupedProxy = validate('create', { ...proxyData, implementations: { ...proxyData.implementations, aem: { ...proxyData.implementations.aem, componentGroup: 'Marketing - Featured' } } }, proxyInput);
  check('Create validator retains an explicitly requested AEM component group', groupedProxy.implementations.aem.componentGroup === 'Marketing - Featured');
  const groupFromBriefInput = { ...proxyInput, description: proxyInput.description + ' Component group: Marketing - Featured.' };
  const groupFromBrief = validate('create', proxyData, groupFromBriefInput);
  check('Explicit component group in the dashboard brief overrides an omitted or default AI group', groupFromBrief.implementations.aem.componentGroup === 'Marketing - Featured' && extractRequestedComponentGroup(groupFromBriefInput.description) === 'Marketing - Featured');
  let proxyWithoutSupertypeRejected = false;
  try { validate('create', { ...proxyData, implementations: { ...proxyData.implementations, aem: { ...proxyData.implementations.aem, resourceSuperType: '../../content/dam' } } }, proxyInput); }
  catch (error) { proxyWithoutSupertypeRejected = /resourceSuperType/i.test(error.message); }
  check('Create validator rejects a proxy without a safe verified resource-type candidate', proxyWithoutSupertypeRejected);

  const shortFeatureInput = {
    ...defaultInput('create'),
    name: 'Image Carousel',
    cms: 'aem',
    description: 'Create a multifield image carousel with proper JS and CSS handling, HTL and Sling Model.'
  };
  const shortFeatureData = {
    component: { name: 'Image Carousel', cms: 'aem', summary: 'Image carousel' },
    design: { a11y: ['Use keyboard accessible controls and meaningful image alt text.'] },
    implementations: {
      aem: {
        model: [{ field: 'slides', type: 'List<Resource>', note: 'Composite slide child resources' }],
        fields: [{
          name: 'slides', label: 'Slides', type: 'multifield', composite: true,
          children: [
            { name: 'image', label: 'Image', type: 'path', role: 'image', rootPath: '/content/dam', required: true },
            { name: 'caption', label: 'Caption', type: 'text', role: 'body' }
          ]
        }],
        files: [
          { name: 'ImageCarousel.html', lang: 'htl', code: '<section data-carousel><div data-sly-list.slide="${model.slides}"><img src="${slide.valueMap.image}"/><p>${slide.valueMap.caption}</p></div><button data-carousel-next>Next</button></section>' },
          { name: 'image-carousel.css', lang: 'css', code: '.cmp-image-carousel{display:grid;gap:1rem;}' },
          { name: 'carousel.js', lang: 'js', code: 'document.querySelectorAll("[data-carousel]").forEach(function(root){root.querySelector("[data-carousel-next]")?.addEventListener("click",function(){root.dataset.interacted="true";});});' },
          { name: 'ImageCarouselModel.java', lang: 'java', code: 'package example; public class ImageCarouselModel { /* generated Sling Model source */ }' }
        ],
        directJcrHtl: '<section data-carousel><sly data-sly-list.slideGroup="${resource.children}"><sly data-sly-test="${slideGroup.name == \'slides\'}"><div data-sly-list.slide="${slideGroup.children}"><img src="${slide.valueMap.image}"/><p>${slide.valueMap.caption}</p></div></sly></sly><button data-carousel-next>Next</button></section>'
      },
      eds: { ...proxyData.implementations.eds, model: [
        { field: 'slides', type: 'Array of objects', note: 'Slide collection' },
        { field: 'image', type: 'Image', note: 'Slide image' },
        { field: 'caption', type: 'Text', note: 'Slide caption' }
      ] },
      cf: { ...proxyData.implementations.cf, model: [
        { field: 'slides', type: 'Array', note: 'Slide collection' },
        { field: 'image', type: 'Asset link', note: 'Slide image' },
        { field: 'caption', type: 'Symbol', note: 'Slide caption' }
      ] },
      opti: { ...proxyData.implementations.opti, model: [
        { field: 'Slides', type: 'ContentReference list', note: 'Slide collection' },
        { field: 'Image', type: 'ContentReference', note: 'Slide image' },
        { field: 'Caption', type: 'string', note: 'Slide caption' }
      ] }
    }
  };
  shortFeatureData.implementations.aem.files[0].code = shortFeatureData.implementations.aem.files[0].code.replaceAll('__HTL__', '$');
  const acceptedShortFeature = validate('create', shortFeatureData, shortFeatureInput);
  const incompleteMultifieldResponse = structuredClone(shortFeatureData);
  incompleteMultifieldResponse.implementations.aem.componentGroup = 'Content';
  incompleteMultifieldResponse.implementations.aem.directJcrHtl = '<section>${model.slides}</section>';
  incompleteMultifieldResponse.implementations.aem.files[0].code = '<section><div data-sly-list.slide="${model.slides}">${slide.valueMap.caption}</div></section>';
  incompleteMultifieldResponse.implementations.eds.model = [];
  incompleteMultifieldResponse.implementations.cf.model = [];
  incompleteMultifieldResponse.implementations.opti.model = [];
  const repairInput = { ...shortFeatureInput, description: shortFeatureInput.description + ' Component group: Marketing - Featured.' };
  const repairedMultifield = repairAemGenerationResponse(incompleteMultifieldResponse, repairInput);
  const repairedDirectJcr = repairedMultifield.implementations.aem.directJcrHtl;
  const repairedSourceHtl = repairedMultifield.implementations.aem.files[0].code;
  check('Deterministic AEM repair rebuilds direct-JCR multifield traversal using exact schema names',
    repairedDirectJcr.includes('resource.children') && repairedDirectJcr.includes(".name == 'slides'") &&
    repairedDirectJcr.includes('valueMap.image') && repairedDirectJcr.includes('valueMap.caption') &&
    !repairedDirectJcr.includes('model.'));
  check('Deterministic AEM repair inserts the canonical Sling Model class into source HTL',
    repairedSourceHtl.includes('data-sly-use.model="com.example.site.core.models.ImageCarouselModel"'));
  check('Deterministic AEM repair restores all four CMS model mappings and the explicitly requested group',
    repairedMultifield.implementations.aem.componentGroup === 'Marketing - Featured' &&
    ['aem', 'eds', 'cf', 'opti'].every((cms) => repairedMultifield.implementations[cms].model.length === 3));
  check('Repaired multifield response passes strict AEM validation',
    Boolean(validate('create', repairedMultifield, repairInput).implementations.aem.directJcrHtl));
  const selectedAemOnlyData = {
    ...shortFeatureData,
    implementations: {
      aem: shortFeatureData.implementations.aem,
      eds: { model: shortFeatureData.implementations.eds.model, files: [] },
      cf: { model: shortFeatureData.implementations.cf.model, files: [] },
      opti: { model: shortFeatureData.implementations.opti.model, files: [] }
    }
  };
  const acceptedSelectedAemOnly = validate('create', selectedAemOnlyData, shortFeatureInput);
  check(
    'AEM generation keeps source files selected-only while retaining all four CMS content models',
    acceptedSelectedAemOnly.implementations.aem.files.length === shortFeatureData.implementations.aem.files.length &&
      acceptedSelectedAemOnly.implementations.eds.files.length === 0 &&
      acceptedSelectedAemOnly.implementations.cf.files.length === 0 &&
      acceptedSelectedAemOnly.implementations.opti.files.length === 0 &&
      acceptedSelectedAemOnly.implementations.eds.model.length === 3 &&
      acceptedSelectedAemOnly.implementations.cf.model.length === 3 &&
      acceptedSelectedAemOnly.implementations.opti.model.length === 3
  );
  const firstAttemptAem = {
    ...shortFeatureData.implementations.aem,
    files: shortFeatureData.implementations.aem.files.filter((file) => file.lang !== 'js')
  };
  const secondAttemptAem = {
    ...shortFeatureData.implementations.aem,
    files: shortFeatureData.implementations.aem.files.filter((file) => file.lang !== 'java')
  };
  const mergedRetry = mergeAemRetryData(
    { implementations: { aem: firstAttemptAem } },
    { implementations: { aem: secondAttemptAem } }
  );
  check(
    'AEM repair merges missing Java or JavaScript source across attempts when the schema matches',
    mergedRetry.implementations.aem.files.some((file) => file.lang === 'js') &&
      mergedRetry.implementations.aem.files.some((file) => file.lang === 'java') &&
      mergedRetry.implementations.aem.files.some((file) => file.lang === 'htl') &&
      mergedRetry.implementations.aem.files.some((file) => file.lang === 'css')
  );

  check(
    'a two-line-style brief is validated as a complete component contract without a hardcoded component template',
    acceptedShortFeature.implementations.aem.fields[0].composite === true &&
      acceptedShortFeature.implementations.aem.files.some((file) => file.lang === 'js') &&
      acceptedShortFeature.implementations.aem.files.some((file) => file.lang === 'java')
  );
  let multifieldWithoutModelRejected = false;
  try {
    validate('create', {
      ...shortFeatureData,
      implementations: {
        ...shortFeatureData.implementations,
        aem: {
          ...shortFeatureData.implementations.aem,
          files: shortFeatureData.implementations.aem.files.filter((file) => file.lang !== 'java')
        }
      }
    }, shortFeatureInput);
  } catch (error) {
    multifieldWithoutModelRejected = /Java Sling Model source was returned/i.test(error.message);
  }
  check('composite multifield generation is rejected if its Sling Model source is missing', multifieldWithoutModelRejected);
  check('composite component contract retains separate codebase and direct-JCR HTL renderings',
    acceptedShortFeature.implementations.aem.directJcrHtl.includes('resource.children') &&
    !acceptedShortFeature.implementations.aem.directJcrHtl.includes('model.') &&
    shortFeatureData.implementations.aem.files[0].code.includes('model.slides'));
  let directJcrFallbackRejected = false;
  try {
    validate('create', {
      ...shortFeatureData,
      implementations: { ...shortFeatureData.implementations, aem: { ...shortFeatureData.implementations.aem, directJcrHtl: '' } }
    }, shortFeatureInput);
  } catch (error) { directJcrFallbackRejected = /directJcrHtl/i.test(error.message); }
  check('composite component is rejected if its model-free direct-JCR rendering is missing', directJcrFallbackRejected);
  let undeclaredHtlBindingRejected = false;
  try {
    const badBindingData = structuredClone(shortFeatureData);
    badBindingData.implementations.aem.files[0].code = badBindingData.implementations.aem.files[0].code.replace('slide.valueMap.caption', 'slide.valueMap.undeclaredCaption');
    validate('create', badBindingData, shortFeatureInput);
  } catch (error) { undeclaredHtlBindingRejected = /missing from the recursive AEM fields schema/i.test(error.message); }
  check('AEM generation rejects HTL bindings that are absent from the authored field schema', undeclaredHtlBindingRejected);

  let incompleteCustomRejected = false;
  try {
    validate('create', {
      ...shortFeatureData,
      implementations: { ...shortFeatureData.implementations, aem: { ...shortFeatureData.implementations.aem, files: shortFeatureData.implementations.aem.files.filter((file) => file.lang !== 'js') } }
    }, shortFeatureInput);
  } catch (error) { incompleteCustomRejected = /JavaScript file was returned/i.test(error.message); }
  check('interactive descriptions fail validation rather than silently shipping a component without JS', incompleteCustomRejected);
}

// 1. Status route and provider-key verification
{
  const s = await (await fetch(`${URL_BASE}/api/status`)).json();
  check('status: reports AI on when a key is set', s.ai === true && s.provider === 'Gemini');
  reset('badkey');
  const modelResponse = await fetch(`${URL_BASE}/api/models?provider=gemini`);
  const modelStatus = await modelResponse.json();
  check('model picker exposes provider authentication failure instead of silently hiding it', modelResponse.status === 200 && modelStatus.live === false && modelStatus.errorStatus === 400 && /GEMINI_API_KEY/.test(modelStatus.error) && !/test-key/.test(JSON.stringify(modelStatus)));
  reset('ok');
}

// 2. Every workflow works and the user's inputs reach the prompt
for (const id of ORDER) {
  reset('ok');
  const input = defaultInput(id);
  const { status, body } = await post(id, input);
  check(`${id}: 200 with data`, status === 200 && body.data, JSON.stringify(body).slice(0, 120));
  const prompt = mock.control.prompts[0] || '';
  const sample = Object.values(input).find((v) => typeof v === 'string' && v.length > 3 && v.length < 40) || '';
  check(`${id}: form input appears in the prompt`, prompt.includes(sample), `looked for "${sample}"`);
}
check('request carried the key in a header, not the URL', mock.control.lastHeaders['x-goog-api-key'] === 'test-key');

// 3. Output goes through the validator (a valid answer is unchanged in shape)
for (const id of ORDER) {
  reset('ok');
  const { body } = await post(id, defaultInput(id));
  let ok = true;
  try { validate(id, body.data, defaultInput(id)); } catch (e) { ok = false; }
  check(`${id}: validated output is stable`, ok);
}

// 4. Notices on estimated workflows
for (const id of ['map', 'audit', 'migrate']) {
  reset('ok');
  const { body } = await post(id, defaultInput(id));
  check(`${id}: carries an "estimate" notice`, typeof body.data._notice === 'string');
}
reset('ok');
check('create: has no notice', !(await post('create', defaultInput('create'))).body.data._notice);

// 5. Messy model output
reset('fenced');
check('fenced JSON is accepted', (await post('create', defaultInput('create'))).status === 200);
reset('badjson-once');
{
  const r = await post('create', defaultInput('create'));
  check('broken JSON is retried once and succeeds', r.status === 200 && mock.control.calls === 2, `calls=${mock.control.calls}`);
}
reset('garbage');
{
  const r = await post('create', defaultInput('create'));
  check('invalid answer is rejected after one retry', r.status === 502 && mock.control.calls === 2 && /incomplete/.test(r.body.error));
  check('retry prompt includes the deterministic validation failure instead of repeating the original prompt', mock.control.prompts.length === 2 && mock.control.prompts[1].includes('REPAIR THE PREVIOUS RESPONSE') && mock.control.prompts[1].includes('Deterministic validation rejected it for this reason:'));
}

check('upstream HTTP 401 is preserved rather than converted to a generic 502', upstreamError({ label: 'Gemini', keyEnv: 'GEMINI_API_KEY' }, 'gemini-test', { status: 401, json: { error: { message: 'API key rejected' } }, raw: '{"error":{"message":"API key rejected"}}' }).status === 401);
check('upstream HTTP 403 is preserved rather than converted to a generic 502', upstreamError({ label: 'Gemini', keyEnv: 'GEMINI_API_KEY' }, 'gemini-test', { status: 403, json: { error: { message: 'API key restricted' } }, raw: '{"error":{"message":"API key restricted"}}' }).status === 403);

// 6. API problems become readable messages
reset('quota');
check('429 becomes a rate limit message', (await post('create', defaultInput('create'))).status === 429);
reset('badkey');
{
  const r = await post('create', defaultInput('create'));
  check('400 invalid-key response preserves status and gives a helpful message', r.status === 400 && /GEMINI_API_KEY/.test(r.body.error) && !/test-key/.test(JSON.stringify(r.body)));
}
reset('no-generate');
{
  const r = await post('create', defaultInput('create'));
  check('404 on generateContent falls back to interactions', r.status === 200 && mock.control.styles.join() === 'generateContent,interactions', mock.control.styles.join());
}

// 7. Bad requests
reset('ok');
check('unknown workflow is rejected', (await post('nope', {})).status === 400);
check('non-string input is rejected', (await post('create', { name: { a: 1 }, cms: 'aem', description: 'x' })).status === 400);
check('unknown CMS is rejected', (await post('create', { name: 'x', cms: 'zzz', description: 'x' })).status === 400);
check('oversized input is rejected', (await post('create', { name: 'x', cms: 'aem', description: 'x'.repeat(7000) })).status === 400);
check('no Gemini call was made for rejected requests', mock.control.calls === 0, `calls=${mock.control.calls}`);

// 8. Static files: app is public, secrets are not
{
  const home = await fetch(`${URL_BASE}/`);
  check('app page is served', home.status === 200);
  for (const path of ['/.env', '/server/server.js', '/package.json', '/scripts/ai-test.js', '/../etc/passwd']) {
    const r = await fetch(`${URL_BASE}${path}`);
    check(`not public: ${path}`, r.status === 404, `status ${r.status}`);
  }
}

// 9. Validator unit checks
{
  const input = { ...defaultInput('audit'), checks: ['seo'] };
  const out = validate('audit', { categories: [{ id: 'seo', score: 250, passed: 'x' }, { id: 'perf', score: 10 }], findings: [{ category: 'perf', title: 'x' }, { category: 'seo', severity: 'WEIRD', title: 'y' }], metrics: [{ label: 'LCP' }] }, input);
  check('validator: score clamped to 100', out.categories[0].score === 100);
  check('validator: unrequested checks dropped', out.categories.length === 1 && out.findings.length === 1);
  check('validator: unknown severity becomes moderate', out.findings[0].severity === 'moderate');
  check('validator: metrics removed when perf not selected', out.metrics.length === 0);
  let threw = false;
  try { validate('create', { design: {} }, defaultInput('create')); } catch (e) { threw = true; }
  check('validator: rejects an answer missing required parts', threw);
  check('parseModelJson: finds JSON inside extra text', parseModelJson('Sure! {"a":1} done').a === 1);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll AI checks passed');
app.close(); mock.server.close();
process.exit(failures ? 1 : 0);
