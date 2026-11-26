/**
 * Creates the Atlas collections, indexes and a validation schema.
 * Indexes are also created automatically at runtime, but running this once
 * makes the intent explicit and surfaces errors early.
 *
 *   MONGODB_URI="mongodb+srv://..." node scripts/init-db.js
 */

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. See .env.example.');
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || 'hkdse_desk';

/* ------------------------- JSON Schema for collections ---------------------- */

const stringOrNull = { bsonType: ['string', 'null'] };
const level = { bsonType: ['int', 'null'], minimum: 1, maximum: 7 };

const validators = {
  users: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'emailLower', 'name', 'pw', 'recovery', 'createdAt'],
      properties: {
        email: { bsonType: 'string' },
        emailLower: { bsonType: 'string' },
        name: { bsonType: 'string', maxLength: 60 },
        pw: { bsonType: 'object', required: ['hash', 'salt'] },
        recovery: { bsonType: 'object', required: ['hash', 'salt'] },
        examDate: { bsonType: 'string' },
        resultsDate: { bsonType: 'string' },
        dailyGoalMinutes: { bsonType: 'int', minimum: 10, maximum: 720 },
        theme: { enum: ['system', 'light', 'dark'] },
        createdAt: { bsonType: 'date' }
      }
    }
  },
  sessions: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'tokenHash', 'expiresAt'],
      properties: {
        userId: { bsonType: 'string' },
        tokenHash: { bsonType: 'string' },
        createdAt: { bsonType: 'date' },
        expiresAt: { bsonType: 'date' }
      }
    }
  },
  subjects: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'name', 'category', 'targetLevel'],
      properties: {
        userId: { bsonType: 'string' },
        code: { bsonType: 'string', maxLength: 12 },
        name: { bsonType: 'string', maxLength: 60 },
        category: { enum: ['core', 'elective', 'extended'] },
        targetLevel: { bsonType: 'int', minimum: 1, maximum: 7 },
        predictedLevel: level,
        examDate: stringOrNull,
        sortOrder: { bsonType: 'int' }
      }
    }
  },
  pastPapers: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'subjectId', 'year', 'paper'],
      properties: {
        userId: { bsonType: 'string' },
        subjectId: { bsonType: 'string' },
        year: { bsonType: 'int', minimum: 2012, maximum: 2035 },
        paper: { bsonType: 'string', maxLength: 40 },
        score: { bsonType: ['double', 'int', 'null'], minimum: 0 },
        maxScore: { bsonType: ['double', 'int', 'null'], minimum: 0 },
        percentage: { bsonType: ['double', 'int', 'null'], minimum: 0, maximum: 100 },
        estimatedLevel: level,
        notes: { bsonType: 'string', maxLength: 2000 },
        attemptedAt: { bsonType: 'date' }
      }
    }
  },
  studyLogs: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'minutes', 'mode', 'completedAt'],
      properties: {
        userId: { bsonType: 'string' },
        subjectId: stringOrNull,
        label: { bsonType: 'string', maxLength: 80 },
        minutes: { bsonType: 'int', minimum: 1, maximum: 1440 },
        mode: { enum: ['focus', 'break'] },
        startedAt: { bsonType: 'date' },
        completedAt: { bsonType: 'date' }
      }
    }
  },
  sbaTasks: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'title', 'kind', 'status'],
      properties: {
        userId: { bsonType: 'string' },
        subjectId: stringOrNull,
        title: { bsonType: 'string', maxLength: 140 },
        kind: { enum: ['sba', 'revision', 'mock', 'other'] },
        dueDate: stringOrNull,
        status: { enum: ['todo', 'doing', 'done'] },
        weightPct: { bsonType: ['double', 'int', 'null'], minimum: 0, maximum: 100 },
        notes: { bsonType: 'string', maxLength: 2000 }
      }
    }
  },
  errorLogs: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'topic', 'errorType'],
      properties: {
        userId: { bsonType: 'string' },
        subjectId: stringOrNull,
        topic: { bsonType: 'string', maxLength: 120 },
        questionRef: { bsonType: 'string', maxLength: 80 },
        errorType: { enum: ['concept', 'careless', 'time', 'misread', 'technique'] },
        note: { bsonType: 'string', maxLength: 2000 },
        createdAt: { bsonType: 'date' }
      }
    }
  }
};

const indexes = [
  ['users', { emailLower: 1 }, { unique: true }],
  ['sessions', { tokenHash: 1 }, { unique: true }],
  ['sessions', { expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ['sessions', { userId: 1 }, {}],
  ['subjects', { userId: 1, sortOrder: 1 }, {}],
  ['pastPapers', { userId: 1, subjectId: 1, year: 1, paper: 1 }, { unique: true }],
  ['pastPapers', { userId: 1, attemptedAt: -1 }, {}],
  ['studyLogs', { userId: 1, completedAt: -1 }, {}],
  ['sbaTasks', { userId: 1, dueDate: 1 }, {}],
  ['errorLogs', { userId: 1, createdAt: -1 }, {}]
];

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

try {
  await client.connect();
  const db = client.db(dbName);
  console.log(`Connected to ${dbName}`);

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  for (const [name, validator] of Object.entries(validators)) {
    if (existing.has(name)) {
      await db.command({ collMod: name, validator, validationLevel: 'moderate' });
      console.log(`  updated  ${name}`);
    } else {
      await db.createCollection(name, { validator, validationLevel: 'moderate' });
      console.log(`  created  ${name}`);
    }
  }

  const seen = new Set();
  for (const [collection, keys, options] of indexes) {
    const sig = `${collection}:${JSON.stringify(keys)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    await db.collection(collection).createIndex(keys, options);
  }
  console.log(`  indexed  ${seen.size} index definitions`);
  console.log('\nDone. Add MONGODB_URI to Vercel and your app is ready.');
} catch (error) {
  console.error('\nSetup failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
