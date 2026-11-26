# Data model

The app stores everything in MongoDB Atlas, one database per app (`hkdse_desk`
by default). Seven collections, all keyed by the authenticated student.

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
| `createdAt` | date | |

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
| `name` | string | display name, may be Chinese |
| `category` | string | `core` \| `elective` \| `extended` |
| `targetLevel` | int | 1–7 (7 renders as `5**`) |
| `predictedLevel` | int \| null | school estimate; when null the UI derives one from papers |
| `examDate` | string \| null | per-subject paper date |
| `sortOrder` | int | keeps the four cores first |

### `pastPapers`

| Field | Type | Notes |
| --- | --- | --- |
| `userId`, `subjectId` | string | owner + subject |
| `year` | int | 2012–2035 |
| `paper` | string | `P1`–`P4` or `SBA` |
| `score`, `maxScore` | number \| null | optional raw marks |
| `percentage` | number \| null | derived from marks, or typed directly |
| `estimatedLevel` | int \| null | 1–7 |
| `notes` | string | max 2000 chars |
| `attemptedAt` | date | refreshed on every save |

A unique index on `(userId, subjectId, year, paper)` is what makes the matrix
idempotent: logging the same cell twice updates the existing attempt instead of
creating a duplicate row.

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
studyLogs    { userId: 1, completedAt: -1 }
sbaTasks     { userId: 1, dueDate: 1 }
errorLogs    { userId: 1, createdAt: -1 }
```

`scripts/init-db.js` creates these plus per-collection JSON Schema validators.

## Why not Atlas RLS

Atlas has no row-level security equivalent. Isolation therefore lives in one
place — the `userId` filter applied by `server/store.js` — and is enforced by
tests. If you later move to Postgres or Supabase, `schema.sql` contains the
same tables with real RLS policies and a sign-up trigger that seeds the four
core subjects.
