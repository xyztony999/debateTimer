// _id of the singleton app_settings doc holding the admin-managed toggle.
// A fixed string id gives the doc uniqueness for free (no extra index) and,
// being non-24-hex, survives backup round-trips as a plain string.
export const REGISTRATION_SETTING_ID = 'registration';

export function parseAllowRegistration(value) {
    const normalized = String(value || '').toLowerCase();
    return normalized === 'true' || normalized === '1';
}

export function isRegistrationOpen(userCount, allowRegistration, adminSetting) {
    // First-user short circuit stays ahead of everything: a fresh deployment
    // must never be locked out by a stale "closed" doc in app_settings.
    if (userCount === 0) {
        return true;
    }
    // DB value (set from the admin console) wins over the env fallback; an
    // unset adminSetting keeps the env-only behavior byte-compatible.
    if (adminSetting !== undefined) {
        return Boolean(adminSetting);
    }
    return Boolean(allowRegistration);
}

export function resolveOwnerId(user, requestedOwnerId) {
    if (user?.role === 'admin' && requestedOwnerId) {
        return requestedOwnerId;
    }
    return user?.id;
}

export function canAccessConfig(user, doc) {
    if (!user || !doc) {
        return false;
    }
    if (user.role === 'admin') {
        return true;
    }
    return String(doc.ownerId) === String(user.id);
}

export function publicUser(user) {
    if (!user) {
        return null;
    }
    return {
        id: String(user._id ?? user.id),
        username: user.username,
        role: user.role,
    };
}
