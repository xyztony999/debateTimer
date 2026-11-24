#!/usr/bin/env node
/**
 * Backup / restore the MongoDB business collections (configurations, users,
 * match_logs, app_settings) as dated NDJSON snapshots with rotation. Pure
 * driver — no mongodump binary needed. Run on the server via cron:
 *
 *   30 4 * * *  cd /www/wwwroot/debatetimer-api/server && \
 *       node scripts/backup.js >> /www/wwwlogs/debatetimer-backup.log 2>&1
 *
 * Usage:
 *   node scripts/backup.js                    # backup to ./backups (or BACKUP_DIR)
 *   node scripts/backup.js --list
 *   node scripts/backup.js --restore <name> --force   # name = backup dir name
 */
import 'dotenv/config';
import { realpathSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import { buildMongoUri } from '../lib/mongoUri.js';
import { scrubOrphanAuditLogs } from '../lib/auditLog.js';

// app_settings (admin-managed settings, e.g. the registration toggle) is
// configuration data — restored copies must keep it or the toggle silently
// falls back to env. sessions stay excluded on purpose: volatile by design.
// audit_logs is included (R20): the security trail should survive a disk
// failure. Its documents hold IP addresses and account ids for 184 days;
// backups rotate out after 14 days and a restore re-scrubs deleted accounts.
export const COLLECTIONS = ['configurations', 'users', 'match_logs', 'app_settings', 'audit_logs'];
const KEEP_DAYS = 14;

// Anchor to the script's own directory so backups land in server/backups
// regardless of the invoking cwd (crontab safety).
const backupRoot = resolve(
    process.env.BACKUP_DIR
        ? resolve(process.cwd(), process.env.BACKUP_DIR)
        : join(dirname(fileURLToPath(import.meta.url)), '..', 'backups'),
);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => args[args.indexOf(name) + 1];

function stamp() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

async function listBackups() {
    try {
        return (await readdir(backupRoot, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    } catch {
        return [];
    }
}

async function rotate() {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const name of await listBackups()) {
        const dirStat = await readFile(join(backupRoot, name, '.created'), 'utf8')
            .then(Number)
            .catch(() => NaN);
        if (Number.isFinite(dirStat) && dirStat < cutoff) {
            await rm(join(backupRoot, name), { recursive: true, force: true });
            console.log(`rotated out: ${name}`);
        }
    }
}

async function runBackup() {
    const name = stamp();
    const dir = join(backupRoot, name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '.created'), String(Date.now()));

    const client = new MongoClient(buildMongoUri());
    await client.connect();
    const db = client.db();
    try {
        for (const collectionName of COLLECTIONS) {
            const collection = db.collection(collectionName);
            const docs = await collection.find({}).toArray();
            await writeFile(join(dir, `${collectionName}.ndjson`), docsToNdjson(docs), 'utf8');
            console.log(`${collectionName}: ${docs.length} docs`);
        }
    } finally {
        await client.close();
    }
    console.log(`backup complete: ${dir}`);
    await rotate();
}

async function runRestore(name) {
    if (!name || !/^\d{8}-\d{6}$/.test(name)) {
        throw new Error('Provide --restore <YYYYMMDD-HHMMSS>');
    }
    if (!flag('--force')) {
        throw new Error('Restoring REPLACES collections. Re-run with --force after reviewing the backup.');
    }
    const dir = join(backupRoot, name);
    const client = new MongoClient(buildMongoUri());
    await client.connect();
    const db = client.db();
    try {
        await restoreInto(db, dir);
    } finally {
        await client.close();
    }
    console.log(`restore complete from ${dir}`);
}

// One collection's documents as the content of its backup file.
// Exported for tests.
export function docsToNdjson(docs) {
    const lines = docs.map((doc) => JSON.stringify(doc));
    return lines.join('\n') + (lines.length ? '\n' : '');
}

// Date fields the code reads as Date objects, which are ISO text in a backup
// file. `audit_logs.expireAt` carries the retention: the TTL index removes a
// document by a BSON date and ignores anything else, so a restore that left it
// as text would never expire (checked on a real MongoDB 7.0).
const DATE_KEYS = new Set(['at', 'expireAt', 'consentedAt', 'boundAt', 'expiresAt']);
const DATED_COLLECTIONS = new Set(['audit_logs', 'users']);

function reviveDates(value) {
    if (Array.isArray(value)) {
        return value.map(reviveDates);
    }
    if (value && typeof value === 'object' && value.constructor === Object) {
        const out = {};
        for (const [key, inner] of Object.entries(value)) {
            if (DATE_KEYS.has(key) && typeof inner === 'string') {
                const date = new Date(inner);
                if (Number.isFinite(date.getTime())) {
                    out[key] = date;
                    continue;
                }
            }
            out[key] = reviveDates(inner);
        }
        return out;
    }
    return value;
}

/**
 * Puts every collection of one backup back into `db`, then scrubs the audit
 * log of accounts that were deleted before the backup was taken (they would
 * otherwise reappear as identifiers). Split from runRestore — which owns the
 * connection and the safety checks — so it can be exercised on any object
 * with `collection()`. Exported for tests.
 */
export async function restoreInto(db, dir) {
    for (const collectionName of COLLECTIONS) {
        const raw = await readFile(join(dir, `${collectionName}.ndjson`), 'utf8').catch(() => null);
        if (raw === null) {
            console.log(`${collectionName}: no backup file, skipped`);
            continue;
        }
        const docs = raw.split('\n').filter(Boolean).map((line) => {
            const doc = JSON.parse(line);
            if (doc._id && ObjectId.isValid(doc._id)) {
                doc._id = new ObjectId(doc._id);
            }
            return DATED_COLLECTIONS.has(collectionName) ? reviveDates(reviveDeep(doc)) : reviveDeep(doc);
        });
        await db.collection(collectionName).deleteMany({});
        if (docs.length > 0) {
            await db.collection(collectionName).insertMany(docs, { ordered: false });
        }
        console.log(`${collectionName}: restored ${docs.length} docs`);
    }
    // Runs after every collection is back in place.
    const { scrubbed } = await scrubOrphanAuditLogs({
        auditLogs: db.collection('audit_logs'),
        users: db.collection('users'),
    });
    if (scrubbed > 0) {
        console.log(`audit_logs: re-scrubbed ${scrubbed} deleted account(s)`);
    }
    return { scrubbed };
}

// ObjectId strings under id-ish keys (_id / ownerId / *Id) back to ObjectId
// so owner-scoped queries keep matching after restore. Values under other
// keys are preserved verbatim — a team name that happens to be 24 hex chars
// must survive a round-trip untouched. Exported for tests.
export function reviveDeep(value) {
    if (Array.isArray(value)) {
        return value.map(reviveDeep);
    }
    if (value && typeof value === 'object' && value.constructor === Object) {
        const out = {};
        for (const [key, inner] of Object.entries(value)) {
            if (key === '_id' || /Id$/.test(key)) {
                if (typeof inner === 'string' && /^[0-9a-f]{24}$/.test(inner) && ObjectId.isValid(inner)) {
                    out[key] = new ObjectId(inner);
                    continue;
                }
            }
            out[key] = reviveDeep(inner);
        }
        return out;
    }
    return value;
}

async function main() {
    if (flag('--list')) {
        console.log((await listBackups()).join('\n') || '(no backups)');
        return;
    }
    if (flag('--restore')) {
        await runRestore(value('--restore'));
        return;
    }
    await runBackup();
}

// Run only when this file is the script that was started — not when it is
// imported (by the tests, or by anything calling restoreInto()). Without the
// check, importing it started a backup: harmless without a database, but a
// real one on a machine that has a local MongoDB.
const startedDirectly = (() => {
    const entry = process.argv[1];
    if (!entry) {
        return false;
    }
    const canonical = (file) => {
        try {
            return realpathSync.native(resolve(file));
        } catch {
            return resolve(file);
        }
    };
    return canonical(entry) === canonical(fileURLToPath(import.meta.url));
})();

if (startedDirectly) {
    main().catch((error) => {
        console.error(`backup failed: ${error.message}`);
        process.exitCode = 1;
    });
}
