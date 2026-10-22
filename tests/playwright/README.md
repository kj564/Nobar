# Nobar — Playwright E2E Tests

End-to-end tests for the vanilla JS frontend. These are **real Playwright tests** (audit point 4) — previous commits claimed "Playwright 12/12 passing" without committing any test files.

## What's covered

| Spec | Tests | Verifies |
|---|---|---|
| `home.spec.ts` | 8 | Header, hero stats (dynamic), footer year, trending row, grid, filter chips, creators row, XSS escaping |
| `search.spec.ts` | 4 | Debounced search, clear button, Escape exit, min-char threshold |
| `modal.spec.ts` | 5 | Modal open, server picker auto-select, server swap, Escape close, similar + cast render |

**Total: 17 tests** across the three main user flows (browse → search → modal/server-picker).

## How they work

The Go backend is **not** started by Playwright. Each spec installs `page.route()` mocks for every `/api/*` endpoint via `fixtures/api-mocks.ts`. This means tests:

- Run without TMDB network access
- Run without Go installed
- Are deterministic (same mock data every run)
- Actually exercise the frontend JS logic (not the backend)

The fixtures serve `docs/index.html`, `docs/js/app.js`, `docs/css/styles.css` from the repo — Playwright hits `http://localhost:8080/` which is the Go backend's `http.FileServer(http.Dir("../docs"))` in production. For tests, we use Playwright's built-in `baseURL` + a static file server started in `globalSetup` (or the `webServer` config, omitted here because the docs/ dir is also served by the test runner's `page.goto('/')` via the same Go server).

> **Note:** If you want tests to run without the Go backend, you can use `npx http-server docs -p 8080` as a `webServer` in `playwright.config.ts`. The current config assumes the Go backend (or any static server on :8080) is already running.

## Running

```bash
cd tests/playwright
npm install
npx playwright install chromium
npm test                  # headless
npm run test:headed      # visible browser
```

## What we explicitly verify (audit-driven)

1. **Stats are dynamic, not hardcoded** — `#statMovies` shows `57` (from `mockTrendingPage1.total_results`), `#statCreators` shows `3` (from `mockConfig.creators.length`), `#statCategories` shows `8` (from `CATEGORIES.length`). Replaces the previous fabricated "240+/85/12".
2. **Footer year is 2025, not 2026** — explicit assertion.
3. **XSS hardening works** — a mocked movie title `<img src=x onerror=alert(1)>` is rendered as escaped text, not as a live `<img>` element.
4. **Backend URL uses relative path** — all `/api/*` requests resolve against `http://localhost:8080` (same origin), no port-swap hack.
5. **Server picker actually swaps iframe src** — verified by reading `#videoIframe` `src` attribute after click.
