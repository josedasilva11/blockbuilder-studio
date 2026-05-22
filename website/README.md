# BlockBuilder Studio website

Static landing page for **blockbuilder.studio**.

## What's in here

- `index.html` — main landing (hero, features, how-it-works, principles, screenshots, use cases, download, FAQ, newsletter, footer, JSON-LD schema)
- `changelog.html` — `/changelog` route, release notes
- `robots.txt` — crawler hints
- `sitemap.xml` — single-page sitemap pointing at the anchors
- `_redirects` — Cloudflare Pages stable download URLs that proxy to GitHub Releases
- `og-cover.png` — **(not committed yet)** social preview image. Drop a 1200×630 PNG here before the first launch. The HTML already references it at `/og-cover.png`.

## Deploy on Cloudflare Pages

1. Push this folder (or the whole repo) to a Git host.
2. In Cloudflare → Pages → "Create a project" → Connect to Git.
3. Build settings:
   - **Framework preset**: None
   - **Build command**: leave empty
   - **Build output directory**: `website` (or `/` if you only deploy this folder)
4. Once the first deploy succeeds, add the custom domain `blockbuilder.studio` in Pages → Custom domains, and point the DNS at Cloudflare nameservers at your registrar.

## Updating the download buttons

Don't change the HTML. The buttons hit stable paths `/download/windows`, `/download/macos`, `/download/linux` which `_redirects` proxies to the latest GitHub Release assets. New release → tag in git, CI publishes the binaries, redirects already point at `releases/latest/download/...` so they pick up the new version automatically.

If you want a specific version pinned, edit `_redirects` and replace `latest` with the version (e.g. `v0.5.0`).

## Vanity links

`/donate` → `marjers.com/support`
`/buy` → `marjers.com/blockbuilder`
`/github` → `github.com/marjers/blockbuilder-studio`

Add more in `_redirects`.

## Newsletter

The form posts to Buttondown at `buttondown.email/api/emails/embed-subscribe/marjers`. Change the username in `index.html` if you use a different service (Mailchimp, ConvertKit, Substack all accept similar embed posts).

## Open Graph image

You need a 1200×630 PNG named `og-cover.png` at the website root so Twitter / Facebook / iMessage previews render the rich card. Suggested content: app screenshot + tagline "Offline 3D editor, no accounts, no limits" + the BlockBuilder lime mark.

Tools that work: Figma, [og-image generator](https://www.opengraph.xyz), or just a screenshot of the app + Photoshop title.

## Testing locally

```bash
cd website
python -m http.server 8000
# open http://localhost:8000
```

The `_redirects` file is ignored by Python's HTTP server. To test redirects, deploy a preview branch on Cloudflare Pages.
