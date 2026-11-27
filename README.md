# StarShooter — HKDSE study desk

A private study dashboard for Hong Kong DSE candidates: a fifteen-year past
paper matrix, a focus timer that logs itself, SBA deadlines, target vs.
predicted levels, and a live countdown to the written papers.

- **Frontend:** plain HTML, CSS and ES modules — no build step, no framework.
- **API:** one Vercel Node function (`api/index.js`) sharing a router at
  `server/routes.js`.
- **Database:** MongoDB Atlas free tier (M0, 512 MB, no card).
- **Hosting:** Vercel Hobby (free).
- **Android:** a thin WebView shell in `android/`, built to a signed APK.

Cost at this scale is **$0/month** for all of it.

---

## What is in the box

```
api/index.js          Vercel function; adapts Web or Node requests to the router
server/routes.js      every endpoint, validation and status code
server/store.js       MongoDB queries, all scoped by userId
server/db.js          cached client + index creation
server/util.js        PBKDF2 hashing, cookie helpers, validation, subject catalog

public/index.html     the single page
public/styles.css     all styling, light and dark
public/app.js         shell, router, view rendering
public/main.js        boot, service worker, Android hooks
public/actions.js     every click handler, and all dialogs
public/auth.js        sign in, create account, recovery-code reset
public/lib.js         shared helpers, API client, grading, modal
public/cutoffs.js     reads the published boundaries, per paper and per year
public/timer.js       timer state machine, persists across navigation
public/native.js      the Android shell hooks (no-op in a browser)
public/views/         desk, papers, focus, tasks, settings
public/data/cutoffs.json   published DSE boundaries, regenerated yearly
public/manifest.webmanifest  installable-app metadata
public/sw.js          service worker: offline shell, never caches /api
public/fonts/         IBM Plex Sans, Plex Mono, Newsreader (self-hosted)
public/icons/         home-screen icons (192, 512, maskable 512)

android/              the APK wrapper: manifest, one activity, build script
scripts/init-db.js    creates Atlas collections, validators and indexes
scripts/fetch-cutoffs.mjs  refreshes the published boundaries from DSE00
schema.sql            equivalent Postgres/Supabase schema with RLS policies
docs/schema.md        data model and isolation model
test/isolation.test.js     41 API checks, including cross-account attempts
test/ui.test.mjs           61 browser-level checks
test/cutoffs.test.mjs      9 grading checks
test/native.test.mjs       6 Android-shell checks
```

---

## Run it locally

```bash
npm install
cat > .env.local <<'EOF'
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
EOF
npx vercel dev                 # http://localhost:3000
```

`vercel dev` serves `public/` and runs the API function. `.env.local` is
git-ignored; there is no `.env.example` to copy, so write the file directly.

To check behaviour without a database:

```bash
npm run check                        # syntax check the server files
npm run test                         # 41 isolation checks, in-memory store
node test/cutoffs.test.mjs           # 9 grading checks
npm run test:ui                      # 61 UI checks
npm run test:native                  # 6 Android-shell checks
```

`npm install` is enough — jsdom ships as a regular dependency so the two
browser-level suites run without extra setup. If `node_modules` is missing they
print `skipped` and exit 0, which looks like a pass. Read the check count, not
just the exit code.

---

## Five steps to a live site

### 1. Create the free Atlas cluster

1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas/register)
   — no card required.
2. Create a **Free (M0)** cluster.
3. **Database Access → Add New Database User.** Use a strong password and
   *Autogenerate* it; save it somewhere safe.
4. **Network Access → Add IP Address → Allow access from anywhere**
   (`0.0.0.0/0`). Vercel functions have no fixed egress IP, so this is required.
   The database user's password is still the access control.
5. **Connect → Drivers** and copy the `mongodb+srv://…` string, substituting the
   real password for `<db_password>`.

### 2. Create the collections and indexes

```bash
MONGODB_URI="mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority" \
  node scripts/init-db.js
```

Collections are also created lazily on first use, but this step adds schema
validators and surfaces connection problems immediately.

### 3. Put the code in Git

```bash
git init
git add .
git commit -m "StarShooter — HKDSE study desk"
```

`.env`, `.env.local` and `.vercel/` are git-ignored. Never commit the
connection string.

### 4. Deploy on Vercel

The API is one function at `api/index.js`, served at `/api`. The browser sends
the route in a query string (`/api?__p=me`), so the project does not depend on
bracket-named catch-all routes or on `vercel.json` rewrites. `vercel.json`
contains only `outputDirectory`, which keeps it valid.

**Do not use Vercel Drop for this project.** A drag-and-drop upload serves the
files as a static site only, so `/api` is never registered and everything
returns 404.

**Option A — GitHub import**

1. Push the repository to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo.
3. Framework preset: **Other**. Build command: leave empty. Output directory:
   `public`.
4. **Settings → Environment Variables** → add `MONGODB_URI` for Production,
   Preview and Development. Optionally add `MONGODB_DB` (defaults to
   `hkdse_desk`).
5. Deploy.

**Option B — CLI**

```bash
npx vercel --prod
```

Answer the prompts, then add `MONGODB_URI` in the dashboard and redeploy.

**Option C — you already deployed with Drop**

1. Push the folder to GitHub (or use the CLI).
2. Connect the repository to the existing Vercel project:
   **Project → Settings → Git → Connect Git Repository**.
3. Add `MONGODB_URI`, then redeploy.

The project URL stays the same.

### 5. Check the live site

1. Open `https://YOUR-PROJECT.vercel.app/api`. It should return
   `{"ok":true,"function":"running","database":"configured"}`.
   - A 404 means the API function was not deployed — check that the `api/`
     folder is at the repository root.
   - `"database":"missing MONGODB_URI"` means the function is live but the
     environment variable is absent for that environment. Add it, then redeploy.
2. Open the site itself.
3. Create an account, and save the recovery code shown once.
4. Log one past paper and run a short focus block; both should survive a reload.
5. Reload in a private window and sign in — the same records should appear.

If a request fails with *"Something went wrong on the server"*, open the Vercel
deployment's **Functions → Logs**. Atlas connection failures, IP allow-list
problems and a wrong password all appear there.

---

## The Android app

`android/` is a WebView shell around the deployed site. It contains no copy of
the app and no credentials, so **the MongoDB URI never leaves Vercel** and a
redeploy updates the installed app.

```bash
ANDROID_SDK=/path/to/sdk ./android/build.sh   # writes android/StarShooter.apk
```

Needs a JDK 17 and Android SDK build-tools 34 + platform 34. No Gradle, no
Android Studio. Full notes, including how to change the URL, are in
[android/README.md](android/README.md).

| | |
|---|---|
| Size | ~50 KB |
| Android | 7.0 (API 24) and newer |
| Keys to configure | none |
| Update path | redeploy the site, or rebuild the APK for shell changes |

**Keep `android/keystore.jks`.** Android only installs an update over an
existing app when it is signed with the same key. Losing it means users must
uninstall before installing a newer build.

Inside the app, the back gesture walks the app's screens first, the session
survives cold starts, and the recovery code and JSON export are written to
Downloads — a WebView cannot follow those in-memory links on its own.

---

## Security notes

- Passwords are hashed with PBKDF2-SHA256 at 210,000 iterations; plaintext is
  never stored or logged.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Secure`, and the token is
  stored only as a SHA-256 hash. Sessions last 30 days.
- State-changing requests must be JSON and same-origin (CSRF guard).
- Every query is scoped by the session's `userId`. Foreign ids return `403` or
  `404`, never another student's data.
- Deleting an account removes its subjects, papers, sessions, tasks and logs.
- **Rotate any password that has been pasted into a chat, issue tracker or
  commit.** Atlas → Database Access → Edit user → Autogenerate.

Atlas has no row-level security. Isolation is enforced in `server/store.js` and
verified by `test/isolation.test.js`. If you prefer database-enforced RLS,
`schema.sql` has the Postgres/Supabase equivalent with policies and a sign-up
trigger.

---

## Grading

The app grades against **published DSE figures only** — there is no way for a
student to set their own boundaries.

- Boundaries live in `public/data/cutoffs.json`, generated from
  [DSE00's cut-off tables](https://www.dse00.com/p/core-cutoff.html) by
  `scripts/fetch-cutoffs.mjs`. Run `npm run cutoffs` after each year's results
  to refresh them; it keeps five sittings of history per subject and per paper.
- The panel shows the **mean of the last five sittings**, and prefers a paper's
  own boundaries where the source publishes them. Chinese marks its papers out
  of different totals, so a Paper 1 script graded on a subject-wide blend would
  read several percent too harsh.
- All six levels are shown, highest first: `5** 5* 5 4 3 2`.
- Other papers — school mocks, textbooks, practice papers — have no published
  boundaries, so the grade is entered by hand.

---

## HKDSE details baked in

- Four core subjects are created on sign-up: Chinese Language, English Language,
  Mathematics, Citizenship & Social Development. Names are English throughout.
- Paper columns follow each subject: Chinese `P1–P2` (P3/P4 only before 2024),
  English `P1–P4`, Mathematics `P1–P2`, M1/M2 `P1`, CSD `P1`, electives
  `P1–P2`.
- Levels run 1–7, displayed as `1`–`5**` (6 = 5\*, 7 = 5\*\*). CSD uses
  Attained / Not attained instead.
- The countdown defaults to **6 April 2027, 08:30 HKT**, the first written
  paper, with results on **14 July 2027**. Both dates are editable in Settings.
- Predicted level comes from a school estimate if entered; otherwise from the
  average of your four most recent graded attempts, DSE papers and other papers
  together.
