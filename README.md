# Folio · Personal finance

A private, single-user finance tracker for desktop Linux and Android Chrome. React 18, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS, Recharts, and a PWA shell; Hono on Cloudflare Workers with plain SQL and D1. No signup, analytics, advertising, live prices, paid dependencies, or third-party runtime scripts.

**The app was built and verified locally, then deployed to Cloudflare with explicit owner authorization. Setup and test scripts remain local-only. See the production deployment record below.**

## Prerequisites

- Linux, Node **20.19+**, and npm **10+**. Node 22 LTS or newer is recommended. The pinned Wrangler/Miniflare versions support the requested Node 20 baseline; upgrade their versions and Workers types together when you upgrade the runtime.
- Chrome/Chromium for end-to-end tests. The configuration uses `/usr/bin/google-chrome` when installed. Otherwise run `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium`.
- An internet connection for the initial npm install. Local development requires neither a Cloudflare login nor Cloudflare credentials.

## Run locally

From this repository root:

```sh
npm ci
npm run local:init
npm run db:migrate:local
npm run dev
```

Open **http://localhost:5179**. On the first visit, set your own password (12–128 characters). There is no default password or pre-created user. Use `localhost` consistently: the configured origin is `http://localhost:5179`, and cookies belong to that host. Vite proxies `/api` to the Worker at `127.0.0.1:8787`.

Development and preview bind to `localhost` so the printed browser URL matches `APP_ORIGIN`. Opening `http://127.0.0.1:5179` instead uses a different origin and setup/login writes return 403. Open the `localhost` URL to resolve this. The Worker's local configuration comes from `apps/api/.dev.vars`, not the repository-root `.env`.

`local:init` creates `apps/api/.dev.vars` with a random 48-byte session secret and mode `0600`. It leaves an existing environment untouched. The example is [apps/api/.dev.vars.example](apps/api/.dev.vars.example). Secret values must never be committed. Vite has no secrets; `VITE_API_BASE` optionally changes the **same-origin path** from `/api/v1`. Cross-origin API URLs are intentionally rejected so session and CSRF behavior stays predictable.

For a demo, before entering any real records:

```sh
npm run db:seed:local
```

The seed adds four accounts, three months of transactions, a loan, three holdings with entries and valuation history, a goal, and budgets. It does not create a password. It refuses to seed if finance records already exist. Demo data is inserted into local D1 only.

To start fresh, **stop the dev server and export anything you want to keep first**:

```sh
npm run db:reset:local
# Optional, only if you want another demo:
npm run db:seed:local
npm run dev
```

Reset permanently removes the dedicated `apps/api/.wrangler/state` directory, including the local password and sessions, and reapplies migrations. It cannot target a remote database. An E2E reset uses a separate `.local/e2e-d1` directory and never resets your development data.

If you change the web port, update `APP_ORIGIN` in `.dev.vars` and `wrangler.toml`, and the Vite port in `apps/web/vite.config.ts`. `API_PROXY_PORT` can override the local proxy target port. Do not run a second server on occupied ports.

## What you can do

- **Overview:** select a month; see INR net worth, income, expenses, savings rate, loan outstanding, investment profit and return, and four charts. Recent activity and goal progress sit alongside the summaries.
- **Transactions:** quick add income/expense/transfers; edit and delete; search notes, tags, or category; filter by dates, account, category, and type; paginate and export CSV. Transfers update both account balances and never enter income/expense totals.
- **Accounts:** bank/current, savings, cash, investment cash, and loan; opening balances and currency; edit, archive, restore. Referenced accounts cannot be deleted. Archived accounts retain their history and balances.
- **Loans:** principal, annual rate, tenure, lender, start date, automatic or custom EMI; amortization, progress, remaining payments, and principal/interest totals; record EMI payments and prepayments. Each creates a linked expense transaction. Remove newer payments first when correcting history. A database trigger prevents concurrent repayments from using stale allocations.
- **Investments:** stocks, funds, deposits, gold, crypto, and other assets; optional units; multiple buys/top-ups and sales/withdrawals; manual valuations with retained history, profit, return, XIRR, and a chart.
- **Goals:** target amount/date, a linked INR savings account or dated manual contributions, progress and monthly saving estimate. Contributions have removable history.
- **Budgets:** one INR monthly limit per expense category, progress, remaining allowance, and over-budget indicators.
- **Reports:** monthly/yearly income, expenses, net savings, category breakdowns, charts and date-filtered CSV exports.
- **Settings:** system/light/dark theme; change password; log out everywhere; add, rename, archive, and restore categories; JSON backups and CSV imports.

The UI includes loading/error/empty states, labeled controls, keyboard-operable native dialogs, destructive-action confirmations, a desktop sidebar, and mobile bottom navigation. There are no external fonts or image dependencies.

## Money, dates, and accounting decisions

- API and database amounts are **integer minor units**. `10000` means ₹100.00 in INR. Currency text is parsed with string operations and `BigInt`; currency decimals are never multiplied as floating-point numbers. The maximum individual amount is 1,000,000,000,000 minor units. Rate fields use integer basis points (850 = 8.50% annually). Units use decimal strings.
- `Intl.NumberFormat('en-IN', {style:'currency', currency})` handles display. Floating-point arithmetic is used only for dimensionless percentages, chart coordinates, and the XIRR numerical solver, not stored monetary amounts or loan allocation.
- The account balance function is opening balance plus income, minus expenses and outgoing transfers, plus incoming transfers. It is unit tested. Loans are liabilities based on original principal minus recorded principal payments, not ordinary account balances.
- Net-worth history treats an opening balance as effective on account creation or the first backdated transaction, whichever is earlier. Loan liabilities start on their configured start date. The combined absolute monetary magnitude is bounded to JavaScript's safe integer range so aggregate sums stay exact.
- Transactions use real calendar `YYYY-MM-DD` dates; metadata uses UTC ISO timestamps. A date-only value is displayed as the same local calendar day. Quick add defaults to the browser's local date. Future-dated transactions are recorded but excluded from the dashboard until their date arrives.
- Dashboard/report base currency is **INR**; no exchange rates are invented. Accounts support currencies with two decimal minor units, including INR, USD, EUR and GBP; zero/three-decimal currencies are rejected to preserve the fixed paise precision contract. Other currency accounts show their own currency in Accounts and Transactions. Transfers and loan payments must use matching currencies. Portfolio holdings, manual goals, and budgets use INR. Other currency liabilities/assets are excluded from INR summaries.
- Investment holdings and investment-account cash are **separate assets**. Buy/sell entries track the portfolio and do not automatically move bank cash. Record a corresponding account expense/income yourself when the portfolio movement also changes a tracked cash balance, so the same money is not counted twice. Net invested = buys minus sell proceeds; profit = latest value minus net invested. Return percentage is undefined for a zero/negative net investment. A missing valuation initially has value zero; record a valuation to make totals meaningful.
- XIRR uses dated purchases as negative flows, sales as positive flows, and the final valuation as the terminal positive flow. It uses actual elapsed days / 365, Newton–Raphson and a bracketed bisection fallback. No sign change, a zero-day span, or no solved root returns `null`. Nonconventional flows can have multiple mathematical roots. Cash flows newer than the last valuation are excluded from XIRR and flagged as needing a fresh valuation.
- Amortization is monthly reducing-balance interest rounded half-up to paise, with a smaller final payment when needed. Each recorded EMI accrues **one month** of interest on the actual outstanding balance; prepayments apply entirely to principal. This is not a lender's daily-interest/fee engine. A prepayment moves the forecast to the next original monthly due date after the last recorded payment. Remaining tenure is the number of forecast payments, even if it differs from the original tenure. Original terms become immutable once payments exist.
- A linked savings goal follows the entire linked account balance. Manual contributions track progress but do not create extra assets or move account cash. Monthly required saving divides the remaining amount across the rounded-up number of 30.4375-day months left; past-due targets use one month.
- EMI expenses include principal and interest as cash outflow; outstanding debt decreases by principal. Loan creation records a liability and does not automatically record loan proceeds into a bank account. Record any actual disbursal in the account separately.

## Security and offline behavior

- Single-row user table makes first-run setup one-time, including under concurrent requests. Passwords use salted WebCrypto PBKDF2-SHA-256: six sequential, domain-separated 100,000-iteration rounds. This keeps each call within Workers' per-call PBKDF2 limit while requiring 600,000 rounds of sequential PBKDF2 work. Hashes store their algorithm/cost and per-password 24-byte random salt.
- Opaque random session tokens are HMAC signed; only SHA-256 token hashes are stored in D1. Production uses a `__Host-` HttpOnly, Secure, SameSite=Strict cookie with no Domain attribute. Local HTTP development deliberately omits Secure. Sessions slide for seven days, refresh at most hourly, and have a hard 30-day maximum. Logout, logout everywhere, expiry, and password changes revoke sessions server-side.
- Five invalid passwords in a 15-minute window lock the client IP's keyed hash for 15 minutes. Password-change failures use the same limiter. D1 stores attempts, never raw IPs or passwords.
- All routes except status/setup/login require a session, including export/import and mutations under `/auth`. Writes require JSON plus `X-Finance-Client: web`; supplied Origins must exactly match `APP_ORIGIN`. Cross-origin access is not enabled.
- API responses and exports use `Cache-Control: no-store`. Static Pages headers provide CSP, nosniff, frame denial, referrer policy, and disabled camera/microphone/geolocation. The Worker provides defensive API headers and production HSTS. There is no request/body/financial-data logger in app code. The local wrapper disables Wrangler telemetry and discards its inspector debug log through a `/dev/null` symlink, because Wrangler can otherwise record D1 responses.
- The service worker precaches only the app shell/assets. It neither caches API responses nor queues financial writes. Already-loaded data remains readable while offline, with a banner and blocked writes. Reloading offline shows the shell and a connect-to-sign-in message; financial records are not persisted in browser storage. Theme preference is the only localStorage entry.
- Production HTTPS is required for Android installation and Secure cookies. After the first online visit, use Chrome's **Install app** action. The manifest includes standalone display, theme/background colors, and 192/512/maskable PNG icons. Updates prompt before reloading.

There is intentionally no email reset, external identity provider, recovery backdoor, shared access, or multi-tenancy. Keep your password and backups safe. If the password is lost, the database owner must back up the database and perform an explicit administrative credential reset; importing a finance backup into a fresh workspace does not restore the old password.

## Backups and imports

Export JSON from Settings weekly and before major edits. Store several dated copies in a private/encrypted location you control. These files are **unencrypted** and include financial information; passwords, sessions, and login-attempt records are excluded.

For a restore drill, import into a separate local workspace first and check totals and representative records. Never reset the only copy of your real data. Database-level backup/restore is independent of the app export, so use D1's native recovery/export facilities as an additional production safeguard.

JSON exports have `{version:1, exported_at, data}`. Import validates all Zod schemas, IDs, references, category types, currency relationships, and loan allocations before committing an **atomic D1 batch**. Replace deletes financial tables first, preserving authentication; merge overwrites matching IDs and retains other records. Duplicate names/unique budgets can conflict even when IDs differ; review the error and reconcile records rather than silently dropping them. Imports cannot partially commit. Newly merged loan payments must be chronological relative to existing payments.

Files are limited to 20 MB, with explicit per-table schema bounds (50,000 transactions, 20,000 valuations, 10,000 entries/payments/contributions/budgets, and 2,000 accounts/categories/holdings/goals). Bulk JSON inserts use chunks below D1's 2 MB bound-value limit. These limits suit a single-user dataset; larger archives require a deliberate database migration/import process.

CSV import allows up to 500 rows per operation. Map the columns and preview before typing `IMPORT`. Account/category names (case insensitive) or IDs must already exist. Duplicate CSV imports add duplicate rows; they do not merge. Blank `to_account`, `note`, or `tags` mappings are optional. Tags are `|` separated in CSV and comma separated in the entry form. All rows save together or none do.

```csv
date,type,amount,account,to_account,category,note,tags
2026-10-01,income,125000.00,Everyday account,,Salary,Monthly salary,work
2026-10-02,expense,845.50,Everyday account,,Food,Groceries,home|essentials
2026-10-03,transfer,5000.00,Everyday account,Rainy day fund,,Monthly savings,
```

Exported CSV quotes/escapes fields and prefixes potentially executable spreadsheet formulas. This protects spreadsheet viewing; use JSON for an exact full-fidelity round trip, especially for notes beginning with `=`, `+`, `-`, or `@`.

## Commands and verification

```sh
npm run lint          # ESLint and Prettier check
npm run typecheck     # API, frontend, shared code, tests/configs
npm test              # finance calculations, crypto, and D1-backed API integration
npm run test:e2e      # isolated local D1 + production preview + Chrome
npm run build         # type check and production web/PWA build
npm run format        # apply consistent formatting
```

E2E runs on ports **5174/8788**, resets only `.local/e2e-d1`, and creates a disposable test password. It verifies first-run setup/login, account creation, income/expense/balance, loan schedule/prepayment, investment buy/valuation/return, JSON round trip, CSV mapping, mobile navigation, themes, goals, and offline shell. Chrome runs headlessly with `--no-sandbox` for container compatibility; remove that launch argument on a workstation that supports Chrome's sandbox. Playwright traces/screenshots contain disposable test records and are gitignored.

The production frontend output is `apps/web/dist`, including `manifest.webmanifest`, `sw.js`, Workbox, local icons and bundled assets. Serve that output for PWA verification; development mode deliberately does not install a service worker. For a local production preview while the local API is running:

```sh
npm run build
npm run preview -w apps/web
```

Verified locally on **21 October 2026** with Node 25.9.0, npm 11.12.1 and headless Chrome:

- Local D1 migrations and realistic demo seed completed; the Vite/Worker dev servers returned HTTP 200. Development data retains first-run password setup for you.
- **33 unit/API tests passed**, including a 4,500-transaction backup round trip and concurrent loan-overpayment rollback.
- **7 Playwright tests passed** against the production build, covering all workflows listed above plus budget warnings and monthly/yearly reports.
- ESLint, Prettier, TypeScript and the production build passed. The manifest, service worker, bundled Workbox and all icon sizes were generated.
- `npm audit --omit=dev` reported **zero runtime dependency vulnerabilities**.
- Desktop light and 390 px mobile dark screenshots were visually reviewed; charts rendered and no horizontal page overflow was found. Screenshots are regenerated by E2E in `.local/qa/`.

No real Cloudflare account, production route, remote D1 migration or deployment was used. A physical Android installation and production cookie/routing checks remain owner verification steps after manual deployment.

## Project layout

```text
apps/api/src/           Hono routes, authentication, validated accounting/report logic
apps/api/migrations/    Ordered SQL schema and concurrency guard
apps/api/tests/         Miniflare D1-backed API and password tests
apps/api/wrangler.toml  Local binding plus clearly marked production placeholders
apps/web/src/           React routes, forms, charts, navigation, offline UI
apps/web/public/        PWA icons, Pages security headers, SPA redirects
packages/shared/src/   Zod contracts, exact money and finance math, unit tests
scripts/               Local-only initialization, database/demo tools, test server
tests/e2e/             Playwright user journeys against the production build
```

## REST API reference

All paths below are under `/api/v1`. JSON errors are `{error:{code,message,details?}}`. POST/PUT inputs reject unknown fields. POST creates, PUT replaces an editable resource, DELETE requires a JSON `{}` body. Created rows include an ID and UTC `created_at`. Responses keep amounts as integer minor units. Lists accept `page` (default 1) and `limit` (default 50, maximum 1000) and return `{data,total,page,limit}`.

| Resource     | Routes                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | `GET /auth/status`; `POST /auth/setup`, `/auth/login`, `/auth/logout`, `/auth/logout-all`, `/auth/password`                                                         |
| Accounts     | `GET/POST /accounts`; `PUT/DELETE /accounts/:id`                                                                                                                    |
| Categories   | `GET/POST /categories`; `PUT/DELETE /categories/:id`                                                                                                                |
| Transactions | `GET/POST /transactions`; `PUT/DELETE /transactions/:id`; filters `from,to,account_id,category_id,type,search`                                                      |
| Loans        | `GET/POST /loans`; `GET /loans/:id`, `/loans/:id/schedule`; `POST /loans/:id/payments`; `DELETE /loans/:id/payments/:paymentId`; edit terms through Accounts        |
| Investments  | `GET/POST /investments`; `GET/PUT/DELETE /investments/:id`; `GET/POST /investments/:id/entries`, `/investments/:id/valuations`; `DELETE` each detail at `/:childId` |
| Goals        | `GET/POST /goals`; `PUT/DELETE /goals/:id`; `GET/POST /goals/:id/contributions`; `DELETE /goals/:id/contributions/:childId`                                         |
| Budgets      | `GET/POST /budgets`; `PUT/DELETE /budgets/:id`                                                                                                                      |
| Reports      | `GET /overview?month=YYYY-MM&today=YYYY-MM-DD`; `GET /reports?year=YYYY&month=YYYY-MM` (month optional)                                                             |
| Portability  | `GET /export`, `/export/transactions.csv`; `POST /import`, `/import/csv`                                                                                            |
| Workspace    | `GET /snapshot` returns the credential-free finance dataset used by the single-user UI                                                                              |

The snapshot and report implementation loads the bounded personal dataset in a D1 batch for consistent calculations. List responses are paginated, but filtering occurs in the Worker. This favors auditable shared arithmetic over high-volume/server-side analytics. Very large datasets may reach Workers free-tier CPU/memory/read quotas before schema limits. There is no paid plan requirement or automatic paid resource creation.

## Cloudflare production deployment

### Automatic deployment from GitHub

[GitHub Actions](https://github.com/GuruRaj0305/fin-man/actions/workflows/ci-cd.yml) validates every push to `main` and pull request targeting `main`. It installs locked dependencies with Node 22, runs lint/format checks, all unit/API tests, the production build, and Chromium end-to-end tests against an isolated local database. Pull requests run without production credentials.

After validation, a push to `main` deploys the verified frontend artifact and matching API source to the existing Cloudflare account. The workflow applies pending D1 migrations, deploys `folio-finance-api`, and deploys the `folio-finance` Pages project on its production `main` branch. It checks the live home page, PWA manifest, service worker, authentication status, and unauthenticated accounts response at **https://fin.gururajhr.in**. It neither signs in nor changes financial records during those checks.

One-time repository settings:

1. Add the GitHub Actions **secret** `CLOUDFLARE_API_TOKEN`. Create a custom Cloudflare API token restricted to account `fc65d3b2976d5bfd2111ba4aa7c38d73`, with **Account Settings: Read**, **Cloudflare Pages: Edit**, **Workers Scripts: Edit**, and **D1: Edit**. Store it through the repository's Actions settings or the hidden prompt from `gh secret set CLOUDFLARE_API_TOKEN --repo GuruRaj0305/fin-man`; never commit it.
2. Add the GitHub Actions **variable** `CLOUDFLARE_ACCOUNT_ID` with value `fc65d3b2976d5bfd2111ba4aa7c38d73`.
3. Keep the existing Cloudflare Worker `SESSION_SECRET` in Cloudflare's secret store. CI does not need its value, and ordinary Worker deployments preserve it.

Production deployments use the GitHub `production` environment and run one at a time without cancelling an active migration/deployment. An older run skips deployment if a newer `main` commit exists when its deployment starts. The workflow can also be started from **Actions → CI and production deployment → Run workflow**, choosing `main`.

Schema, API, and frontend changes are applied sequentially. Use additive, backward-compatible migrations that work with the running API and older cached clients; a later deployment failure leaves earlier steps applied. Investigate failed runs in Actions, fix the cause, and rerun or push the correction. Browser-failure reports contain only disposable local test data and expire after seven days; production database exports are never uploaded as workflow artifacts.

Run the same anonymous production checks manually with `npm run smoke:production`. See [Cloudflare's CI authentication guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) and [Pages Direct Upload CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) for credential setup.

### Deployment architecture and history

This app retains its Pages frontend and separate Hono API Worker. The Pages Function at `functions/api/[[path]].ts` forwards `/api/*` to the `API` service binding, preserving the public URL, Origin, session cookies and security headers. Static assets and the PWA shell remain on Pages. No separate API hostname or Worker route is needed.

Deployment completed on **21 October 2026**:

- Stable URL: **https://folio-finance.pages.dev**.
- Immutable deployment URL: **https://89685418.folio-finance.pages.dev**; Cloudflare reports production deployment status **success**.
- API Worker version: **398a80a8-596a-4460-b6ac-b5b980303895**. The Worker is reached through the Pages service binding, with `workers_dev=false`.
- Created resources: the `folio-finance` D1 database, `folio-finance-api` Worker with its independently generated `SESSION_SECRET`, and `folio-finance` Pages project. The preflight confirmed these names did not already exist. No existing unrelated Cloudflare resource was overwritten.
- Both SQL migrations applied remotely. A read-only `sqlite_master` query confirmed all application tables. No demo or reset script ran remotely.
- Production build, TypeScript, ESLint and Prettier passed; **35 unit/API/proxy tests passed**.
- Anonymous curl smoke checks: `/`, `/manifest.webmanifest`, `/sw.js`, and `/api/v1/auth/status` returned **200**; `/api/v1/accounts` returned **401** with the expected JSON error. The manifest is standalone and the service worker includes its precache.
- First-run status remained `needs_setup=true`, `authenticated=false`. No production login password or session was created.
- `fin.gururajhr.in` is registered as a Pages custom domain. After redeployment, Cloudflare reports **pending** validation and verification with **CNAME record not set**. The logged-in account still does not list a `gururajhr.in` zone; no DNS records were changed. Follow the custom-domain instructions below. Password setup and browser writes are configured for **https://fin.gururajhr.in**.
- The custom-domain update preserved the existing production origin, host-only Secure/HttpOnly/SameSite=Strict cookies, and relative API path. TypeScript and the production/PWA build passed again, and both the API Worker and Pages frontend were redeployed successfully.

The D1 placeholder was replaced in the single existing binding, following the repository's documented convention. No commit was created. Production secret values and authentication tokens were neither printed nor written to project files.

- API Worker: **folio-finance-api**, configured in `apps/api/wrangler.toml`.
- D1 database: **folio-finance**, bound as **DB**. The original placeholder in the single existing binding has been replaced with the actual production resource identifier, following this README's original replacement convention. The identifier is not a secret; no credentials belong in the configuration.
- Pages project: **folio-finance**, configured in `apps/web/wrangler.toml`, output `apps/web/dist`, production branch **main**.
- Production origin: **https://fin.gururajhr.in**, with `ENVIRONMENT=production`. The frontend API base remains the relative path **/api/v1**. Session cookies are `__Host-folio_session`, Secure, HttpOnly, SameSite=Strict, Path `/`, with no Domain.
- Required secret: **SESSION_SECRET**, stored only in the API Worker's secret store. It must be independently generated and piped to `wrangler secret put`; do not reuse development values or store the production value in local files.
- Future Pages preview branches intentionally have **no API service binding**, so they cannot use production financial records. Configure an isolated staging API before enabling preview functionality.

Local development continues to use `apps/api/.dev.vars` and `--local`. Updating the D1 resource ID changes the local binding identity; retain a backup of any existing local records before changing local database configuration. The production migration process never uploads the local demo database.

After verifying the intended account with `npx wrangler whoami`, production maintenance commands are:

```sh
# Repository root: build and verify first.
npm run build
npm run lint
npm test

# API directory: schema migration and API deployment.
cd apps/api
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy

# Web directory: deploy only the compiled output, with the API service binding.
cd ../web
npx wrangler pages deploy dist --project-name folio-finance --branch main
```

Never run `db:seed:local`, `db:reset:local`, or demo SQL against a remote database. The migrations include only schema, indexes, a loan-payment guard, and the required default categories. They do not set a login password.

### Finish fin.gururajhr.in DNS validation

The hostname has already been registered with the `folio-finance` Pages project through Cloudflare's Pages custom-domain API. A Workers `custom_domain` route is intentionally absent: this repository serves its frontend through Pages and uses the API Worker only through a service binding. The logged-in account does not list the DNS zone, and Cloudflare reports **CNAME record not set**. DNS has not been changed.

1. In Cloudflare, open **Workers & Pages → folio-finance → Custom domains → fin.gururajhr.in** and review its DNS instructions. Do not register the hostname a second time.
2. Switch to the Cloudflare account that manages the active **gururajhr.in** zone, then open **DNS → Records → Add record**.
3. Add a **CNAME** with name **fin** and target **folio-finance.pages.dev**, unless the Pages dashboard returns a different canonical target. Do not overwrite an existing record without reviewing its purpose. If it conflicts, resolve it yourself before continuing. For external authoritative DNS, add the equivalent record there instead.
4. Wait for the Pages custom domain and its HTTPS certificate to show **Active**, then verify the home page, `/manifest.webmanifest`, `/sw.js`, `/api/v1/auth/status`, and an unauthenticated `/api/v1/accounts` response (401).
5. Open **https://fin.gururajhr.in** and set your own password on the first-run screen. No deployment command creates your password.

Because this is a **subdomain** on Pages and `/api/*` uses a service binding, `gururajhr.in` does **not** first have to become an active Cloudflare DNS zone. External DNS with the correct CNAME is supported. An apex Pages domain or the previous optional Worker-route approach would require the corresponding Cloudflare zone setup. See [Cloudflare's custom-domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/) and [Pages service bindings](https://developers.cloudflare.com/pages/functions/bindings/).

The `*.pages.dev` deployment can serve the shell and read-only authentication checks, but browser writes intentionally require the configured custom origin. Use **fin.gururajhr.in** for password setup and normal use; do not weaken the origin check for a preview URL.

### Remote database backup

Run from `apps/api`, choosing a private filename that does not already exist:

```sh
npx wrangler d1 export DB --remote --output=../../.local/folio-finance-production-backup.sql
```

This exports schema and data, including credential/session tables, into a sensitive SQL backup. Store it privately and outside version control. The app's JSON export remains the credential-free portability format. Neither backup command nor a restore has been run during deployment.
