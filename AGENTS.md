# AGENTS.md

## Cursor Cloud specific instructions

### What this is
Matefindr (aka `tindord.com` → `matefindr.com`) is a **Discord-themed dating/swipe web app**. It is a
**static site** — plain `index.html` / `editor.html` / `checkout.html` / `admin.html` plus `js/*.js` and
`css/app.css`. There is **no build step, no bundler, no `package.json`, and no dependencies to install**;
all third-party libs (Supabase JS, fonts, icons) load from CDNs at runtime.

The backend is a **live hosted Supabase project** (URL + anon key are hard-coded in `js/core.js`), so the
frontend talks to production Supabase directly with no local backend. The `supabase/` folder (SQL + Deno
Edge Functions) is deployed manually via the Supabase dashboard/CLI and is **not** required to run the app
locally.

### Run it (development)
Serve the repo root as static files (config lives in `.claude/launch.json`):

```
npx serve -p 8090 -L .
```

Then open `http://localhost:8090/`. `serve` redirects extensionless paths, so `/checkout.html` and
`/editor.html` 301 to `/checkout` and `/editor` — this is expected, both still load. `python3 -m http.server 8090`
also works if you prefer.

### Lint / test / build
- **No lint config, no test suite, no build.** The only automated check that exists in this repo is a JS
  syntax check: `node --check js/core.js js/landing.js js/app.js`.
- Vercel deploys the files as-is (see `vercel.json`); there is no build command.

### Beta access gate (needed before anything loads)
The app is behind a **client-side private-access gate** ("Accès privé"). On first load in a fresh browser
profile you must enter the beta password **`8090`** (defined in `index.html`) to reach the landing page. It is
remembered per device via `localStorage` (`matefindr_gate_ok`), so clearing storage re-triggers the gate.

### Testing the app locally without Discord
The primary login is Discord OAuth (`signInWithDiscord`), which needs real Discord credentials and hits the
live Supabase project. There is also a **built-in email demo login** that creates a fake local session (no
backend) and drops you into the swipe deck populated with **mock profiles** — ideal for a fully local
smoke test of core swipe/like/match functionality.

Gotcha: in the current stock `index.html`, the auth modal only renders the **Discord** button — the
"Continuer avec un email" entry button is not present, even though the email form and its submit handler in
`js/landing.js` / `js/app.js` are fully wired. To reach the email form without editing files, open the auth
modal ("Se connecter") then run in the browser console:
`document.getElementById('authCard').setAttribute('data-view','email');`
Then enter any valid-looking email + a 6+ char password and submit. (Onboarding — gender/age/looking-for —
may run the first time before the swipe deck appears.)

### Notes / gotchas
- The UI is in **French** (with an EN language switcher on the landing page).
- Landing-page floating "bubbles" only render when the viewport is ≥1000×1000px; on smaller windows the
  bubble field is hidden by design (not a bug).
- `admin.html` is a local-only tool (git-ignored from deploy via `.vercelignore`); it uses the Supabase
  `service_role` key and should never be served in production.
