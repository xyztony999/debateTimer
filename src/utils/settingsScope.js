/**
 * Settings-page scoping helpers (admin deep links from the admin console).
 * Pure functions so the two admin-edit bugs stay regression-tested.
 */

/**
 * An admin editing THEIR OWN templates must behave exactly like a normal
 * visit: no "editing another user" banner, template memory kept. Only a
 * genuinely different ownerId keeps the acting-on-behalf scope.
 */
export function normalizeOwnerScope(requestedOwnerId, userId) {
    if (!requestedOwnerId) {
        return undefined;
    }
    if (userId && String(requestedOwnerId) === String(userId)) {
        return undefined;
    }
    return requestedOwnerId;
}

/**
 * Initial template priority: admin deep link (?name=) > last-used memory >
 * fallback (default template). A requested name missing from the list (e.g.
 * deleted in another tab) falls through silently.
 */
export function pickInitialTemplate(names, requestedName, storedName, fallbackName) {
    const list = names || [];
    if (requestedName && list.includes(requestedName)) {
        return requestedName;
    }
    if (storedName && list.includes(storedName)) {
        return storedName;
    }
    return list.includes(fallbackName) || list.length === 0
        ? fallbackName
        : list[0];
}
