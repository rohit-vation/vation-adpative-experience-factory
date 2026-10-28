/** Sample Adobe Experience Manager implementation: dialog, HTL, Sling Model, clientlib CSS. */

import { context } from './helpers.js';
import { cssFor } from './css-template.js';

export function aemFiles(name) {
  const { K, file } = context(name);

  return [
    file('apps/aef/components/{{K}}/_cq_dialog/.content.xml', 'xml', `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    xmlns:cq="http://www.day.com/jcr/cq/1.0"
    xmlns:jcr="http://www.jcp.org/jcr/1.0"
    xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
    jcr:primaryType="nt:unstructured"
    jcr:title="{{T}}"
    sling:resourceType="cq/gui/components/authoring/dialog">
  <content jcr:primaryType="nt:unstructured"
      sling:resourceType="granite/ui/components/coral/foundation/container">
    <items jcr:primaryType="nt:unstructured">
      <title jcr:primaryType="nt:unstructured"
          sling:resourceType="granite/ui/components/coral/foundation/form/textfield"
          fieldLabel="Headline" name="./title" required="{Boolean}true"/>
      <description jcr:primaryType="nt:unstructured"
          sling:resourceType="cq/gui/components/authoring/dialog/richtext"
          fieldLabel="Supporting copy" name="./description" useFixedInlineToolbar="{Boolean}true"/>
      <image jcr:primaryType="nt:unstructured"
          sling:resourceType="granite/ui/components/coral/foundation/form/pathfield"
          fieldLabel="Background image" name="./fileReference" rootPath="/content/dam"/>
      <linkText jcr:primaryType="nt:unstructured"
          sling:resourceType="granite/ui/components/coral/foundation/form/textfield"
          fieldLabel="Button label" name="./linkText"/>
      <linkURL jcr:primaryType="nt:unstructured"
          sling:resourceType="granite/ui/components/coral/foundation/form/pathfield"
          fieldLabel="Button link" name="./linkURL" rootPath="/content"/>
      <alignment jcr:primaryType="nt:unstructured"
          sling:resourceType="granite/ui/components/coral/foundation/form/select"
          fieldLabel="Text alignment" name="./alignment">
        <items jcr:primaryType="nt:unstructured">
          <left jcr:primaryType="nt:unstructured" text="Left" value="left" selected="{Boolean}true"/>
          <center jcr:primaryType="nt:unstructured" text="Center" value="center"/>
        </items>
      </alignment>
    </items>
  </content>
</jcr:root>`),

    file('apps/aef/components/{{K}}/{{K}}.html', 'htl', `<sly data-sly-use.model="com.example.aef.core.models.{{P}}Model"
     data-sly-test.hasContent="%{model.title}">
  <section class="cmp-{{K}} cmp-{{K}}--%{model.alignment @ context='attribute'}"
           aria-labelledby="%{model.id}-title">
    <img class="cmp-{{K}}__image" src="%{model.image}" alt="%{model.imageAlt}"
         loading="eager" fetchpriority="high"/>
    <div class="cmp-{{K}}__content">
      <h1 id="%{model.id}-title" class="cmp-{{K}}__title">%{model.title}</h1>
      <div class="cmp-{{K}}__text">%{model.description @ context='html'}</div>
      <a class="cmp-{{K}}__cta" data-sly-test="%{model.ctaUrl}" href="%{model.ctaUrl}">%{model.ctaLabel}</a>
    </div>
  </section>
</sly>`),

    file('core/models/{{P}}Model.java', 'java', `package com.example.aef.core.models;

import org.apache.sling.api.SlingHttpServletRequest;
import org.apache.sling.models.annotations.DefaultInjectionStrategy;
import org.apache.sling.models.annotations.Model;
import org.apache.sling.models.annotations.injectorspecific.ValueMapValue;

@Model(adaptables = SlingHttpServletRequest.class,
       defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL)
public class {{P}}Model {

    @ValueMapValue private String title;
    @ValueMapValue private String description;
    @ValueMapValue(name = "fileReference") private String image;
    @ValueMapValue private String imageAlt;
    @ValueMapValue(name = "linkText") private String ctaLabel;
    @ValueMapValue(name = "linkURL") private String ctaUrl;
    @ValueMapValue private String alignment = "left";

    public String getId() { return "{{K}}-" + Math.abs(hashCode()); }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getImage() { return image; }
    public String getImageAlt() { return imageAlt != null ? imageAlt : ""; }
    public String getCtaLabel() { return ctaLabel; }
    public String getCtaUrl() { return ctaUrl; }
    public String getAlignment() { return alignment; }
}`),

    file('apps/aef/components/{{K}}/clientlib/{{K}}.css', 'css', cssFor('cmp-' + K, '.cmp-' + K + '--center'))
  ];
}
