/** Sample Optimizely CMS implementation: block class, Razor view, CSS. */

import { context } from './helpers.js';
import { cssFor } from './css-template.js';

export function optimizelyFiles(name) {
  const { K, file } = context(name);

  return [
    file('Models/Blocks/{{P}}Block.cs', 'csharp', `using System.ComponentModel.DataAnnotations;
using EPiServer.Core;
using EPiServer.DataAbstraction;
using EPiServer.DataAnnotations;
using EPiServer.Shell.ObjectEditing;
using EPiServer.Web;

namespace AEF.Models.Blocks;

[ContentType(DisplayName = "{{T}}",
    GUID = "5b0c3b1e-8d3a-4c61-9a11-2f6f0c1d7a42",
    GroupName = "Experience Blocks",
    Description = "Full-width banner with image, headline and one call to action.")]
public class {{P}}Block : BlockData
{
    [CultureSpecific, Required, StringLength(80)]
    [Display(Name = "Headline", Order = 10)]
    public virtual string Heading { get; set; }

    [CultureSpecific]
    [Display(Name = "Supporting copy", Order = 20)]
    public virtual XhtmlString Description { get; set; }

    [Required, UIHint(UIHint.Image)]
    [Display(Name = "Background image", Order = 30)]
    public virtual ContentReference Image { get; set; }

    [CultureSpecific]
    [Display(Name = "Button label", Order = 40)]
    public virtual string CtaLabel { get; set; }

    [Display(Name = "Button link", Order = 50)]
    public virtual Url CtaUrl { get; set; }

    [SelectOne(SelectionFactoryType = typeof(AlignmentSelectionFactory))]
    [Display(Name = "Text alignment", Order = 60)]
    public virtual string Alignment { get; set; }
}`),

    file('Views/Shared/Blocks/{{P}}Block.cshtml', 'razor', `@model AEF.Models.Blocks.{{P}}Block
@{ var align = string.IsNullOrEmpty(Model.Alignment) ? "left" : Model.Alignment; }

<section class="{{K}} {{K}}--@align" aria-labelledby="{{K}}-title">
  <img class="{{K}}__image" src="@Url.ContentUrl(Model.Image)" alt="" loading="eager" fetchpriority="high" />
  <div class="{{K}}__content">
    <h1 id="{{K}}-title" class="{{K}}__title" @Html.EditAttributes(m => m.Heading)>@Model.Heading</h1>
    <div class="{{K}}__text" @Html.EditAttributes(m => m.Description)>
      @Html.PropertyFor(m => m.Description)
    </div>
    @if (Model.CtaUrl != null)
    {
      <a class="{{K}}__cta" href="@Model.CtaUrl">@Model.CtaLabel</a>
    }
  </div>
</section>`),

    file('wwwroot/css/{{K}}.css', 'css', cssFor(K, '.' + K + '--center'))
  ];
}
