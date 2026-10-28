/** Helpers for building workflow input forms. */

import { CMS, CMS_IDS } from '../config.js';
import { esc, $ } from '../lib/dom.js';

/** <option> list of all CMS platforms with one preselected. */
export function cmsOptions(selected) {
  return CMS_IDS.map(
    (id) => `<option value="${id}"${id === selected ? ' selected' : ''}>${esc(CMS[id].label)}</option>`
  ).join('');
}

/** Read the value of a form control by id. Returns '' if it is not on the page. */
export function val(id) {
  const el = $('#' + id);
  return el ? el.value : '';
}
