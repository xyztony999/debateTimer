import { ObjectId } from 'mongodb';

export function parseObjectId(value) {
    if (!value) {
        return null;
    }
    if (value instanceof ObjectId) {
        return value;
    }
    const raw = String(value);
    if (!ObjectId.isValid(raw)) {
        return null;
    }
    return new ObjectId(raw);
}
