# Solyx Energy — talking points, 25 August 2026, 16:30

## 1. Opening line

"Since 1 August we closed out the website migration — measurement, consent, redirects, privacy policy, mobile and the last tie to the old domain — and we put a working content assistant live on top of it."

## 2. Three delivered outcomes

**The site is fully measured, and legally so.**
Tag Manager runs behind Google Consent Mode: nothing tracks a visitor until they accept. The commerce funnel is measured for both Meta and Google, so you can see what a webshop visit is actually worth. The advertising pixel used to fire on the first page view before consent — that is closed.

**The migration is finished, not "mostly finished."**
A verified redirect table, so existing Google rankings land on new pages instead of dead ends. Privacy policy published. Every mobile overflow cleared, every dead link repaired. The last dependency on the old domain cut, so the legacy site can be switched off without breaking anything.

**A content assistant is live, since 19 August.**
Password-protected, in Dutch. You ask for a change to the site in normal language instead of clicking through WordPress. It keeps conversation history, shows your drafts live from the site, previews them, and lets you browse every published page as a card with a thumbnail.

## 3. What will impress them most

The safety audit — not the chat.

Anyone can demo an AI that writes text. Almost nobody can show a live test, run with the assistant's own credentials against the real site, proving what it *cannot* do: delete a page, touch a published page, change a setting. Every attempt was refused by WordPress itself. That is a locked door, not a promise in a prompt.

Lead with the demo, close with the audit. The audit is what makes them comfortable letting it near a live business.

## 4. Five questions, with honest answers

**"What does this cost to run?"**
Two components: hosting, which is small, and AI usage, which scales with how much you use it. *Unverified — no pricing figures exist in the project record. Do not quote a number today; promise one this week.*

**"What if the AI breaks our site?"**
It structurally cannot reach a published page. It works in drafts; you publish. That was tested live, not assumed. Honest caveat: the version live today is deliberately limited to changing wording. The next version builds whole page layouts, and the safety guarantee shifts from "text only" to "drafts only, cannot publish." Same blast radius — zero — different mechanism.

**"Who owns it?"**
Your website, content, domain and data are yours; nothing about that changed. The assistant runs on our infrastructure. *Unverified — commercial ownership of the assistant software has not been written down anywhere. Do not improvise a licensing answer; say you will put it in writing.*

**"Can we do it ourselves?"**
Yes. The site is standard WordPress and stays fully editable by hand. The assistant is an addition, not a replacement — if it were switched off tomorrow, nothing about your ability to run the site changes.

**"What if we stop paying?"**
The website keeps running exactly as it is. The assistant stops. There is no lock-in on the site itself. *One real risk worth naming internally, not to them: the current assistant's source is not held in a repository, so continuity depends on the rewrite now underway.*

## 5. The ask

**Primary:** agreement to fund the next phase — the assistant graduating from editing words to composing whole pages from their existing design blocks, still drafts-only. Decision today, scope conversation this week.

**Fallback:** a two-week supervised trial of what is already live. They use it for real content changes, you watch. That gets usage data, builds trust, and gives you the numbers to answer the cost question properly.

## 6. What NOT to say

- **Do not demo or promise page-building.** It is designed and decided, not built.
- **Do not promise English or multilingual pages.** Bilingual content is out of scope and not started.
- **Do not commit to a monthly price.** No costing exists.
- **Do not claim it is fully proven in production.** The connection was verified end to end today; one part of the draft-panel data path awaits real-world use.
- **Do not promise "always available."** It currently depends on machines that are not yet on permanent infrastructure. The move is planned, not done.
- **Do not offer automatic publishing, page deletion, or settings changes.** Those are permanently excluded by design — say so with confidence, and do not soften it.
- **Do not raise advertising-account ownership unless they do.** Whether the Meta pixel sits in an account they control is genuinely open — a separate, longer conversation.
