/**
 * In-memory stand-in for a MongoDB collection, for route tests.
 *
 * Covers the subset the server actually uses: equality / $ne / $exists /
 * $lt-family / $in / $or / $and matchers (dot paths included), update
 * operators ($set / $unset / $pull / $inc / $setOnInsert), aggregation-pipeline
 * updates ($set with $cond / $eq / "$field" references), upserts, cursors with
 * sort / skip / limit / projection, countDocuments and the delete family.
 * ObjectId and Date values keep their types.
 */
import { ObjectId } from 'mongodb';

function isOperatorObject(value) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && !(value instanceof Date)
        && !(value instanceof ObjectId)
        && !Buffer.isBuffer(value)
        && !(value instanceof RegExp)
        && Object.keys(value).some((key) => key.startsWith('$'));
}

function isPlainObject(value) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && !(value instanceof Date)
        && !(value instanceof ObjectId)
        && !Buffer.isBuffer(value)
        && !(value instanceof RegExp);
}

export function clone(value) {
    if (Array.isArray(value)) {
        return value.map(clone);
    }
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, clone(inner)]));
    }
    // ObjectId / Date / Buffer / RegExp / primitives are handed back as-is.
    return value;
}

function valuesEqual(a, b) {
    if (a instanceof ObjectId || b instanceof ObjectId) {
        return a instanceof ObjectId && b instanceof ObjectId && a.equals(b);
    }
    if (a instanceof Date || b instanceof Date) {
        return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    }
    if (Buffer.isBuffer(a) || Buffer.isBuffer(b)) {
        return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.equals(b);
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, index) => valuesEqual(item, b[index]));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every((key) => valuesEqual(a[key], b[key]));
    }
    if (a === null || a === undefined || b === null || b === undefined) {
        return a === b || (a == null && b == null);
    }
    return a === b;
}

function compare(a, b) {
    if (valuesEqual(a, b)) {
        return 0;
    }
    if (a instanceof ObjectId && b instanceof ObjectId) {
        return a.toHexString() < b.toHexString() ? -1 : 1;
    }
    if ((a instanceof Date || b instanceof Date) || typeof a === 'number' || typeof b === 'number') {
        const left = a instanceof Date ? a.getTime() : a;
        const right = b instanceof Date ? b.getTime() : b;
        return left < right ? -1 : 1;
    }
    return String(a) < String(b) ? -1 : 1;
}

function getPath(doc, path) {
    return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), doc);
}

function setPath(doc, path, value) {
    const keys = path.split('.');
    let node = doc;
    keys.slice(0, -1).forEach((key) => {
        if (!isPlainObject(node[key])) {
            node[key] = {};
        }
        node = node[key];
    });
    node[keys[keys.length - 1]] = clone(value);
}

function unsetPath(doc, path) {
    const keys = path.split('.');
    let node = doc;
    keys.slice(0, -1).forEach((key) => {
        node = node == null ? undefined : node[key];
    });
    if (node != null) {
        delete node[keys[keys.length - 1]];
    }
}

function arrayContains(value, expected) {
    return Array.isArray(value) && value.some((item) => valuesEqual(item, expected));
}

function matchValue(value, condition) {
    if (condition instanceof RegExp) {
        return typeof value === 'string' && condition.test(value);
    }
    if (condition === null) {
        return value === null || value === undefined;
    }
    if (!isPlainObject(condition) || Object.keys(condition).length === 0) {
        if (Array.isArray(value) && !(Array.isArray(condition))) {
            return arrayContains(value, condition) || valuesEqual(value, condition);
        }
        return valuesEqual(value, condition);
    }
    return Object.entries(condition).every(([operator, operand]) => {
        switch (operator) {
            case '$eq': return valuesEqual(value, operand) || arrayContains(value, operand);
            case '$ne': return !(valuesEqual(value, operand) || arrayContains(value, operand));
            case '$exists': return operand ? value !== undefined : value === undefined;
            case '$lt': return value !== undefined && value !== null && !(value instanceof Array) && compare(value, operand) < 0;
            case '$lte': return value !== undefined && value !== null && compare(value, operand) <= 0;
            case '$gt': return value !== undefined && value !== null && compare(value, operand) > 0;
            case '$gte': return value !== undefined && value !== null && compare(value, operand) >= 0;
            case '$in': return (Array.isArray(operand) ? operand : []).some(
                (candidate) => valuesEqual(value, candidate) || arrayContains(value, candidate),
            );
            case '$nin': return !(Array.isArray(operand) ? operand : []).some(
                (candidate) => valuesEqual(value, candidate) || arrayContains(value, candidate),
            );
            default: throw new Error(`fakeCollection: unsupported operator ${operator}`);
        }
    });
}

export function matchesQuery(doc, query = {}) {
    return Object.entries(query).every(([key, condition]) => {
        if (key === '$or') {
            return condition.some((sub) => matchesQuery(doc, sub));
        }
        if (key === '$and') {
            return condition.every((sub) => matchesQuery(doc, sub));
        }
        if (key === '$nor') {
            return !condition.some((sub) => matchesQuery(doc, sub));
        }
        return matchValue(getPath(doc, key), condition);
    });
}

function evaluate(expression, doc) {
    if (typeof expression === 'string' && expression.startsWith('$')) {
        return getPath(doc, expression.slice(1));
    }
    if (isPlainObject(expression)) {
        const [operator] = Object.keys(expression);
        if (operator === '$eq') {
            const [left, right] = expression.$eq.map((side) => evaluate(side, doc));
            return valuesEqual(left, right);
        }
        if (operator === '$cond') {
            const [check, then, other] = expression.$cond;
            return evaluate(check, doc) ? evaluate(then, doc) : evaluate(other, doc);
        }
        return Object.fromEntries(Object.entries(expression).map(([key, inner]) => [key, evaluate(inner, doc)]));
    }
    if (Array.isArray(expression)) {
        return expression.map((inner) => evaluate(inner, doc));
    }
    return expression;
}

function applyUpdate(doc, update) {
    if (Array.isArray(update)) {
        for (const stage of update) {
            // MongoDB evaluates every expression of a stage against the
            // document as it was BEFORE that stage.
            const before = clone(doc);
            for (const [key, value] of Object.entries(stage)) {
                if (key !== '$set') {
                    throw new Error(`fakeCollection: unsupported pipeline stage ${key}`);
                }
                const resolved = Object.entries(value).map(([path, expression]) => [path, evaluate(expression, before)]);
                for (const [path, result] of resolved) {
                    setPath(doc, path, result);
                }
            }
        }
        return;
    }
    for (const [operator, spec] of Object.entries(update)) {
        for (const [path, operand] of Object.entries(spec)) {
            switch (operator) {
                case '$set': setPath(doc, path, operand); break;
                case '$setOnInsert': if (getPath(doc, path) === undefined) setPath(doc, path, operand); break;
                case '$unset': unsetPath(doc, path); break;
                case '$inc': {
                    const current = Number(getPath(doc, path)) || 0;
                    setPath(doc, path, current + operand);
                    break;
                }
                case '$pull': {
                    const current = getPath(doc, path);
                    if (Array.isArray(current)) {
                        const keep = current.filter((item) => {
                            if (isPlainObject(operand) && operand.$in) {
                                return !operand.$in.some((candidate) => valuesEqual(item, candidate));
                            }
                            return !valuesEqual(item, operand);
                        });
                        setPath(doc, path, keep);
                    }
                    break;
                }
                default: throw new Error(`fakeCollection: unsupported update operator ${operator}`);
            }
        }
    }
}

function applyProjection(doc, projection) {
    // Always work on a copy: an exclusion projection must never strip fields
    // off the stored document itself.
    const copy = clone(doc);
    if (!projection || Object.keys(projection).length === 0) {
        return copy;
    }
    const include = Object.values(projection)[0];
    if (include) {
        const out = {};
        // MongoDB always returns _id with an inclusion projection unless it is
        // explicitly excluded with _id: 0.
        const keys = ['_id', ...Object.keys(projection)];
        for (const key of keys) {
            if (projection[key] === 0) {
                continue;
            }
            if (getPath(copy, key) !== undefined) {
                setPath(out, key, getPath(copy, key));
            }
        }
        return out;
    }
    for (const key of Object.keys(projection)) {
        unsetPath(copy, key);
    }
    return copy;
}

function sortSpec(comparePairs) {
    return (left, right) => {
        for (const [key, direction] of comparePairs) {
            const order = compare(getPath(left, key), getPath(right, key));
            if (order !== 0) {
                return order * (direction < 0 ? -1 : 1);
            }
        }
        return 0;
    };
}

export function createFakeCollection(seed = []) {
    /** @type {Map<string, object>} */
    const docs = new Map();
    const keyOf = (id) => String(id);

    const insert = (doc) => {
        const stored = clone(doc);
        if (stored._id === undefined) {
            stored._id = new ObjectId();
        }
        docs.set(keyOf(stored._id), stored);
        return stored._id;
    };
    seed.forEach(insert);

    function find(query = {}, options = {}) {
        let spec = options.sort;
        let skip = options.skip ?? 0;
        let limit = options.limit ?? 0;
        let projection = options.projection;
        const cursor = {
            sort(next) { spec = next; return cursor; },
            skip(next) { skip = next; return cursor; },
            limit(next) { limit = next; return cursor; },
            project(next) { projection = next; return cursor; },
            async toArray() {
                let rows = [...docs.values()].filter((doc) => matchesQuery(doc, query));
                if (spec) {
                    rows = [...rows].sort(sortSpec(Object.entries(spec)));
                }
                if (skip > 0) {
                    rows = rows.slice(skip);
                }
                if (limit > 0) {
                    rows = rows.slice(0, limit);
                }
                return rows.map((doc) => applyProjection(doc, projection));
            },
        };
        return cursor;
    }

    function update(filter, update, { upsert = false } = {}) {
        const targets = [...docs.values()].filter((doc) => matchesQuery(doc, filter));
        if (targets.length === 0 && upsert) {
            const seeded = {};
            for (const [path, condition] of Object.entries(filter)) {
                if (path.startsWith('$') || isOperatorObject(condition)) {
                    continue;
                }
                setPath(seeded, path, condition);
            }
            const id = insert(seeded);
            const created = docs.get(keyOf(id));
            applyUpdate(created, update);
            return { acknowledged: true, matchedCount: 0, modifiedCount: 1, upsertedId: id };
        }
        let modified = 0;
        for (const doc of targets) {
            const before = JSON.stringify(doc, replacer);
            applyUpdate(doc, update);
            if (JSON.stringify(doc, replacer) !== before) {
                modified += 1;
            }
        }
        return { acknowledged: true, matchedCount: targets.length, modifiedCount: modified };
    }

    return {
        docs,
        insert,
        async insertOne(doc) {
            const insertedId = insert(doc);
            return { acknowledged: true, insertedId };
        },
        async insertMany(list) {
            const insertedIds = list.map(insert);
            return { acknowledged: true, insertedIds };
        },
        async findOne(query = {}, options = {}) {
            const found = [...docs.values()].find((doc) => matchesQuery(doc, query));
            return found ? applyProjection(found, options.projection) : null;
        },
        find,
        async countDocuments(query = {}) {
            return [...docs.values()].filter((doc) => matchesQuery(doc, query)).length;
        },
        async updateOne(filter, updateSpec, options) {
            const first = [...docs.values()].find((doc) => matchesQuery(doc, filter));
            if (first) {
                return update({ _id: first._id }, updateSpec, options);
            }
            return options?.upsert ? update(filter, updateSpec, options) : { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        },
        async updateMany(filter, updateSpec, options) {
            return update(filter, updateSpec, options);
        },
        async deleteMany(filter = {}) {
            const targets = [...docs.values()].filter((doc) => matchesQuery(doc, filter));
            targets.forEach((doc) => docs.delete(keyOf(doc._id)));
            return { acknowledged: true, deletedCount: targets.length };
        },
        async deleteOne(filter = {}) {
            const first = [...docs.values()].find((doc) => matchesQuery(doc, filter));
            if (first) {
                docs.delete(keyOf(first._id));
            }
            return { acknowledged: true, deletedCount: first ? 1 : 0 };
        },
        /** Test helper: the stored document (not a projection), or null. */
        raw(id) {
            const found = docs.get(keyOf(id));
            return found ? clone(found) : null;
        },
    };
}

// JSON view that keeps ObjectId / Date / Buffer comparable for change detection.
function replacer(_key, value) {
    if (value instanceof ObjectId) {
        return `oid:${value.toHexString()}`;
    }
    if (value instanceof Date) {
        return `date:${value.getTime()}`;
    }
    if (Buffer.isBuffer(value)) {
        return `buf:${value.toString('hex')}`;
    }
    return value;
}
