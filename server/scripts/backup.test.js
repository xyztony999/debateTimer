import { reviveDeep } from './backup.js';
import { ObjectId } from 'mongodb';

test('reviveDeep converts 24-hex owner ids back to ObjectId, leaves data alone', () => {
    const ownerId = '507f1f77bcf86cd799439011';
    const revived = reviveDeep({
        name: 'default',
        ownerId,
        nested: { ownerId, keep: '507f1f77bcf86cd799439011-x' },
        stages: [{ _id: ownerId, label: 'A' }],
        teamNames: { aff: '0123456789abcdef01234567' },
    });
    expect(revived.ownerId).toBeInstanceOf(ObjectId);
    expect(revived.nested.ownerId).toBeInstanceOf(ObjectId);
    expect(revived.stages[0]._id).toBeInstanceOf(ObjectId);
    // Values that merely look like ids (not keys) stay strings — team names win.
    expect(revived.teamNames.aff).toBe('0123456789abcdef01234567');
    expect(revived.nested.keep).toBe('507f1f77bcf86cd799439011-x');
    expect(revived.name).toBe('default');
});
