export function buildMongoUri() {
    if (process.env.MONGODB_URI) {
        return process.env.MONGODB_URI;
    }

    const host = process.env.MONGODB_HOST || '127.0.0.1';
    const port = process.env.MONGODB_PORT || '27017';
    const database = process.env.MONGODB_DB || 'debatetimer';
    const user = process.env.MONGODB_USER;
    const password = process.env.MONGODB_PASSWORD;
    const authSource = process.env.MONGODB_AUTH_SOURCE || database;

    if (user && password) {
        return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=${encodeURIComponent(authSource)}`;
    }

    return `mongodb://${host}:${port}/${database}`;
}
