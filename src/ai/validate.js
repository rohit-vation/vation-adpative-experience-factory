/**
 * Cleans what the model returned so render.js can trust it.
 *
 *   validate(workflowId, data, input) -> data in the exact shape demo.js returns
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
import { CHECKS } from '../workflows/audit/sample-data.js';

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

/* ---------- One function per workflow ---------- */

const VALIDATORS = {
  create(d, input) {
    need(isObj(d), 'not an object');
    need(isObj(d.design), 'missing design');
    need(isObj(d.implementations), 'missing implementations');

    const implementations = {};
    for (const id of CMS_IDS) {
      const impl = d.implementations[id];
      need(isObj(impl), `missing implementation for ${id}`);
      const files = cleanFiles(impl.files);
      need(files.length > 0, `no files for ${id}`);
      implementations[id] = {
        model: arr(impl.model)
          .filter(isObj)
          .map((m) => ({ field: str(m.field), type: str(m.type), note: str(m.note) })),
        files
      };
    }

    return {
      component: { name: str(d.component?.name, input.name), cms: input.cms, summary: str(d.component?.summary, input.description) },
      design: {
        a11y: arr(d.design.a11y).map((x) => str(x))
      },
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
