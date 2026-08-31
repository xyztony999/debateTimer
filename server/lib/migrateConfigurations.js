/**
 * Convert a legacy configuration (name stored as _id string, no ownerId)
 * into an owner-scoped document.
 */
export function toOwnedConfiguration(doc, ownerId, now = Date.now()) {
    const name = typeof doc.name === 'string' && doc.name.trim()
        ? doc.name
        : String(doc._id);
    const { _id, ...rest } = doc;
    return {
        ...rest,
        name,
        ownerId,
        shareToken: rest.shareToken || null,
        shareEnabled: Boolean(rest.shareEnabled),
        createdAt: rest.createdAt ?? now,
        updatedAt: rest.updatedAt ?? now,
        _legacyId: _id,
        _legacyStringId: typeof _id === 'string',
    };
}

export async function migrateLegacyConfigurations(configurations, users) {
    const firstAdmin = await users.findOne({ role: 'admin' }, { sort: { createdAt: 1 } });
    if (!firstAdmin) {
        return { migrated: 0 };
    }

    const legacy = await configurations.find({
        $or: [
            { ownerId: { $exists: false } },
            { ownerId: null },
        ],
    }).toArray();

    let migrated = 0;
    for (const doc of legacy) {
        const owned = toOwnedConfiguration(doc, firstAdmin._id);
        const { _legacyId, _legacyStringId, ...payload } = owned;

        if (_legacyStringId) {
            await configurations.insertOne(payload);
            await configurations.deleteOne({ _id: _legacyId });
        } else {
            await configurations.updateOne(
                { _id: doc._id },
                {
                    $set: {
                        ownerId: firstAdmin._id,
                        name: payload.name,
                        shareToken: payload.shareToken,
                        shareEnabled: payload.shareEnabled,
                    },
                },
            );
        }
        migrated += 1;
    }

    return { migrated };
}
