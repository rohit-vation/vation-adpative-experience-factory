/**
 * One converted example page in the native import format of each target CMS.
 *
 *   examplePage('cf', 'northwind.example') -> { name, lang, code }
 */

function aemPage(host) {
  return {
    name: `ui.content/jcr_root/content/${host}/en/spring-launch/.content.xml`,
    lang: 'xml',
    code: `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0"
    xmlns:jcr="http://www.jcp.org/jcr/1.0"
    xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
    xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="cq:Page">
  <jcr:content jcr:primaryType="cq:PageContent"
      jcr:title="Spring launch"
      cq:template="/conf/aef/settings/wcm/templates/landing-page"
      sling:resourceType="aef/components/page">
    <root jcr:primaryType="nt:unstructured" sling:resourceType="aef/components/container">
      <hero_banner jcr:primaryType="nt:unstructured"
          sling:resourceType="aef/components/hero-banner"
          title="Spring launch"
          fileReference="/content/dam/${host}/hero/spring.jpg"
          linkText="Shop the collection" linkURL="/content/${host}/en/shop"
          alignment="left"/>
      <teaser_card jcr:primaryType="nt:unstructured"
          sling:resourceType="aef/components/teaser-card"
          title="Trail essentials"
          fileReference="/content/dam/${host}/cards/trail.jpg"
          linkURL="/content/${host}/en/trail"/>
    </root>
  </jcr:content>
</jcr:root>`
  };
}

function edsPage() {
  return {
    name: '/spring-launch.plain.html',
    lang: 'html',
    code: `<div>
  <div class="hero-banner">
    <div><div><picture><img src="./media/spring-hero.jpg" alt="Spring collection"></picture></div></div>
    <div><div>
      <h1>Spring launch</h1>
      <p>New arrivals for the season.</p>
      <p><a href="/shop">Shop the collection</a></p>
    </div></div>
  </div>
</div>
<div>
  <div class="cards">
    <div>
      <div><picture><img src="./media/trail.jpg" alt="Trail essentials"></picture></div>
      <div><h3>Trail essentials</h3><p><a href="/trail">See the range</a></p></div>
    </div>
  </div>
</div>`
  };
}

function contentfulPage() {
  const text = (value) => ({ 'en-US': value });
  const entryLink = (id) => ({ sys: { type: 'Link', linkType: 'Entry', id } });

  return {
    name: 'import/spring-launch.entries.json',
    lang: 'json',
    code: JSON.stringify(
      {
        contentTypes: ['landingPage', 'heroBanner', 'teaserCard'],
        entries: [
          {
            sys: { id: 'hero-spring-launch', contentType: 'heroBanner' },
            fields: {
              title: text('Spring launch'),
              image: text({ sys: { type: 'Link', linkType: 'Asset', id: 'asset-spring-hero' } }),
              ctaLabel: text('Shop the collection'),
              ctaUrl: text('/shop'),
              alignment: text('left')
            }
          },
          {
            sys: { id: 'teaser-trail', contentType: 'teaserCard' },
            fields: { title: text('Trail essentials'), link: text('/trail') }
          },
          {
            sys: { id: 'page-spring-launch', contentType: 'landingPage' },
            fields: {
              slug: text('spring-launch'),
              sections: text([entryLink('hero-spring-launch'), entryLink('teaser-trail')])
            }
          }
        ]
      },
      null,
      2
    )
  };
}

function optimizelyPage(host) {
  return {
    name: 'import/spring-launch.blocks.json',
    lang: 'json',
    code: JSON.stringify(
      {
        page: { contentType: 'LandingPage', name: 'Spring launch', routeSegment: 'spring-launch', parent: `/${host}/` },
        blocks: [
          {
            contentType: 'HeroBannerBlock',
            properties: { Heading: 'Spring launch', Image: 'Media/hero/spring.jpg', CtaLabel: 'Shop the collection', CtaUrl: '/shop', Alignment: 'left' }
          },
          {
            contentType: 'TeaserCardBlock',
            properties: { Heading: 'Trail essentials', Image: 'Media/cards/trail.jpg', Link: '/trail' }
          }
        ]
      },
      null,
      2
    )
  };
}

export function examplePage(target, host) {
  switch (target) {
    case 'aem':  return aemPage(host);
    case 'eds':  return edsPage();
    case 'cf':   return contentfulPage();
    default:     return optimizelyPage(host);
  }
}
