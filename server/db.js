import { MongoClient } from 'mongodb';

let clientPromise = null;
let indexesPromise = null;

export function mongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set. Add it in Vercel → Settings → Environment Variables.');
  return uri;
}

export async function getDb() {
  if (!clientPromise) {
    const client = new MongoClient(mongoUri(), {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      retryWrites: true
    });
    clientPromise = client.connect().then((c) => c.db(process.env.MONGODB_DB || 'hkdse_desk'));
  }
  const db = await clientPromise;
  await ensureIndexes(db);
  return db;
}

// Indexes are what make per-student queries fast and paper logging idempotent.
export async function ensureIndexes(db) {
  if (!indexesPromise) {
    indexesPromise = (async () => {
      await db.collection('users').createIndex({ emailLower: 1 }, { unique: true });
      await db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true });
      await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await db.collection('sessions').createIndex({ userId: 1 });
      await db.collection('subjects').createIndex({ userId: 1, sortOrder: 1 });
      // Before the unique index existed, a cell could hold several rows. That
      // makes a delete look like it failed, because one copy survives, so clear
      // the duplicates once here. The slice keeps the row the browser is most
      // likely holding (oldest first, then newest), and only runs when one cell
      // actually has more than one row.
      await dropDuplicatePapers(db);
      await db
        .collection('pastPapers')
        .createIndex({ userId: 1, subjectId: 1, year: 1, paper: 1 }, { unique: true });
      await db.collection('pastPapers').createIndex({ userId: 1, attemptedAt: -1 });
      await db.collection('otherPapers').createIndex({ userId: 1, takenOn: -1 });
      await db.collection('otherPapers').createIndex({ userId: 1, subjectId: 1 });
      await db.collection('studyLogs').createIndex({ userId: 1, completedAt: -1 });
      await db.collection('sbaTasks').createIndex({ userId: 1, dueDate: 1 });
      await db.collection('errorLogs').createIndex({ userId: 1, createdAt: -1 });
    })().catch((err) => {
      indexesPromise = null;
      throw err;
    });
  }
  return indexesPromise;
}

/** Remove rows that duplicate a matrix cell, keeping the most recent one. */
async function dropDuplicatePapers(db) {
  const dupes = await db
    .collection('pastPapers')
    .aggregate([
      {
        $group: {
          _id: { userId: '$userId', subjectId: '$subjectId', year: '$year', paper: '$paper' },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 200 }
    ])
    .toArray();
  if (!dupes.length) return;

  for (const dupe of dupes) {
    const rows = await db
      .collection('pastPapers')
      .find(dupe._id)
      .project({ _id: 1, attemptedAt: 1 })
      .toArray();
    // Keep whichever row has the latest attempt time, so the score shown is the
    // one the student last saved.
    rows.sort((a, b) => new Date(b.attemptedAt || 0) - new Date(a.attemptedAt || 0));
    const [, ...stale] = rows;
    if (!stale.length) continue;
    await db.collection('pastPapers').deleteMany({ _id: { $in: stale.map((r) => r._id) } });
  }
}
