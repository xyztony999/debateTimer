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

    // Named event to every display client subscribed to one share token
    // (timer state snapshots and session lifecycle). Unrelated to broadcast().
    function sendToToken(shareToken, event = 'change', payload = {}) {
        if (!shareToken) {
            return;
        }
        const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        for (const client of clients) {
            if (client.shareToken && client.shareToken === shareToken) {
                client.res.write(frame);
            }
        }
    }

    // Named event to a user's own authenticated stream. The host console
    // listens here — it must NOT open a second display-stream connection:
    // browsers cap same-origin HTTP/1.1 at 6 connections and SSE never
    // releases, so every extra stream starves the heartbeat requests.
    function sendToOwner(ownerId, event = 'change', payload = {}) {
        if (ownerId == null) {
            return;
        }
        const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        for (const client of clients) {
            if (!client.shareToken && client.userId && String(client.userId) === String(ownerId)) {
                client.res.write(frame);
            }
        }
    }

    return { add, broadcast, sendToToken, sendToOwner };
}

export function initSseResponse(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
}
