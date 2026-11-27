# Data model

The app stores everything in MongoDB Atlas, one database per app (`hkdse_desk`
by default). Eight collections, all keyed by the authenticated student.

## Isolation model

There is no server-side session shared between users and no client-supplied
user id in any query. Instead:

1. A signed-in request carries an opaque `dse_session` cookie (HttpOnly,
   SameSite=Lax, Secure, 30 days).
2. The server hashes that token and looks up the session document.
3. Every read and write is issued as `{ userId: <session.userId>, ... }`.

A student cannot widen that scope, because `userId` is never read from the
request body. Two extra checks matter:

- Creating a paper, session, task or error against a `subjectId` first verifies
  the subject belongs to the caller (`ownedSubject`), so a foreign id returns
  `403` rather than attaching data to someone else's subject.
- Updates and deletes use `{ _id, userId }` in the filter, so a foreign id
  matches nothing and returns `404`.

`test/isolation.test.js` exercises both cases directly.

Plans do not weaken this. Entitlement checks are a second gate, not a second
data path: a gated endpoint refuses before it reads anything, and the documents
it would have read are still filtered by `userId`. See
[Where entitlements live](#where-entitlements-live).

## Collections

### `users`

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | also the `userId` on every child document |
| `email` / `emailLower` | string | unique index on `emailLower` |
| `name` | string | max 60 chars |
| `pw` | object | `{ hash, salt, iterations }`, PBKDF2-SHA256, 210k rounds |
| `recovery` | object | hashed 12-character recovery code, single use |
| `examDate` | string | `YYYY-MM-DD`, defaults to the 2027 first paper |
| `resultsDate` | string | `YYYY-MM-DD` |
| `dailyGoalMinutes` | int | 10–720 |
| `theme` | string | `system` \| `light` \| `dark` |
| `plan` | string | `free` \| `pass`; defaults to `free` for a new account |
| `planUntil` | string \| null | optional ISO expiry of a pass; see below |
| `createdAt` | date | |

#### `plan` and `planUntil`

The plan is resolved on the server by `planOf()` in
`server/entitlements.js`, and the rules must be read before touching either
field:

- An unknown or missing `plan` string resolves to `free`. It never fails open.
- `free` is absolute; `planUntil` is ignored for it.
- A `pass` **with** `planUntil` expires: once that instant has passed, the
  resolved plan is `free` again. A corrupt date also resolves to `free`.
- A `pass` **without** `planUntil` does not expire. That is deliberate, for a
  pass sold without an end date.
- Expiry only changes which views are computed. Every document the student wrote
  stays, because the free plan includes all of them.
- `publicUser()` strips `planUntil` from anything sent to the client; the client
  is told the resolved plan through `entitlementsFor()`. `plan` itself stays,
  because the UI needs it to draw a locked card.

Gated data is never written to `users`. Pacing and diagnostics are computed per
request from the student's own documents, which is why a free account cannot
reach them by editing a response in the browser.

### `sessions`

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | string | owner |
| `tokenHash` | string | SHA-256 of the cookie token, unique |
| `expiresAt` | date | TTL index removes expired sessions automatically |

### `subjects`

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | string | owner |
| `code` | string | `CHIN`, `ENG`, `MATH`, `CSD`, `M1`, `M2`, `BIOL`, … |
| `name` | string | display name; English only, from the catalog in `server/util.js` |
| `category` | string | `core` \| `elective` \| `extended` |
| `targetLevel` | int \| null | 1–7 (7 renders as `5**`); null for CSD |
| `predictedLevel` | int \| null | school estimate; when null the UI derives one from papers |
| `attainment` | string \| null | `attained` \| `unattained`; CSD only |
| `examDate` | string \| null | per-subject paper date |
| `sortOrder` | int | keeps the four cores first |

CSD is reported by HKEAA as *Attained* / *Unattained* only, so it carries no
level fields. Its `targetLevel` and `predictedLevel` are always null.

### `pastPapers`

| Field | Type | Notes |
| --- | --- | --- |
| `userId`, `subjectId` | string | owner + subject |
| `year` | int | 2012–2035; CSD starts at 2024 |
| `paper` | string | `P1`–`P4` or `SBA`; CSD is `P1` only |
| `score`, `maxScore` | number \| null | optional raw marks |
| `percentage` | number \| null | derived from marks, or typed directly |
| `estimatedLevel` | int \| null | 1–7; always null for CSD |
| `attainment` | string \| null | `attained` \| `unattained`; CSD only |
| `notes` | string | max 2000 chars |
| `attemptedAt` | date | refreshed on every save |

The paper set is year-dependent, because the syllabus changed:

| Subject | Papers | Note |
| --- | --- | --- |
| Chinese | `P1`, `P2` | `P3` and `P4` existed until 2023 and are still accepted for those years |
| English | `P1`–`P4` | |
| Mathematics, M1, M2 | `P1`, `P2` / `P1` | |
| CSD | `P1` | from 2024 |

A unique index on `(userId, subjectId, year, paper)` is what makes the matrix
idempotent: logging the same cell twice updates the existing attempt instead of
creating a duplicate row.

### `otherPapers`

Papers that are not DSE past papers, kept in their own collection so the matrix
stays an honest record of real past papers. They still count towards the
subject's average and predicted level.

| Field | Type | Notes |
| --- | --- | --- |
| `userId`, `subjectId` | string | owner + subject |
| `title` | string | e.g. `St Paul's mock 2026` |
| `source` | string | `school` \| `other-school` \| `textbook` \| `practice` \| `other-board` \| `other` |
| `takenOn` | string | date sat, `YYYY-MM-DD` |
| `score`, `maxScore`, `percentage` | number \| null | as above |
| `estimatedLevel` | int \| null | null for CSD |
| `attainment` | string \| null | CSD only |
| `notes` | string | |

### `studyLogs`

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | string | owner |
| `subjectId` | string \| null | null when untagged |
| `label` | string | free text, max 80 |
| `minutes` | int | 1–1440 |
| `mode` | string | `focus` \| `break`; only `focus` counts toward goals |
| `startedAt`, `completedAt` | date | computed from duration and finish time |

### `sbaTasks`

| Field | Type | Notes |
| --- | --- | --- |
| `userId`, `subjectId` | string | owner + optional subject |
| `title` | string | max 140 |
| `kind` | string | `sba` \| `revision` \| `mock` \| `other` |
| `dueDate` | string \| null | `YYYY-MM-DD` |
| `status` | string | `todo` \| `doing` \| `done` |
| `weightPct` | number \| null | share of the SBA mark |
| `notes` | string | |

### `errorLogs`

| Field | Type | Notes |
| --- | --- | --- |
| `userId`, `subjectId` | string | owner + optional subject |
| `topic` | string | max 120 |
| `questionRef` | string | e.g. `2023 P1 Q8` |
| `errorType` | string | `concept` \| `careless` \| `time` \| `misread` \| `technique` |
| `note` | string | what went wrong |

## Indexes

```
users        { emailLower: 1 } unique
sessions     { tokenHash: 1 } unique
sessions     { expiresAt: 1 } TTL 0
sessions     { userId: 1 }
subjects     { userId: 1, sortOrder: 1 }
pastPapers   { userId: 1, subjectId: 1, year: 1, paper: 1 } unique
pastPapers   { userId: 1, attemptedAt: -1 }
otherPapers  { userId: 1, takenOn: -1 }
otherPapers  { userId: 1, subjectId: 1 }
studyLogs    { userId: 1, completedAt: -1 }
sbaTasks     { userId: 1, dueDate: 1 }
errorLogs    { userId: 1, createdAt: -1 }
```

`scripts/init-db.js` creates these plus per-collection JSON Schema validators.

## Where entitlements live

Plans are not a collection. `plan` and `planUntil` sit on the `users` document,
and everything else is derived per request:

| Endpoint | Free | Pass |
| --- | --- | --- |
| `GET /me` | full workspace + `plan` | same |
| `GET /pacing` | `402 { locked, feature }` | computed plan |
| `GET /diagnostics` | `402` | computed counts |
| `POST /import` | `402` | rows validated, then saved |

The gated values are never stored, so there is no document for a free account to
read. `/import` writes ordinary `pastPapers` documents through the same
`validateAttempt` as a manual save.

## Why not Atlas RLS

Atlas has no row-level security equivalent. Isolation therefore lives in one
place — the `userId` filter applied by `server/store.js` — and is enforced by
tests. If you later move to Postgres or Supabase, `schema.sql` contains the
same tables with real RLS policies and a sign-up trigger that seeds the four
core subjects.
