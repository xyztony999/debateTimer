import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hasPendingGates } from '../utils/authFlow';

export default function ProtectedRoute({ children, adminOnly = false }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return null;
    }

    if (!user) {
        const next = `${location.pathname}${location.search}`;
        return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
    }

    if (adminOnly && user.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    // Signed in, but the account still owes a step (privacy notice, mandatory
    // two-step setup). The server refuses every business call with
    // 403 GATE_REQUIRED until it is done, so go straight to the gate page.
    if (hasPendingGates(user)) {
        const next = `${location.pathname}${location.search}`;
        return <Navigate to={`/gate?next=${encodeURIComponent(next)}`} replace />;
    }

    return children;
}
