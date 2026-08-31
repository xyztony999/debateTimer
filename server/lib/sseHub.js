/**
 * Scoped SSE: authenticated clients receive their own (or all, if admin) config
 * changes; display clients receive only the matching share token.
 */
export function createSseHub() {
    /** @type {Set<{ res: import('express').Response, userId?: string, isAdmin?: boolean, shareToken?: string }>} */
    const clients = new Set();

    function add(client) {
        clients.add(client);
        client.res.write(': connected\n\n');
        client.res.on('close', () => {
            clients.delete(client);
        });
    }

    function broadcast(event = {}) {
        const payload = `event: change\ndata: ${JSON.stringify(event)}\n\n`;
        for (const client of clients) {
            if (client.shareToken) {
                if (event.shareToken && client.shareToken === event.shareToken) {
                    client.res.write(payload);
                }
                continue;
            }
            if (client.isAdmin) {
                client.res.write(payload);
                continue;
            }
            if (event.ownerId && client.userId && String(client.userId) === String(event.ownerId)) {
                client.res.write(payload);
            }
        }
    }

    return { add, broadcast };
}

export function initSseResponse(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
}
