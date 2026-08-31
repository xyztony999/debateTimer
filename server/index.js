import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { MongoClient } from 'mongodb';
import { createAuthMiddleware } from './lib/authMiddleware.js';
import { migrateLegacyConfigurations } from './lib/migrateConfigurations.js';
import { buildMongoUri } from './lib/mongoUri.js';
import { createSseHub } from './lib/sseHub.js';
import { createAdminRouter } from './routes/admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createConfigurationsRouter } from './routes/configurations.js';
import { createDisplayRouter } from './routes/display.js';

const PORT = Number(process.env.PORT) || 3001;
const MONGODB_URI = buildMongoUri();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

function logMongoAuthHelp() {
    console.error('MongoDB authentication failed. Update server/.env with credentials.');
    console.error('Option A — full URI:');
    console.error('  MONGODB_URI=mongodb://USER:PASS@127.0.0.1:27017/debatetimer?authSource=admin');
    console.error('Option B — separate fields:');
    console.error('  MONGODB_USER=your_user');
    console.error('  MONGODB_PASSWORD=your_password');
    console.error('  MONGODB_AUTH_SOURCE=admin');
    console.error('Baota: MongoDB manager → create user for database "debatetimer", then use that user here.');
}

const app = express();
const sse = createSseHub();

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(cors({
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
}));

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use((req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
        next();
        return;
    }
    const origin = req.get('Origin');
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
        res.status(403).json({ success: false, message: 'Forbidden origin' });
        return;
    }
    next();
});

app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

async function start() {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();
    const configurations = db.collection('configurations');
    const users = db.collection('users');
    const sessions = db.collection('sessions');

    await db.command({ ping: 1 });

    const migrated = await migrateLegacyConfigurations(configurations, users);
    if (migrated.migrated) {
        console.log(`Migrated ${migrated.migrated} legacy configuration(s) to first admin`);
    }

    const unnamed = await configurations.find({
        $or: [{ name: { $exists: false } }, { name: null }, { name: '' }],
    }).toArray();
    for (const doc of unnamed) {
        const name = String(doc.name || doc._id);
        await configurations.updateOne({ _id: doc._id }, { $set: { name } });
    }

    await users.createIndex({ username: 1 }, { unique: true });
    await sessions.createIndex({ tokenHash: 1 }, { unique: true });
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await configurations.createIndex({ ownerId: 1, name: 1 }, { unique: true });
    await configurations.createIndex(
        { shareToken: 1 },
        { unique: true, partialFilterExpression: { shareToken: { $type: 'string' } } },
    );
    await configurations.createIndex({ updatedAt: -1 });

    const { attachUser, requireAuth, requireAdmin } = createAuthMiddleware({ users, sessions });
    app.use(attachUser);

    app.use('/api/auth', createAuthRouter({ users, sessions, configurations }));
    app.use('/api/display', createDisplayRouter({ configurations, sse }));
    app.use('/api/configurations', createConfigurationsRouter({ configurations, sse, requireAuth }));
    app.use('/api/admin', createAdminRouter({
        users,
        sessions,
        configurations,
        sse,
        requireAuth,
        requireAdmin,
    }));

    app.listen(PORT, '127.0.0.1', () => {
        console.log(`DebateTimer API listening on http://127.0.0.1:${PORT}`);
        console.log(`CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
        console.log(`MongoDB database: ${db.databaseName}`);
    });
}

start().catch((error) => {
    if (error.code === 13 || error.codeName === 'Unauthorized') {
        logMongoAuthHelp();
    }
    console.error('Failed to start API server:', error.message || error);
    process.exit(1);
});
