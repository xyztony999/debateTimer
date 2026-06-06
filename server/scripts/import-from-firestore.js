#!/usr/bin/env node
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { buildMongoUri } from '../lib/mongoUri.js';
import { parseFirestoreExportFile } from './lib/parseFirestoreExport.js';

const COLLECTION = 'configurations';

function printHelp() {
    console.log(`
Firestore → MongoDB import

Usage:
  node scripts/import-from-firestore.js --file <export.json> [--dry-run] [--force]
  node scripts/import-from-firestore.js --firestore [--dry-run] [--force]

Options:
  --file <path>     Import from a JSON / NDJSON export file
  --firestore       Read live data from Firestore (requires service account)
  --dry-run         Parse and preview only, do not write to MongoDB
  --force           Overwrite existing MongoDB documents with the same _id

Environment (server/.env):
  MONGODB_URI / MONGODB_USER / MONGODB_PASSWORD ...
  FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json
  FIREBASE_PROJECT_ID=debatetimer-tonyxyz   (optional if present in service account)

Export JSON formats supported:
  1) { "configurations": { "默认配置": { ...fields } } }
  2) { "默认配置": { ...fields } }
  3) [ { "_id": "默认配置", ...fields } ]
  4) NDJSON (one JSON document per line)
  5) Firestore export lines with { "name": ".../configurations/ID", "fields": {...} }
`);
}

function parseArgs(argv) {
    const options = {
        file: null,
        firestore: false,
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
        } else if (arg === '--firestore') {
            options.firestore = true;
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

    if (!options.file && !options.firestore) {
        throw new Error('Provide --file <path> or --firestore');
    }
    if (options.file && options.firestore) {
        throw new Error('Use either --file or --firestore, not both');
    }

    return options;
}

async function loadFromFile(filePath) {
    const absolutePath = resolve(process.cwd(), filePath);
    const content = await readFile(absolutePath, 'utf8');
    const docs = parseFirestoreExportFile(content);
    console.log(`Parsed ${docs.length} configuration(s) from ${absolutePath}`);
    return docs;
}

async function loadFromFirestore() {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!serviceAccountPath) {
        throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH in server/.env for --firestore mode');
    }

    const serviceAccount = JSON.parse(await readFile(resolve(serviceAccountPath), 'utf8'));
    const { default: admin } = await import('firebase-admin');

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
        });
    }

    const snapshot = await admin.firestore().collection(COLLECTION).get();
    if (snapshot.empty) {
        console.log('No documents found in Firestore collection "configurations"');
        return [];
    }

    const content = JSON.stringify({
        configurations: Object.fromEntries(
            snapshot.docs.map((doc) => [doc.id, doc.data()]),
        ),
    });

    const docs = parseFirestoreExportFile(content);
    console.log(`Fetched ${docs.length} configuration(s) from Firestore`);
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

        const docs = options.file
            ? await loadFromFile(options.file)
            : await loadFromFirestore();

        await importIntoMongo(docs, options);
    } catch (error) {
        console.error(`Import failed: ${error.message}`);
        process.exitCode = 1;
    }
}

main();
