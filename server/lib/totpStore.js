/**
 * Database side of two-factor verification: every write to `users.totp`.
 *
 * Each state change is one conditional update, so two requests racing on the
 * same account (a replayed code, two tabs, a reset during sign-in) cannot
 * both succeed — the second one simply matches nothing.
 */

/** Stores a not-yet-confirmed secret for enrolment. Overwrites any earlier pending one. */
export async function setPendingTotp(users, userId, pending) {
    const result = await users.updateOne({ _id: userId }, { $set: { 'totp.pending': pending } });
    return result.matchedCount === 1;
}

/**
 * Activates two-factor verification once the user has confirmed one code.
 * Replaces the whole `totp` sub-document (pending enrolment included) and
 * only if the pending secret is still the one that was confirmed.
 */
export async function activateTotp(users, userId, pendingSecretEnc, active) {
    const result = await users.updateOne(
        { _id: userId, 'totp.pending.secretEnc': pendingSecretEnc },
        { $set: { totp: active } },
    );
    return result.modifiedCount === 1;
}

/**
 * Records `step` as used if it is newer than the last used step.
 * Returns false when the code was already used (or lost a race).
 */
export async function consumeTotpStep(users, userId, secretEnc, step) {
    const result = await users.updateOne(
        {
            _id: userId,
            'totp.enabled': true,
            'totp.secretEnc': secretEnc,
            $or: [
                { 'totp.lastUsedStep': { $exists: false } },
                { 'totp.lastUsedStep': { $lt: step } },
            ],
        },
        { $set: { 'totp.lastUsedStep': step } },
    );
    return result.modifiedCount === 1;
}

/** Removes one recovery code hash. Returns false when it is unknown or already used. */
export async function consumeRecoveryCode(users, userId, codeHash) {
    const result = await users.updateOne(
        { _id: userId, 'totp.enabled': true, 'totp.recoveryCodeHashes': codeHash },
        { $pull: { 'totp.recoveryCodeHashes': codeHash } },
    );
    return result.modifiedCount === 1;
}

export function countRecoveryCodes(userDoc) {
    return Array.isArray(userDoc?.totp?.recoveryCodeHashes) ? userDoc.totp.recoveryCodeHashes.length : null;
}

/** Removes the `totp` sub-document. Sessions are left alone (self-disable). */
export async function clearTotp(users, userId) {
    const result = await users.updateOne({ _id: userId }, { $unset: { totp: '' } });
    return result.modifiedCount === 1;
}

/** Removes two-factor verification from an account and signs it out everywhere. */
export async function removeTotp(users, sessions, userId) {
    const removed = await clearTotp(users, userId);
    const signedOut = await sessions.deleteMany({ userId });
    return { removed, sessionsDestroyed: signedOut?.deletedCount ?? 0 };
}
