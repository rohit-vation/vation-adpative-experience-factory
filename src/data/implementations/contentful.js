/** Sample Contentful implementation: content type, React component, GraphQL query, CSS. */

import { context } from './helpers.js';
import { cssFor } from './css-template.js';

export function contentfulFiles(name) {
  const { K, file } = context(name);

  return [
    file('content-model/{{K}}.json', 'json', `{
  "sys": { "id": "{{C}}" },
  "name": "{{T}}",
  "description": "Full-width banner with image, headline and one call to action.",
  "displayField": "title",
  "fields": [
    { "id": "title", "name": "Headline", "type": "Symbol", "required": true,
      "validations": [{ "size": { "max": 80 } }] },
    { "id": "description", "name": "Supporting copy", "type": "RichText" },
    { "id": "image", "name": "Background image", "type": "Link", "linkType": "Asset", "required": true },
    { "id": "ctaLabel", "name": "Button label", "type": "Symbol" },
    { "id": "ctaUrl", "name": "Button link", "type": "Symbol",
      "validations": [{ "regexp": { "pattern": "^(https?://|/)" } }] },
    { "id": "alignment", "name": "Text alignment", "type": "Symbol",
      "validations": [{ "in": ["left", "center"] }] }
  ]
}`),

    file('components/{{P}}.tsx', 'tsx', `import Image from 'next/image';
import { documentToReactComponents } from '@contentful/rich-text-react-renderer';
import type { {{P}}Fields } from '../types/contentful';

export function {{P}}({ title, description, image, ctaLabel, ctaUrl, alignment = 'left' }: {{P}}Fields) {
  return (
    <section className={'{{K}} {{K}}--' + alignment} aria-labelledby="{{K}}-title">
      {image && (
        <Image
          className="{{K}}__image"
          src={'https:' + image.fields.file.url}
          alt={image.fields.description ?? ''}
          fill
          priority
          sizes="100vw"
        />
      )}
      <div className="{{K}}__content">
        <h1 id="{{K}}-title" className="{{K}}__title">{title}</h1>
        <div className="{{K}}__text">{documentToReactComponents(description)}</div>
        {ctaUrl && <a className="{{K}}__cta" href={ctaUrl}>{ctaLabel}</a>}
      </div>
    </section>
  );
}`),

    file('queries/{{K}}.graphql', 'graphql', `query {{P}}($id: String!, $preview: Boolean = false) {
  {{C}}(id: $id, preview: $preview) {
    title
    description { json }
    image { url description width height }
    ctaLabel
    ctaUrl
    alignment
  }
}`),

    file('styles/{{K}}.css', 'css', cssFor(K, '.' + K + '--center'))
  ];
}
