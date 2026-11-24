#!/usr/bin/env node
/**
 * Reset two-factor verification for one account, from the server.
 *
 * Use when an account has lost its authenticator and has no recovery code
 * left. This needs shell access to the API server — that out-of-band access
 * is the authority for the reset. The account is signed out everywhere and
 * the reset is written to the audit log. An administrator account will be
 * asked to enroll again on its next sign-in.
 *
 * Usage:
 *   node scripts/reset-totp.js --username <name>            # asks to confirm
 *   node scripts/reset-totp.js --username <name> --yes      # no prompt (automation)
 */
import 'dotenv/config';
import { createInterface } from 'node:readline';
import { MongoClient } from 'mongodb';
import { buildMongoUri } from '../lib/mongoUri.js';
import { resetTotpByUsername } from './lib/resetTotpAccount.js';

const args = process.argv.slice(2);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const username = value('--username');
const skipPrompt = args.includes('--yes');

function confirm(name) {
    if (skipPrompt) {
        return Promise.resolve(true);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(`Type the username "${name}" to confirm the reset: `, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === name);
        });
    });
}

async function main() {
    if (!username) {
        throw new Error('Provide --username <name> (see the header of this script).');
    }
    const confirmed = await confirm(username.trim().toLowerCase());
    if (!confirmed) {
        console.log('Cancelled — nothing was changed.');
        return;
    }

    const client = new MongoClient(buildMongoUri());
    await client.connect();
    const db = client.db();
    try {
        const result = await resetTotpByUsername({
            users: db.collection('users'),
            sessions: db.collection('sessions'),
            auditLogs: db.collection('audit_logs'),
        }, username);
        if (!result.ok) {
            console.log(result.reason === 'not_found'
                ? `No account named "${result.username}".`
                : `Two-factor verification is not enabled for "${result.username}" — nothing to reset.`);
            return;
        }
        console.log(`Two-factor verification reset for "${result.username}" `
            + `(${result.sessionsDestroyed} session(s) ended). An administrator will be asked to enroll again at the next sign-in.`);
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error(`reset failed: ${error.message}`);
    process.exitCode = 1;
});
