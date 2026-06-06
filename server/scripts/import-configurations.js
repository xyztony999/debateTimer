#!/usr/bin/env node
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { buildMongoUri } from '../lib/mongoUri.js';
import { parseConfigExportFile } from './lib/parseConfigExport.js';

const COLLECTION = 'configurations';

function printHelp() {
    console.log(`
Import debate configurations from JSON into MongoDB

Usage:
  node scripts/import-configurations.js --file <export.json> [--dry-run] [--force]

Options:
  --file <path>   Import from a JSON / NDJSON export file (required)
  --dry-run       Parse and preview only, do not write to MongoDB
  --force         Overwrite existing MongoDB documents with the same _id

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

    return options;
}

async function loadFromFile(filePath) {
    const absolutePath = resolve(process.cwd(), filePath);
    const content = await readFile(absolutePath, 'utf8');
    const docs = parseConfigExportFile(content);
    console.log(`Parsed ${docs.length} configuration(s) from ${absolutePath}`);
    return docs;
}

async function importIntoMongo(docs, { dryRun, force }) {
    if (docs.length === 0) {
        console.log('Nothing to import.');
        return;
    }

    for (const doc of docs) {
        console.log(`- ${doc._id} (schema v${doc.schemaVersion}, ${Object.keys(doc.debateStages).length} stages)`);
    }

    if (dryRun) {
        console.log('\nDry run complete. No data written.');
        return;
    }

    const client = new MongoClient(buildMongoUri());
    await client.connect();
    const collection = client.db().collection(COLLECTION);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const doc of docs) {
        const existing = await collection.findOne({ _id: doc._id }, { projection: { _id: 1 } });
        if (existing && !force) {
            skipped += 1;
            console.log(`Skipped existing document: ${doc._id} (use --force to overwrite)`);
            continue;
        }

        await collection.replaceOne({ _id: doc._id }, doc, { upsert: true });
        if (existing) {
            updated += 1;
        } else {
            inserted += 1;
        }
    }

    await collection.createIndex({ updatedAt: -1 });
    await client.close();

    console.log(`\nImport complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
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
