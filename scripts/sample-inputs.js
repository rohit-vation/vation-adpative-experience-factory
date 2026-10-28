/** The default form values of every workflow, as the input object read() would return. Used by the tests. */

import { WORKFLOWS } from '../src/workflows/index.js';

export function defaultInput(id) {
  const d = WORKFLOWS[id].defaults;
  switch (id) {
    case 'create':      return { name: d.name, cms: d.cms, description: d.description };
    case 'map':         return { ...d };
    case 'audit':       return { mode: 'url', target: d.url, checks: ['a11y', 'seo', 'perf', 'ds', 'content'] };
    case 'migrate':     return { url: d.url, target: d.target };
    case 'personalize': return { ...d };
  }
}
