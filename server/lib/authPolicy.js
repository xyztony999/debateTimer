export function parseAllowRegistration(value) {
    const normalized = String(value || '').toLowerCase();
    return normalized === 'true' || normalized === '1';
}

export function isRegistrationOpen(userCount, allowRegistration) {
    if (userCount === 0) {
        return true;
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
