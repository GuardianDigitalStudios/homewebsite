# Guardian Digital Studios — company site

## What this repo is

**guardiandigitalstudios.com**: the studio's own site. A landing page, a privacy
policy, a terms of service, and an internal design system. Three public pages,
one stylesheet, one script, no build step.

It is not either of the other two:

| Repo | Domain | What it is |
|---|---|---|
| `homewebsite` (here) | guardiandigitalstudios.com | The studio |
| `commander-index` | commander-index.com | The product's site and its shop |
| `commander-index-app` | n/a | The Flutter app, the database, the ADR log |

The **decision log lives in the app repo**, at
[`docs/adr/`](https://github.com/GuardianDigitalStudios/commander-index-app/blob/main/docs/adr/README.md).
That log is authoritative for anything foundational. Add a record there, not here.

## Stack

Plain HTML, CSS and JS on Cloudflare Pages. No framework, no bundler, no
toolchain. Anything needing compilation is a new toolchain, which is the thing
this deliberately does not have.

## The trap that bites first

**The CSP in `_headers` sets `style-src 'self'` with no `'unsafe-inline'`.**
`<style>` blocks and `style="..."` attributes are silently dropped by the
browser in production. They work perfectly over `file://` and on
`python3 -m http.server`, because neither applies `_headers`.

Everything visual goes in `styles.css`. The footer wordmark once shipped
invisible for exactly this reason. `styles.css` repeats this warning at the top
of the file; it is repeated here because the file you are editing may not be
that one.

## Running

```bash
just start     # → http://localhost:8000   (or: python3 -m http.server 8000)
just check     # → node scripts/sanity-check.mjs
just hooks     # → once per clone, makes `check` run on every commit
```

`scripts/sanity-check.mjs` parses every JS file and inline `<script>`, resolves
every local `script`/`link`/`href`, and verifies every `onclick` names a function
that exists. It is shared near-verbatim with `commander-index`; fix a bug in one
and carry it across. Bypass the hook for a single commit with
`git commit --no-verify`.

There is **no CI**. The hook is the only gate.

## design-system/

Eleven component and foundation preview pages plus a manifest and an inventory
stylesheet. Internal. It is the reference for how the site is built.

Cloudflare Pages deploys the repo root, so this **was live and crawlable** in
production. It is now excluded by two mechanisms:

- `_redirects` 301s `/design-system/*` to `/`
- `_headers` marks the same path `noindex, nofollow`

Both, because a static asset can be resolved ahead of a redirect rule for a path
that exists. **`robots.txt` deliberately does not `Disallow` it**: a `Disallow`
stops the crawler fetching the URL, so it would never see either signal and
anything already indexed would stay. Do not "fix" that.

The lint does **not** skip `design-system/`. Those pages are checked like any
other, because a preview pointing at a stylesheet that moved is exactly the rot
worth catching. Excluded from the deploy, not from the check.

## Conventions

- **No kickers.** A small label above a heading that restates the heading costs
  a row and says nothing. "Our products" sat above "What we make" until it did
  not. The hero's "Kensington, Maryland" stamp is the exception: it labels a
  rule line rather than repeating the heading under it.
- **Say it once.** "A game of our own is in early development" was on the
  landing page three times, twice within two lines of itself.
- **State facts, not judgements or promises.** "Free, in full" became "No paid
  features". "Mail gets answered / every message is read, and you will get a
  reply" became "Contact", with the address and a plain sentence.
- **Heading levels are levels, not sizes.** The value cards were `h4` because
  19px looked right, which skipped `h3` under the section's `h2`. Set the size
  in CSS (`.value h3{font-size:var(--step-1)}`) and use the correct tag.
- **Contact is `hello@guardiandigitalstudios.com`.** Never a personal address.

## Two things measured the hard way

- **A long unbreakable string sets a grid's minimum width.**
  `hello@guardiandigitalstudios.com` is 240px with no break opportunity, which
  made value card 04's min-content 244px, which made *every* card 310px once
  `.values` collapsed to one column, which scrolled the page sideways on
  anything under 334px. The fix is `overflow-wrap:anywhere`, and it has to be
  `anywhere` rather than `break-word`, because only `anywhere` feeds back into
  intrinsic sizing.
- **Do not measure a transitioning property in the tick you change it.**
  `max-height` on the mobile menu reads `0px` immediately after the class is
  added, because that is the animation's first frame. The menu was reported
  broken twice on that basis and was working the whole time. Disable
  transitions, or wait, before believing a computed value.
