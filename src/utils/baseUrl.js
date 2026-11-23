// Base-path aware URL helpers.
//
// The GitHub Pages deployment injects VITE_BASE=/app/ (the official site
// lives at the domain root, the app moved under /app/). Local dev, vite
// preview and self-host builds keep the default '/', so every helper here
// is a no-op there. Always consumed at URL-build time (share links, boot
// route restore) — never for router-internal navigation, which the Router
// basename already covers.

/**
 * Prefix an in-app path with the deploy base: '/display/x' → '/app/display/x'
 * (Pages) or '/display/x' (default). `path` must start with '/' or ''.
 */
export function appPath(path) {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
    const suffix = path || '';
    return base + (suffix.startsWith('/') ? suffix : `/${suffix}`);
}
