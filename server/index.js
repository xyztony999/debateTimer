import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { MongoClient } from 'mongodb';
import { buildMongoUri } from './lib/mongoUri.js';

const PORT = Number(process.env.PORT) || 3001;
const MONGODB_URI = buildMongoUri();
const API_KEY = process.env.API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const COLLECTION = 'configurations';

/** @type {Set<import('express').Response>} */
const sseClients = new Set();

let db;
let configurations;

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

app.use(express.json({ limit: '1mb' }));
app.use(cors({
    origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
    },
}));

function requireWriteAuth(req, res, next) {
    if (!API_KEY) {
        next();
        return;
    }
    const key = req.get('X-API-Key');
    if (key !== API_KEY) {
        res.status(401).json({ success: false, message: 'Invalid API key' });
        return;
    }
    next();
}

function broadcastConfigurationsChange() {
    for (const client of sseClients) {
        client.write('event: change\ndata: {}\n\n');
    }
}

function toListItem(doc) {
    return {
        name: doc._id,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

app.get('/api/configurations', async (_req, res) => {
    try {
        const docs = await configurations.find({}).project({
            createdAt: 1,
            updatedAt: 1,
        }).toArray();
        res.json({
            success: true,
            data: docs.map(toListItem),
        });
    } catch (error) {
        console.error('GET /api/configurations', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/configurations/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(': connected\n\n');
    sseClients.add(res);

    req.on('close', () => {
        sseClients.delete(res);
    });
});

app.get('/api/configurations/:name', async (req, res) => {
    try {
        const doc = await configurations.findOne({ _id: req.params.name });
        if (!doc) {
            res.status(404).json({
                success: false,
                message: `Configuration "${req.params.name}" not found`,
            });
            return;
        }

        const { _id, ...data } = doc;
        res.json({
            success: true,
            data: { ...data, name: _id },
        });
    } catch (error) {
        console.error('GET /api/configurations/:name', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/configurations/:name', requireWriteAuth, async (req, res) => {
    try {
        const name = req.params.name;
        const existing = await configurations.findOne({ _id: name });
        const now = Date.now();
        const payload = {
            ...req.body,
            name,
            updatedAt: now,
            createdAt: existing?.createdAt ?? now,
        };

        await configurations.replaceOne(
            { _id: name },
            { _id: name, ...payload },
            { upsert: true },
        );

        broadcastConfigurationsChange();
        res.json({
            success: true,
            message: `Configuration "${name}" saved successfully`,
        });
    } catch (error) {
        console.error('PUT /api/configurations/:name', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/configurations/:name', requireWriteAuth, async (req, res) => {
    try {
        const result = await configurations.deleteOne({ _id: req.params.name });
        if (result.deletedCount === 0) {
            res.status(404).json({
                success: false,
                message: `Configuration "${req.params.name}" not found`,
            });
            return;
        }

        broadcastConfigurationsChange();
        res.json({
            success: true,
            message: `Configuration "${req.params.name}" deleted successfully`,
        });
    } catch (error) {
        console.error('DELETE /api/configurations/:name', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

async function start() {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    configurations = db.collection(COLLECTION);

    await db.command({ ping: 1 });
    await configurations.createIndex({ updatedAt: -1 });

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
