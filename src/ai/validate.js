/**
 * Cleans what the model returned so render.js can trust it.
 *
 *   validate(workflowId, data, input) -> data in the expected shape for the selected workflow
 *
 * Rules of thumb:
 *   - Anything the model could get wrong in a way that would CRASH the screen is fixed or rejected
 *     (unknown enum values, missing arrays, text where a number should be).
 *   - Numbers we can calculate ourselves (counts, summaries) are recomputed, not trusted.
 *   - Values the person chose in the form (CMS, mode) are forced back to what they chose.
 *   - If a part the screen cannot do without is missing, an Error is thrown. The server then
 *     retries once and finally shows "Generation failed".
 *
 * Text is NOT escaped here. render.js escapes everything it prints.
 * This file is plain JavaScript with no browser or Node specifics, so it runs on the server and in tests.
 */

import { CMS_IDS } from '../config.js';
import { CHECKS } from '../workflows/audit/checks.js';
import { normalizeComponentFields, normalizeComponentGroup, extractRequestedComponentGroup, extractRequestedClientlibCategory, defaultClientlibCategory, normalizeClientlibCategory, isRepeatableTabsBrief, isAccordionBrief, normalizeRuleSuggestions, normalizeResourceSuperType } from './system-prompt.js';

/* ---------- Small helpers ---------- */

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, fallback = '') => (typeof x === 'string' ? x : x == null ? fallback : String(x));
const oneOf = (x, list, fallback) => (list.includes(x) ? x : fallback);
const num = (x, min, max, fallback) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const need = (cond, message) => { if (!cond) throw new Error('Invalid AI response: ' + message); };

const SEVERITIES = ['critical', 'serious', 'moderate', 'minor'];
const CONFIDENCE = ['high', 'medium', 'low'];

/** { name, lang, code } with all three as text. Returns null if there is no code. */
function cleanFile(f) {
  if (!isObj(f)) return null;
  const code = str(f.code);
  if (!code.trim()) return null;
  return { name: str(f.name, 'file.txt'), lang: str(f.lang, 'text'), code };
}

const cleanFiles = (list) => arr(list).map(cleanFile).filter(Boolean);

function aemFieldContract(fields) {
  const names = new Set();
  const composites = new Set();
  const visit = (list) => {
    for (const field of arr(list)) {
      if (!field || typeof field.name !== 'string') continue;
      names.add(field.name);
      if (field.type === 'multifield' && field.composite === true) composites.add(field.name);
      visit(field.children);
    }
  };
  visit(fields);
  return { names, composites };
}

function aemMarkupReferences(source) {
  const names = new Set();
  const groups = new Set();
  const valueMapPattern = /\bvalueMap\.([A-Za-z][A-Za-z0-9_]*)/g;
  const propertyPattern = /\bproperties\.([A-Za-z][A-Za-z0-9_]*)/g;
  const modelPattern = /\bmodel\.([A-Za-z][A-Za-z0-9_]*)/g;
  const groupPattern = /\.name\s*={2,3}\s*['"]([A-Za-z][A-Za-z0-9_]*)['"]/g;
  for (const pattern of [valueMapPattern, propertyPattern, modelPattern]) {
    for (const match of String(source || '').matchAll(pattern)) {
      if (match[1] !== 'id') names.add(match[1]);
    }
  }
  for (const match of String(source || '').matchAll(groupPattern)) groups.add(match[1]);
  return { names, groups };
}

function validateAemFieldBindings(fields, htmlFile, directJcrHtl, input) {
  const { names, composites } = aemFieldContract(fields);
  const source = String(htmlFile?.code || '');
  const direct = String(directJcrHtl || '');
  const sourceRefs = aemMarkupReferences(source);
  const directRefs = aemMarkupReferences(direct);
  const allRefs = new Set([...sourceRefs.names, ...directRefs.names]);

  if (!names.size && (allRefs.size || sourceRefs.groups.size || directRefs.groups.size ||
      /resource\\.children|data-sly-list\\.[A-Za-z_$][\\w$]*\\s*=/.test(source + '\\n' + direct))) {
    need(false, 'This data-driven AEM component has HTL property/child-resource bindings but an empty fields schema. Return the recursive authoring fields that match the exact property and composite-group names in the markup.');
  }

  for (const name of allRefs) {
    need(names.has(name), 'HTL references the authored property "' + name + '" but it is missing from the recursive AEM fields schema. Define the field at the correct nested level and keep its exact property name.');
  }

  for (const group of new Set([...sourceRefs.groups, ...directRefs.groups])) {
    need(composites.has(group), 'HTL iterates the child-resource group "' + group + '" but the fields schema does not define a composite multifield with that exact name.');
  }

  for (const group of composites) {
    need(source.includes('model.' + group) || sourceRefs.groups.has(group) || /resource\\.children/.test(source),
      'The source HTL does not render the composite multifield "' + group + '".');
    need(directRefs.groups.has(group) || direct.includes("'" + group + "'") || direct.includes('"' + group + '"'), 'The model-free direct-JCR HTL must locate the composite child-resource group "' + group + '" by its exact name.');
  }

  const directCompositeProperty = [...aemMarkupReferences(direct).names].find((name) =>
    composites.has(name) && new RegExp('\\\\bproperties\\\\.' + name + '\\b').test(direct));
  need(!directCompositeProperty, 'directJcrHtl treats composite group "' + directCompositeProperty + '" as a flat component property. It must iterate the group resource and its child resources.');

  const brief = String(input?.name || '') + ' ' + String(input?.description || '');
  const jsFile = arr(input?._files).find((file) => /\\.m?js$/i.test(String(file?.name || '')) || /^(?:js|javascript)$/i.test(String(file?.lang || '')));
  // This helper is intentionally schema-focused; interaction-to-script checks run in the caller
  // after the selected script has been identified.
  return { names, composites, sourceRefs, directRefs, brief, jsFile };
}

/* ---------- One function per workflow ---------- */

const VALIDATORS = {
  'design-to-aem'(d, input) {
    need(isObj(d), 'not an object');
    need(isObj(d.source), 'missing design source');
    need(isObj(d.template), 'missing template plan');
    need(Array.isArray(d.components) && d.components.length > 0, 'no component candidates');
    need(Array.isArray(d.sections) && d.sections.length > 0, 'no page sections');
    need(isObj(d.page), 'missing page');
    const safePath = (value, fallback) => {
      const path = str(value, fallback).replaceAll('\\\\', '/');
      return path.startsWith('/') && !path.split('/').some((part) => part === '.' || part === '..') ? path : fallback;
    };
    const pagePath = safePath(d.page.path, input.pagePath);
    const templatePath = safePath(d.template.path, '/conf/' + input.site + '/settings/wcm/templates/' + String(d.template.name || 'design-page').toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
    const components = arr(d.components).filter(isObj).map((component) => ({
      name: str(component.name, 'Component'),
      resourceType: str(component.resourceType, 'core/wcm/components/container/v1/container'),
      action: oneOf(component.action, ['reuse', 'generate'], 'reuse'),
      confidence: Math.round(num(component.confidence, 0, 100, 70)),
      fields: arr(component.fields).map((field) => str(field))
    }));
    const sections = arr(d.sections).filter(isObj).map((section) => ({
      name: str(section.name, 'Section'), layout: str(section.layout, 'container'), components: arr(section.components).map((name) => str(name))
    }));
    const authoring = arr(d.authoring).filter(isObj).map((entry) => ({ component: str(entry.component), properties: isObj(entry.properties) ? Object.fromEntries(Object.entries(entry.properties).map(([k,v]) => [str(k), str(v)])) : {} }));
    const assets = arr(d.assets).filter(isObj).map((asset) => ({ source: str(asset.source), damPath: str(asset.damPath), action: oneOf(asset.action, ['reference', 'upload-required'], 'upload-required') }));
    return {
      source: { type: input.sourceType === 'wireframe' ? 'Wireframe' : 'Figma', url: input.designUrl, analysisStatus: oneOf(d.source.analysisStatus, ['reference-only', 'semantic-input'], 'reference-only') },
      template: { strategy: oneOf(d.template.strategy, ['reuse', 'generate'], input.templateStrategy), name: str(d.template.name, 'design-page'), path: templatePath, reason: str(d.template.reason), confidence: Math.round(num(d.template.confidence, 0, 100, 60)) },
      components, sections,
      page: { name: str(d.page.name, input.pageName), path: pagePath, title: str(d.page.title, input.pageName), description: str(d.page.description, input.requirements) },
      authoring, assets,
      review: arr(d.review).map((item) => str(item))
    };
  },
  create(d, input) {
    need(isObj(d), 'not an object');
    need(isObj(d.design), 'missing design');
    need(isObj(d.implementations), 'missing implementations');

    const implementations = {};
    const description = str(input.description);
    const selectedCms = input.cms;
    const selectedSource = isObj(d.implementations[selectedCms]) ? d.implementations[selectedCms] : {};
    const countRecursiveFields = (fields) => arr(fields).reduce((count, field) => count + 1 + countRecursiveFields(field?.children), 0);
    const expectedModelRows = selectedCms === 'aem'
      ? countRecursiveFields(selectedSource.fields)
      : arr(selectedSource.model).length;
    const proxyRequested = (/\bproxy component\b|\bcore component proxy\b|\bproxy for\b|\bproxy of\b|\bproxy to\b|\bcreate\s+(?:an?\s+)?(?:pure\s+)?proxy\b|\bbuild\s+(?:an?\s+)?proxy\b|\buse\s+(?:an?\s+)?proxy\b/i.test(description)) &&
      !/\b(?:not|no|don't|do not|avoid|without)\b.{0,25}\bproxy\b/i.test(description);
    const needsClientSideBehavior = /\b(?:javascript|java script|\bjs\b|interactive|interaction|carousel|slider|tabs?|tabbed|accordion|collapse|expand|toggle|modal|drawer|dropdown|filter|search|sort|pagination|stepper|wizard|drag[\s-]*and[\s-]*drop|reorder|show[\s-]*hide|auto[\s-]*play|live preview|dynamic|autocomplete|typeahead|calendar|date picker|progress indicator|counter|menu toggle|responsive navigation|keyboard navigation|previous and next)\b/i.test(str(input.name) + ' ' + description) || isAccordionBrief(str(input.name) + ' ' + description);
    const needsCustomSlingModel = /\bsling[\s-]*model\b|\bbackend logic\b|\bservice integration\b|\bexternal api\b|\bcomputed field\b|\bderived data\b/i.test(description);
    const asksForMultifield = /\bmulti[\s-]?field\b|\bmultifiled\b|\bcomposite multifield\b/i.test(description) || isRepeatableTabsBrief(str(input.name) + ' ' + description) || isAccordionBrief(str(input.name) + ' ' + description);

    for (const id of CMS_IDS) {
      const suppliedImpl = d.implementations[id];

      // A create request generates one selected CMS at a time. Keep other
      // targets safe for the UI, but do not reject the selected result just
      // because another CMS implementation was omitted or is incomplete.
      if (id !== selectedCms) {
        const optionalImpl = isObj(suppliedImpl) ? suppliedImpl : {};
        const optionalModel = arr(optionalImpl.model)
          .filter(isObj)
          .map((m) => ({ field: str(m.field), type: str(m.type), note: str(m.note) }));
        if (expectedModelRows > 0) {
          need(optionalModel.length === expectedModelRows,
            'The ' + id + ' content model must map all ' + expectedModelRows + ' logical field(s), even though implementation files are generated only for the selected CMS.');
        }
        const optionalDirectJcrHtl = str(optionalImpl.directJcrHtl).trim();
        implementations[id] = {
          model: optionalModel,
          files: cleanFiles(optionalImpl.files),
          ...(id === 'aem' ? {
            fields: Array.isArray(optionalImpl.fields) ? optionalImpl.fields : [],
            proxyComponent: optionalImpl.proxyComponent === true,
            componentGroup: normalizeComponentGroup(optionalImpl.componentGroup),
            resourceSuperType: normalizeResourceSuperType(optionalImpl.resourceSuperType),
            ...(optionalDirectJcrHtl ? { directJcrHtl: optionalDirectJcrHtl } : {})
          } : {})
        };
        continue;
      }

      const impl = suppliedImpl;
      need(isObj(impl), `missing implementation for ${id}`);
      const negatesProxy = /\b(?:not|no|don't|do not|avoid|without)\b.{0,25}\bproxy\b/i.test(description);
      const proxyComponent = id === 'aem' && !negatesProxy && (impl.proxyComponent === true || proxyRequested);
      const resourceSuperType = id === 'aem' ? normalizeResourceSuperType(impl.resourceSuperType) : '';
      const requestedGroup = id === 'aem' ? extractRequestedComponentGroup(description) : '';
      const componentGroup = id === 'aem' ? (requestedGroup || normalizeComponentGroup('')) : '';
      const requestedClientlibCategory = id === 'aem' ? extractRequestedClientlibCategory(description) : '';
      const clientlibCategory = id === 'aem'
        ? (requestedClientlibCategory || defaultClientlibCategory(input.name))
        : '';
      if (proxyComponent) {
        need(Boolean(resourceSuperType), 'A proxy component request needs a valid resourceSuperType, such as core/wcm/components/carousel/v1/carousel.');
      }

      const files = cleanFiles(impl.files);
      const directJcrHtl = id === 'aem' ? str(impl.directJcrHtl).trim() : '';
      const model = arr(impl.model)
        .filter(isObj)
        .map((m) => ({ field: str(m.field), type: str(m.type), note: str(m.note) }));
      let fields;
      if (id === 'aem') {
        if (proxyComponent && (!Array.isArray(impl.fields) || impl.fields.length === 0)) {
          fields = [];
        } else if (Array.isArray(impl.fields) && impl.fields.length === 0 && model.length === 0) {
          // Fieldless structural components are valid when their custom HTL/CSS are complete.
          fields = [];
        } else {
          need(Array.isArray(impl.fields) && impl.fields.length > 0, 'AEM component field schema is missing. Return the recursive fields used by the dialog, model and HTL.');
          fields = normalizeComponentFields(impl.fields, model);
        }
      }

      if (id === 'aem' && !proxyComponent) {
        const htmlFile = files.find((file) => /\.(?:html?|htl)$/i.test(String(file.name || '')) || /^(?:html?|htl)$/i.test(String(file.lang || '')));
        const cssFile = files.find((file) => /\.css$/i.test(String(file.name || '')) || /^css$/i.test(String(file.lang || '')));
        const jsFile = files.find((file) => /\.(?:m?js)$/i.test(String(file.name || '')) || /^(?:js|javascript)$/i.test(String(file.lang || '')));
        const javaFile = files.find((file) => /\.java$/i.test(String(file.name || '')) || /^java$/i.test(String(file.lang || '')));
        need(Boolean(htmlFile), 'AEM component source is missing its HTL/HTML rendering file. Return the real component markup, not a description or pseudocode.');
        need(Boolean(cssFile), 'AEM component source is missing its CSS file. Return the component-specific responsive styles.');
        if (needsClientSideBehavior) {
          need(Boolean(jsFile), 'This description implies client-side behavior, but no JavaScript file was returned. Generate the script and connect it to the actual HTL markup and clientlib.');
        }
        if (needsCustomSlingModel) {
          need(Boolean(javaFile), 'This description asks for Sling Model or server-side logic, but no Java Sling Model source was returned.');
        }
        if (asksForMultifield) {
          need(Array.isArray(fields) && fields.some((field) => field.type === 'multifield'), 'The description asks for a multifield, but the AEM fields schema has no multifield. Define the repeatable field and its child fields.');
        }
        const compositeFieldNames = [];
        const collectCompositeFieldNames = (fieldList) => {
          for (const field of arr(fieldList)) {
            if (field?.type === 'multifield' && field.composite === true) compositeFieldNames.push(field.name);
            collectCompositeFieldNames(field?.children);
          }
        };
        collectCompositeFieldNames(fields);
        if (compositeFieldNames.length || needsCustomSlingModel) {
          need(Boolean(directJcrHtl), 'Composite multifields or Sling Model-based logic require directJcrHtl: a second model-free HTL rendering for the direct-JCR install path.');
          need(!directJcrHtl.includes('data-sly-use.model') && !directJcrHtl.includes('model.'), 'directJcrHtl must be model-free and render from resource children/valueMap/properties.');
          need(directJcrHtl.includes('resource.children'), 'directJcrHtl must iterate resource.children, locate the composite container node by its exact name, and then iterate that containerâ€™s children.');
          need(directJcrHtl.includes('valueMap') || directJcrHtl.includes('.properties'), 'directJcrHtl must read saved child fields through each child resource valueMap/properties, not a flattened component property.');
          for (const name of compositeFieldNames) {
            need(directJcrHtl.includes(name), 'directJcrHtl is missing the composite child-resource group named ' + name + '.');
          }
        }
        validateAemFieldBindings(fields, htmlFile, directJcrHtl, input);
        if (id === 'aem') {
          const categoryRefs = [String(htmlFile.code || ''), directJcrHtl].flatMap((markup) =>
            [...markup.matchAll(/clientlib\.(?:css|js)\s*@\s*categories\s*=\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
          need(categoryRefs.every((category) => category === clientlibCategory), 'Every source and direct-JCR HTL clientlib reference must use the exact configured clientlib category "' + clientlibCategory + '".');
          const clientlibMetadata = files.find((file) => /(?:^|\/)clientlib\/\.content\.xml$/i.test(String(file.name || '')));
          if (clientlibMetadata) {
            const metadataCategory = String(clientlibMetadata.code || '').match(/categories="\[([^\]]+)\]"/)?.[1] || '';
            need(metadataCategory === clientlibCategory, 'Clientlib metadata category must exactly match the configured category "' + clientlibCategory + '".');
          }
        }
        if (isRepeatableTabsBrief(str(input.name) + ' ' + description)) {
          const tabGroup = fields.find((field) => field.type === 'multifield' && field.composite === true && /\btabs?\b/i.test(field.name + ' ' + field.label)) ||
            fields.find((field) => field.type === 'multifield' && field.composite === true);
          const tabChildren = arr(tabGroup?.children);
          const tabTitle = tabChildren.find((field) => field.role === 'title') ||
            tabChildren.find((field) => /\b(?:tab)?(?:title|label|heading|name)\b/i.test(field.name + ' ' + field.label));
          const tabContent = tabChildren.find((field) => field.role === 'body') ||
            tabChildren.find((field) => field.type === 'richtext') ||
            tabChildren.find((field) => /\b(?:content|body|description|text)\b/i.test(field.name + ' ' + field.label));
          const sourceMarkup = String(htmlFile.code || '');
          const directMarkup = directJcrHtl;
          const script = String(jsFile?.code || '');
          const style = String(cssFile?.code || '');
          need(Boolean(tabGroup && tabTitle && tabContent), 'A tabbed multifield needs one composite tabs group with a title field and a content field.');
          need(/<button\b[^>]*\brole\s*=\s*["']tab["']/i.test(sourceMarkup), 'Each tab must be a real button with role="tab"; a list item or generic element is not keyboard-operable.');
          need(/role\s*=\s*["']tablist["']/i.test(sourceMarkup) && /role\s*=\s*["']tabpanel["']/i.test(sourceMarkup), 'The HTL must render a tablist and corresponding tabpanel elements.');
          need(/aria-selected\s*=/.test(sourceMarkup) && /aria-controls\s*=/.test(sourceMarkup) && /aria-labelledby\s*=/.test(sourceMarkup), 'Tab buttons and panels must have synchronized aria-selected, aria-controls and aria-labelledby attributes.');
          need(/data-sly-attribute\.hidden|\bhidden\b/i.test(sourceMarkup), 'The HTL must hide all inactive panels and expose the initial active panel.');
          need(sourceMarkup.includes('valueMap.' + tabTitle.name) && sourceMarkup.includes('valueMap.' + tabContent.name), 'The tab title and content must bind to the exact child property names from the composite multifield schema.');
          need(/resource\.children/.test(directMarkup) && directMarkup.includes('valueMap.' + tabTitle.name) && directMarkup.includes('valueMap.' + tabContent.name) &&
            /role\s*=\s*["']tablist["']/i.test(directMarkup) && /role\s*=\s*["']tabpanel["']/i.test(directMarkup), 'The model-free direct-JCR HTL must render the same tab controls and panels from the saved composite child resources.');
          need(/addEventListener\(["']click["']/.test(script) && /addEventListener\(["']keydown["']/.test(script) &&
            /ArrowRight/.test(script) && /ArrowLeft/.test(script) && /Home/.test(script) && /End/.test(script), 'Tabs JavaScript must implement click activation and ArrowLeft/ArrowRight/Home/End keyboard navigation.');
          need(/aria-selected/.test(script) && /\.hidden\s*=/.test(script) && /tabIndex/.test(script), 'Tabs JavaScript must update the selected state, panel visibility and roving tab index together.');
          need(/\[hidden\]/.test(style) && /aria-selected/.test(style), 'Tabs CSS must explicitly hide inactive panels and visually distinguish the selected tab.');
        }

        if (id === 'aem' && isAccordionBrief(str(input.name) + ' ' + description)) {
          const accordionGroup = fields.find((field) => field.type === 'multifield' && field.composite === true &&
            /\b(?:faq|items|questions|accordion|entries)\b/i.test(field.name + ' ' + field.label)) ||
            fields.find((field) => field.type === 'multifield' && field.composite === true);
          const accordionChildren = arr(accordionGroup?.children);
          const questionField = accordionChildren.find((field) => field.role === 'title') ||
            accordionChildren.find((field) => /\b(?:question|prompt|title|heading|label)\b/i.test(field.name + ' ' + field.label));
          const answerField = accordionChildren.find((field) => field.role === 'body') ||
            accordionChildren.find((field) => field.type === 'richtext') ||
            accordionChildren.find((field) => /\b(?:answer|response|content|body|description)\b/i.test(field.name + ' ' + field.label));
          const sourceMarkup = String(htmlFile.code || '');
          const directMarkup = directJcrHtl;
          const script = String(jsFile?.code || '');
          const style = String(cssFile?.code || '');
          need(Boolean(accordionGroup && questionField && answerField), 'An interactive FAQ/accordion requires a composite collection with a question and answer field.');
          need(/<button\b/i.test(sourceMarkup) && /aria-expanded\s*=/.test(sourceMarkup) &&
            /aria-controls\s*=/.test(sourceMarkup) && /role\s*=\s*["']region["']/i.test(sourceMarkup) &&
            /aria-labelledby\s*=/.test(sourceMarkup) && /\bhidden\b/i.test(sourceMarkup),
            'Accordion HTL must render native question buttons, linked answer regions, aria-expanded state and initially hidden answers.');
          need(sourceMarkup.includes('valueMap.' + questionField.name) && sourceMarkup.includes('valueMap.' + answerField.name),
            'Accordion HTL must bind the question and answer using the exact composite child property names.');
          need(/resource\.children/.test(directMarkup) && directMarkup.includes('valueMap.' + questionField.name) &&
            directMarkup.includes('valueMap.' + answerField.name) && /aria-expanded\s*=/.test(directMarkup) &&
            /role\s*=\s*["']region["']/i.test(directMarkup) && /\bhidden\b/i.test(directMarkup),
            'Model-free direct-JCR HTL must render the same question controls and answer regions from the saved child resources.');
          need(/addEventListener\(["']click["']/.test(script) && /aria-expanded/.test(script) &&
            /\.hidden\s*=/.test(script) && /triggers\.forEach\(close\)/.test(script),
            'Accordion JavaScript must toggle the selected answer, close other answers and synchronize aria-expanded with panel visibility.');
          need(/\[hidden\]/.test(style) && /focus-visible/.test(style),
            'Accordion CSS must honor hidden panels and provide a visible keyboard focus state.');
        }
        const flatModelCollection = compositeFieldNames.find((name) => htmlFile.code.includes('model.' + name));
        need(!flatModelCollection || Boolean(directJcrHtl), 'The codebase HTL binds a composite collection through model.' + flatModelCollection + ', so directJcrHtl must provide the corresponding model-free child-resource rendering.');
        if (htmlFile && /clientlib\\.js\\s*@/i.test(htmlFile.code)) {
          need(Boolean(jsFile), 'The HTL references a JavaScript clientlib, but no JavaScript asset was returned.');
        }
      } else if (id !== 'aem') {
        need(files.length > 0, `no files for ${id}`);
      }

      implementations[id] = {
        model,
        files,
        ...(id === 'aem' ? { fields, componentGroup, clientlibCategory, proxyComponent, resourceSuperType, ...(directJcrHtl ? { directJcrHtl } : {}) } : {})
      };
    }

    return {
      component: { name: str(d.component?.name, input.name), cms: input.cms, summary: str(d.component?.summary, input.description) },
      design: {
        a11y: arr(d.design.a11y).map((x) => str(x))
      },
      ruleSuggestions: normalizeRuleSuggestions(d.ruleSuggestions),
      implementations
    };
  },

  map(d, input) {
    need(isObj(d), 'not an object');
    const components = arr(d.components).filter(isObj).map((c) => {
      const mapping = arr(c.mapping).filter(isObj).map((m) => ({
        field: str(m.field),
        source: str(m.source),
        target: str(m.target),
        transform: str(m.transform),
        confidence: oneOf(m.confidence, CONFIDENCE, 'medium')
      }));
      const needsReview = mapping.some((m) => m.confidence !== 'high');
      return {
        name: str(c.name, 'Component'),
        status: needsReview ? 'Review suggested' : 'Ready to migrate',
        mapping,
        sourceFiles: cleanFiles(c.sourceFiles),
        targetFiles: cleanFiles(c.targetFiles)
      };
    });
    need(components.length > 0, 'no components');
    need(components.every((c) => c.targetFiles.length > 0), 'a component has no target files');

    // Counts come from the data, not from the model
    const fields = components.reduce((n, c) => n + c.mapping.length, 0);
    const auto = components.reduce((n, c) => n + c.mapping.filter((m) => m.confidence === 'high').length, 0);

    return {
      summary: {
        components: components.length,
        fields,
        auto: fields ? Math.round((100 * auto) / fields) : 0,
        review: fields - auto
      },
      requirement: input.requirement,
      source: input.source,
      target: input.target,
      components,
      notes: arr(d.notes).map((x) => str(x))
    };
  },

  audit(d, input) {
    need(isObj(d), 'not an object');
    const selected = input.checks;

    const categories = arr(d.categories)
      .filter((c) => isObj(c) && selected.includes(c.id))
      .map((c) => ({
        id: c.id,
        label: CHECKS.find((k) => k.id === c.id).label,
        score: Math.round(num(c.score, 0, 100, 0)),
        passed: Math.round(num(c.passed, 0, 100000, 0))
      }));
    need(categories.length > 0, 'no categories for the selected checks');

    const findings = arr(d.findings)
      .filter((f) => isObj(f) && selected.includes(f.category))
      .map((f) => ({
        category: f.category,
        severity: oneOf(f.severity, SEVERITIES, 'moderate'),
        title: str(f.title),
        rule: str(f.rule),
        where: str(f.where),
        fix: str(f.fix)
      }));

    const metrics = selected.includes('perf')
      ? arr(d.metrics).filter(isObj).map((m) => ({
          label: str(m.label),
          value: str(m.value),
          target: str(m.target),
          status: oneOf(m.status, ['good', 'warn', 'bad'], 'warn')
        }))
      : [];

    return { mode: input.mode, subject: str(d.subject, input.target), categories, metrics, findings };
  },

  migrate(d, input) {
    need(isObj(d), 'not an object');
    const output = cleanFile(d.output);
    need(output, 'missing example page');

    return {
      site: {
        host: str(d.site?.host),
        pages: Math.round(num(d.site?.pages, 0, 1e7, 0)),
        assets: Math.round(num(d.site?.assets, 0, 1e7, 0))
      },
      target: input.target,
      stats: arr(d.stats).filter(isObj).map((s) => ({ label: str(s.label), value: str(s.value) })),
      templates: arr(d.templates).filter(isObj).map((t) => ({
        name: str(t.name),
        pages: Math.round(num(t.pages, 0, 1e7, 0)),
        components: str(t.components)
      })),
      mapping: arr(d.mapping).filter(isObj).map((m) => ({
        source: str(m.source),
        target: str(m.target),
        fields: str(m.fields),
        confidence: oneOf(m.confidence, CONFIDENCE, 'medium')
      })),
      output,
      review: arr(d.review).filter(isObj).map((r) => ({
        severity: oneOf(r.severity, SEVERITIES, 'moderate'),
        title: str(r.title),
        detail: str(r.detail)
      }))
    };
  }
};

export function validate(workflowId, data, input) {
  const check = VALIDATORS[workflowId];
  need(check, 'unknown workflow ' + workflowId);
  return check(data, input);
}

