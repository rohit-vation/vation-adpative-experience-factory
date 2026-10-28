/**
 * The stylesheet shared by all four CMS implementations.
 * Only the class prefix and the "centered" selector differ per CMS.
 *
 *   cssFor('hero-banner', '.hero-banner.center')
 */

export function cssFor(prefix, centerSelector) {
  return `.PFX {
  position: relative;
  display: grid;
  min-height: 28rem;
  isolation: isolate;
  color: var(--aef-color-on-dark, #fff);
  background: var(--aef-color-surface-dark, #10131a);
}

.PFX__image {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.PFX::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(90deg, rgb(0 0 0 / 0.62), rgb(0 0 0 / 0) 70%);
}

.PFX__content {
  align-self: center;
  max-width: 40rem;
  padding: var(--aef-space-8, 3rem) var(--aef-space-6, 1.5rem);
}

CENTER .PFX__content {
  margin-inline: auto;
  text-align: center;
}

.PFX__title {
  margin: 0 0 0.75rem;
  font: 700 clamp(2rem, 4vw, 3.25rem) / 1.1 var(--aef-font-display, system-ui);
  text-wrap: balance;
}

.PFX__cta {
  display: inline-block;
  margin-top: 1.25rem;
  padding: 0.75rem 1.5rem;
  border-radius: var(--aef-radius-2, 4px);
  background: var(--aef-color-accent, #2753cf);
  color: #fff;
  font-weight: 600;
  text-decoration: none;
}

.PFX__cta:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 3px;
}

@media (max-width: 600px) {
  .PFX { min-height: 22rem; }
}`
    .replaceAll('PFX', prefix)
    .replaceAll('CENTER', centerSelector);
}
