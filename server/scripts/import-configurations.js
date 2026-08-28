#!/usr/bin/env node
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { buildMongoUri } from '../lib/mongoUri.js';
import { normalizeUsername } from '../lib/password.js';
import { parseConfigExportFile } from './lib/parseConfigExport.js';

const COLLECTION = 'configurations';

function printHelp() {
    console.log(`
Import debate configurations from JSON into MongoDB

Usage:
  node scripts/import-configurations.js --file <export.json> --owner <username> [--dry-run] [--force]

Options:
  --file <path>       Import from a JSON / NDJSON export file (required)
  --owner <username>  Existing account that will own the imported templates (required unless --dry-run)
  --dry-run           Parse and preview only, do not write to MongoDB
  --force             Overwrite existing templates with the same name for that owner

Environment (server/.env):
  MONGODB_URI / MONGODB_USER / MONGODB_PASSWORD ...

Supported JSON formats:
  1) { "configurations": { "默认配置": { ...fields } } }
  2) { "默认配置": { ...fields } }
  3) [ { "_id": "默认配置", ...fields } ]
  4) NDJSON (one JSON document per line)
`);
}

function parseArgs(argv) {
    const options = {
        file: null,
        owner: null,
        dryRun: false,
        force: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else if (arg === '--file') {
            options.file = argv[i + 1];
            i += 1;
        } else if (arg === '--owner') {
            options.owner = argv[i + 1];
            i += 1;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--force') {
            options.force = true;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (options.help) {
        return options;
    }

    if (!options.file) {
        throw new Error('Provide --file <path>');
    }
    if (!options.dryRun && !options.owner) {
        throw new Error('Provide --owner <username>');
    }

    return options;
}

async function loadFromFile(filePath) {
    const absolutePath = resolve(process.cwd(), filePath);
    const content = await readFile(absolutePath, 'utf8');
    const docs = parseConfigExportFile(content);
    console.log(`Parsed ${docs.length} configuration(s) from ${absolutePath}`);
    return docs;
}

function toOwnedDoc(doc, ownerId) {
    const name = typeof doc.name === 'string' && doc.name.trim()
        ? doc.name
        : String(doc._id);
    const now = Date.now();
    return {
        ownerId,
        name,
        schemaVersion: doc.schemaVersion ?? 2,
        debateStages: doc.debateStages || {},
        timerSettings: doc.timerSettings || {},
        stageOrder: doc.stageOrder || Object.keys(doc.debateStages || {}),
        stageLabels: doc.stageLabels || {},
        shareToken: null,
        shareEnabled: false,
        createdAt: doc.createdAt ?? now,
        updatedAt: now,
    };
}

async function importIntoMongo(docs, { dryRun, force, owner }) {
    if (docs.length === 0) {
        console.log('Nothing to import.');
        return;
    }

    for (const doc of docs) {
        const name = doc.name || doc._id;
        console.log(`- ${name} (schema v${doc.schemaVersion}, ${Object.keys(doc.debateStages || {}).length} stages)`);
    }

    if (dryRun) {
        console.log('\nDry run complete. No data written.');
        return;
    }

    const client = new MongoClient(buildMongoUri());
    await client.connect();
    const db = client.db();
    const users = db.collection('users');
    const collection = db.collection(COLLECTION);

    const username = normalizeUsername(owner);
    const ownerDoc = await users.findOne({ username });
    if (!ownerDoc) {
        await client.close();
        throw new Error(`Owner user "${username}" not found. Create the account first.`);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const doc of docs) {
        const payload = toOwnedDoc(doc, ownerDoc._id);
        const existing = await collection.findOne(
            { ownerId: ownerDoc._id, name: payload.name },
            { projection: { _id: 1, createdAt: 1 } },
        );
        if (existing && !force) {
            skipped += 1;
            console.log(`Skipped existing template: ${payload.name} (use --force to overwrite)`);
            continue;
        }

        if (existing) {
            await collection.replaceOne(
                { _id: existing._id },
                {
                    ...payload,
                    _id: existing._id,
                    createdAt: existing.createdAt ?? payload.createdAt,
                },
            );
            updated += 1;
        } else {
            await collection.insertOne(payload);
            inserted += 1;
        }
    }

    await collection.createIndex({ ownerId: 1, name: 1 }, { unique: true });
    await collection.createIndex({ updatedAt: -1 });
    await client.close();

    console.log(`\nImport complete for ${username}: ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
}

async function main() {
    try {
        const options = parseArgs(process.argv.slice(2));
        if (options.help) {
            printHelp();
            return;
        }

        const docs = await loadFromFile(options.file);
        await importIntoMongo(docs, options);
    } catch (error) {
        console.error(`Import failed: ${error.message}`);
        process.exitCode = 1;
    }
}

main();
