# Page Cloner

Live app: **https://ferchonaso13.github.io/page-cloner/**

## What it is

Page Cloner is a free, no-install tool that lets you save a copy of almost any web page straight from your browser. You paste in a page's address, click a button, and download a clean copy of that page — either as a single HTML file or as a ZIP that bundles the page together with all of its images. Everything happens inside your own browser, so there's nothing to set up and no account to create. Just open the link and go.

## How to use it

1. Open the app: **https://ferchonaso13.github.io/page-cloner/**
2. Paste the full address (URL) of the page you want to copy into the box — for example, `https://example.com/some-page`.
3. (Optional) Tick the **Download all images** checkbox if you want every image saved alongside the page.
4. Click **Clone Page** and wait a few seconds while it fetches the page.
5. When it's ready, click the download button to save your file — an **HTML file** if you left the box unticked, or a **ZIP file** if you ticked "Download all images."

That's it. Open the downloaded file anytime to view your saved page.

## The two modes

**HTML-only (box unticked)**
- You get a **single HTML file**.
- The page's text, layout, and styling are saved inside that one file.
- The **images still load from the original website**, so you'll need an internet connection to see them.
- Best when you want a quick, lightweight copy and don't mind that images come from the live site.

**ZIP (box ticked — "Download all images")**
- You get a **ZIP file** containing the page **plus a folder with every image** from it.
- It **works completely offline, forever** — open it on a plane, share it, or archive it. No internet needed.
- Best when you want a permanent, self-contained copy that will always look right even if the original site changes or goes down.

## If it doesn't work

Because of the way browsers protect you, this tool can't reach other websites directly — it passes requests through a small helper service (a "proxy"). This tool uses a dedicated, reliable proxy, so it almost always just works. If a particular page won't clone:

- **Some sites block the public helper.** If a clone fails, simply **try again** — a different helper is used automatically and often succeeds on a second attempt.
- **Big pages can be slow.** The free public helper can take a while (sometimes 20–60 seconds) for large or image-heavy pages. Give it a moment before assuming it's stuck.
- **Still no luck?** Open the **Advanced** option and paste in your own proxy address (for example, a Cloudflare Worker). This bypasses the public helpers entirely and is faster and more reliable if you have one available. If you don't have one, ask whoever set this tool up for you.

## For developers

- **Fully static** — no server, no database, no build step. The repo is just `index.html`, `css/`, `js/`, and `vendor/jszip.min.js` (JSZip, used to build the ZIP files).
- **Hosting** — GitHub Pages serves the root of the `main` branch directly. Push to `main` and it's live. A `.nojekyll` file is included so Pages serves every file verbatim.
- **Clone logic** — lives in `js/clone-core.js`. It strips tracking scripts, inlines all CSS, rewrites relative URLs to absolute, and adds a `<base>` tag. This logic was ported from the Lander dashboard's `lib/url-utils.ts`.
- **Run locally** — just open `index.html` in a browser, or serve the folder with `python3 -m http.server` and visit `http://localhost:8000`.

## Privacy

Everything runs in your browser — the only outside service touched is the CORS proxy that fetches the page you ask for. Nothing else is collected, stored, or sent anywhere.
