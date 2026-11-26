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
