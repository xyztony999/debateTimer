import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import { MongoClient } from 'mongodb';
import { createAuthMiddleware } from './lib/authMiddleware.js';
import { migrateLegacyConfigurations } from './lib/migrateConfigurations.js';
import { buildMongoUri } from './lib/mongoUri.js';
import { createCorsMiddleware, createUnsafeOriginGuard, parseAllowedOrigins } from './lib/originPolicy.js';
import { createStaticSite } from './lib/staticSite.js';
import { createSseHub } from './lib/sseHub.js';
import { createTimerSessionRegistry } from './lib/timerSessions.js';
import { createDisplayRateLimiter, createGalleryRateLimiter } from './lib/rateLimits.js';
import { createAdminRouter } from './routes/admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createConfigurationsRouter } from './routes/configurations.js';
import { createPairingRouter } from './routes/pairing.js';
import { createDisplayRouter } from './routes/display.js';
import { createMatchLogsRouter } from './routes/matchLogs.js';
import { createGalleryRouter } from './routes/gallery.js';

const PORT = Number(process.env.PORT) || 3001;
// 127.0.0.1 keeps the API behind a reverse proxy (Baota nginx). All-stack
// self-hosted / direct LAN deployments set HOST=0.0.0.0.
const HOST = process.env.HOST || '127.0.0.1';
const MONGODB_URI = buildMongoUri();
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS || 'http://localhost:3000');
// Set to the frontend build output to serve the SPA from this process
// (all-stack self-hosted mode; see deploy/selfhost/README.md). Empty = API-only.
const STATIC_DIR = process.env.STATIC_DIR || '';

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
// Baota nginx fronts the API; without this every request shares the proxy IP
// (which would also collapse the per-IP rate-limit buckets).
app.set('trust proxy', 1);
const sse = createSseHub();
const timerSessions = createTimerSessionRegistry({ sse });

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
// Same-origin requests (STATIC_DIR self-hosted, direct LAN access) bypass the
// allowlist; cross-origin traffic keeps the strict list — see lib/originPolicy.js.
app.use(createCorsMiddleware({ allowedOrigins: ALLOWED_ORIGINS }));
app.use(createUnsafeOriginGuard({ allowedOrigins: ALLOWED_ORIGINS }));

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
    const matchLogs = db.collection('match_logs');
    // Admin-managed app settings (registration toggle). Singleton docs with a
    // fixed string _id — unique by construction, no index needed. Included in
    // scripts/backup.js COLLECTIONS so restores keep the toggle.
    const appSettings = db.collection('app_settings');

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
    await configurations.createIndex(
        { isPublic: 1, updatedAt: -1 },
        { partialFilterExpression: { isPublic: true } },
    );
    await matchLogs.createIndex({ ownerId: 1, savedAt: -1 });

    const { attachUser, requireAuth, requireAdmin } = createAuthMiddleware({ users, sessions });
    app.use(attachUser);

    app.use('/api/auth', createAuthRouter({ users, sessions, configurations, appSettings }));
    // Anonymous public surfaces get in-memory per-IP limits (SSE streams on
    // /display are long-lived and count once at connect). Thresholds are
    // env-tunable with unchanged defaults — see server/.env.example.
    app.use('/api/display', createDisplayRateLimiter(), createDisplayRouter({ configurations, sse, timerSessions }));
    app.use('/api/gallery', createGalleryRateLimiter(), createGalleryRouter({ configurations, requireAuth, requireAdmin }));
    app.use('/api/configurations', createConfigurationsRouter({ configurations, sse, requireAuth, timerSessions }));
    app.use('/api/session', createPairingRouter({ timerSessions, requireAuth }));
    app.use('/api/match-logs', createMatchLogsRouter({ matchLogs, requireAuth }));
    app.use('/api/admin', createAdminRouter({
        users,
        sessions,
        configurations,
        appSettings,
        sse,
        requireAuth,
        requireAdmin,
    }));

    // All-stack self-hosted mode: after every API route, serve the frontend
    // build with an SPA fallback. Unknown /api paths stay JSON 404s.
    if (STATIC_DIR) {
        app.use(createStaticSite({ dir: STATIC_DIR }));
    }

    app.listen(PORT, HOST, () => {
        console.log(`DebateTimer API listening on http://${HOST}:${PORT}`);
        if (STATIC_DIR) {
            console.log(`Static site: ${STATIC_DIR} (all-stack mode)`);
        }
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
