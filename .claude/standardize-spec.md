# Solyx standardization spec — apply to each page (canonical, proven on home.html)

Single standalone HTML files, inline `<style>`/`<script>`, no build. Brand: green `#35A847`, deep green `#1E7A30`, ink `#1c2422`/`#3D3D3D`, page `#f6f8f7`. Fonts Inter + DM Sans. Dutch copy. **Use each page's existing CSS variables if present (e.g. `--green`, `--green-deep`, `--ink-mid`, `--border`); otherwise hardcode the brand hex above.** Make surgical edits; match each file's existing structure. Do NOT rewrite whole pages.

Real pages that exist (route nav links to these only): `home.html`, `hoe-werkt-het.html`, `besparen.html`, `how-to-get-it.html`, `shop.html`, `wateraccu.html`, `faq.html`, `installatie.html`, `landingspagina.html`. (`installateurs.html`, `klantverhalen.html`, etc. do NOT exist — point such links to `#` or the closest real page, don't invent.)

## 1. Frosted glass pill header (item #1, #7, #9, navbar)
Replace the page's `nav{}` base rule so the header is an always-on frosted pill. Keep the page's existing logo markup. Canonical CSS (adapt var names):
```
nav{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:600;width:min(1120px,calc(100% - 36px));display:flex;align-items:center;justify-content:space-between;gap:24px;padding:11px 14px 11px 22px;border-radius:999px;background:rgba(255,255,255,.62);backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);border:1px solid rgba(255,255,255,.7);box-shadow:0 10px 34px rgba(28,36,34,.10),inset 0 1px 0 rgba(255,255,255,.8);transition:box-shadow .4s;}
nav.scrolled{box-shadow:0 12px 40px rgba(28,36,34,.14),inset 0 1px 0 rgba(255,255,255,.85);}
```
- If the page has a separate top `#installer-bar`/top-bar that would overlap the pill, set it `display:none` (leave its markup; add a comment) and move its link into the mobile menu.
- Nav link style: `font-family:var(--font-head);font-size:14px;font-weight:600;color:<ink-mid>;padding:8px 14px;border-radius:999px;text-decoration:none;` hover → `color:<green-deep>;background:rgba(53,168,71,.10)`.
- Logo img keep `height:30px`. If logo uses `mix-blend-mode:multiply`, keep it (reads fine on frosted white).

## 2. CTA standardized to GREEN + Bestel routing (item #7)
- Every header "Bestel"/order button → **green** (`background:var(--green)`, hover `--green-deep`), pill, white text. If the class is named `.btn-orange`, restyle it to green (keep class name, add a comment) — do not leave orange.
- The header "Bestel" `href` → `how-to-get-it.html` (remove any `onclick="goto(...)"`).
- Route the other nav links to their real pages (see list above) instead of dead `#`/in-page `goto()` where a real page exists.

## 3. Right "ball" nav — kill glow + null-safe (item #4, #9)
Only if the page has the `#sn` bullet/ball nav.
- The label class (`.ndl`) MUST NOT have `text-shadow`. Replace any `text-shadow:...` on it with a frosted pill: `background:rgba(255,255,255,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid <border>;padding:4px 11px;border-radius:999px;` and `color:<ink-mid>` (active → `<green-deep>`).
- In the dot-tracking JS, ensure the `getElementById(id)` result is null-guarded (`var el=...; if(!el) return;`) so a missing/renamed section id can't throw and kill the whole loop. Add the guard if absent.

## 4. Footer — opaque + isolated, no green bleed (item #5)
- The footer (or its `.snap-page` wrapper) must be opaque so the fixed animated green `.blob`/`#gc` field can't show through. Add to the footer's outermost wrapper: `background:#0e1512;position:relative;z-index:5;isolation:isolate;` (match the footer's own dark bg color if different).
- Keep the existing footer logo lockup (white SVG wordmark is fine on dark). Do not swap to the base64 nav logo (it's dark).

## 5. Welcome badge (item #6)
If the page has a hero, add near the top of the hero (reuse the page's existing tag/pill class if it has one, e.g. `.hero-tag`/`.product-badge`):
`<span class="hero-tag"><span class="hero-tag-dot"></span>Welkom op onze vernieuwde website</span>`
Only add ONE, on the main hero. Skip if the page is a sub/utility page without a hero.

## 6. Mobile menu (navbar on small screens)
If the page hides `.nav-links` on mobile with no replacement, add a hamburger + dropdown:
```
.nav-burger{display:none;width:42px;height:42px;align-items:center;justify-content:center;border:none;background:transparent;color:<ink>;cursor:pointer;border-radius:999px;}
.nav-burger svg{width:24px;height:24px;}
#mobile-menu{position:fixed;top:78px;left:50%;transform:translateX(-50%) translateY(-12px);width:min(1120px,calc(100% - 36px));z-index:599;background:rgba(255,255,255,.94);backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);border:1px solid rgba(255,255,255,.7);border-radius:20px;box-shadow:0 16px 44px rgba(28,36,34,.16);padding:10px;opacity:0;visibility:hidden;transition:opacity .2s,transform .2s,visibility .2s;}
#mobile-menu.open{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0);}
#mobile-menu a{display:block;font-family:var(--font-head);font-weight:600;font-size:16px;color:<ink>;padding:13px 16px;border-radius:12px;text-decoration:none;}
#mobile-menu a:hover{background:rgba(53,168,71,.10);color:<green-deep>;}
@media(max-width:860px){.nav-links{display:none;}.nav-burger{display:flex;}}
```
Markup: a `<button class="nav-burger" id="nav-burger" aria-label="Menu" aria-expanded="false">` with a 3-line hamburger SVG placed next to the Bestel CTA, and a `<div id="mobile-menu">` (right after `</nav>`) listing the same nav links. JS toggle:
```
(function(){var b=document.getElementById('nav-burger'),m=document.getElementById('mobile-menu');if(!b||!m)return;
  b.addEventListener('click',function(){var o=m.classList.toggle('open');b.setAttribute('aria-expanded',o);});
  m.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){m.classList.remove('open');b.setAttribute('aria-expanded','false');});});})();
```

## 7. Section consistency / spacing / overlap (item #3, #8) — CONSERVATIVE
- Fix ACTUAL bugs only: elements overlapping, unequal/asymmetric section padding, grids that don't collapse on mobile (e.g. a 3-col `.hero-options` price grid that never goes 1-col → add `@media(max-width:600px){.hero-options{grid-template-columns:1fr;}}`), fixed-width panels with no `max-width` guard, fixed-height image boxes that don't shrink on mobile.
- Add a global `img{max-width:100%;height:auto;}` reset if the page lacks one.
- Do NOT redesign bespoke layouts or change copy. Keep snap-scroll behavior intact.

## 8. Misc
- Set `<html lang="nl">` if it's `en`.
- After editing, verify the page still has balanced tags and the `<script>` blocks are intact (don't break existing JS).

Report back: a short bullet list per file of exactly what you changed.
