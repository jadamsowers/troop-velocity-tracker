const TOKEN_KEY = 'scoutbook_token';
const UNIT_ID_KEY = 'scoutbook_unit_id';
const UNIT_LABEL_KEY = 'scoutbook_unit_label';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
const AUTH_BASE = import.meta.env.DEV ? '/auth-api' : `${WORKER_URL}/auth`;

export interface LoginResult {
    token: string;
    userId: string;
}

export async function loginWithCredentials(username: string, password: string): Promise<LoginResult> {
    const res = await fetch(`${AUTH_BASE}/api/users/${encodeURIComponent(username)}/authenticate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json; version=2',
        },
        body: JSON.stringify({ password }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Login failed (${res.status})`);
    }

    const data = await res.json();
    if (!data.token) {
        throw new Error('No token in response');
    }

    return {
        token: data.token,
        userId: data.account?.userId?.toString() || '',
    };
}

export const auth = {
    getToken: () => localStorage.getItem(TOKEN_KEY),
    setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
    getUnitId: () => localStorage.getItem(UNIT_ID_KEY),
    setUnitId: (unitId: string) => localStorage.setItem(UNIT_ID_KEY, unitId),
    /** Human-readable label from setup (e.g. "Troop 405"); not derivable from GUID */
    getUnitLabel: () => localStorage.getItem(UNIT_LABEL_KEY),
    setUnitLabel: (label: string) =>
        localStorage.setItem(UNIT_LABEL_KEY, label),
    isAuthenticated: () => !!localStorage.getItem(TOKEN_KEY),
    logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(UNIT_ID_KEY);
        localStorage.removeItem(UNIT_LABEL_KEY);
    },
    getUserIds: (token?: string) => {
        const tokenToUse = token || localStorage.getItem(TOKEN_KEY);
        if (!tokenToUse) return null;
        try {
            const payload = JSON.parse(atob(tokenToUse.split('.')[1]));
            return {
                userId: payload.uid,
                personGuid: payload.pgu
            };
        } catch (e) {
            console.error("Failed to decode token", e);
            return null;
        }
    }
};
