import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

// All-stack self-hosted mode: serve the Vite build output (STATIC_DIR) after
// the API routes, with an SPA fallback for client-side paths like
// /display/:token. Vite asset filenames carry a content hash, so /assets/*
// can be cached immutable; every other file (index.html, sw.js, manifest) is
// the deploy entry point and must revalidate, or post-release clients keep
// requesting hashed chunks that no longer exist. /api and /health never fall
// back — unknown API paths return a JSON 404, not index.html.

export function createStaticSite({ dir }) {
    const root = path.resolve(dir);
    const indexPath = path.join(root, 'index.html');
    if (!fs.existsSync(indexPath)) {
        throw new Error(`STATIC_DIR has no index.html (looked at ${indexPath}). Build the frontend first (bun run build).`);
    }
    const assetsRoot = path.join(root, 'assets') + path.sep;

    const staticMiddleware = express.static(root, {
        setHeaders(res, filePath) {
            if (filePath.startsWith(assetsRoot)) {
                res.set('Cache-Control', 'public, max-age=30d, immutable');
            } else {
                res.set('Cache-Control', 'no-cache');
            }
        },
    });

    function spaFallback(req, res, next) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            next();
            return;
        }
        const requestPath = req.path;
        if (requestPath === '/api' || requestPath.startsWith('/api/')
            || requestPath === '/health' || requestPath.startsWith('/health/')) {
            res.status(404).json({ success: false, message: 'Not found' });
            return;
        }
        res.set('Cache-Control', 'no-cache');
        res.sendFile(indexPath);
    }

    return [staticMiddleware, spaFallback];
}
