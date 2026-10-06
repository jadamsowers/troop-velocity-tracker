const TOKEN_KEY = 'scoutbook_token';
const UNIT_ID_KEY = 'scoutbook_unit_id';
const UNIT_LABEL_KEY = 'scoutbook_unit_label';

// Treat a token as expired slightly early so a request doesn't race the
// server-side expiry and come back 401 mid-load.
const EXPIRY_SKEW_MS = 60_000;

export interface LoginUnit {
    guid: string;
    name: string;
}

export interface LoginResult {
    token: string;
    units: LoginUnit[];
}

function decodePayload(token: string): Record<string, unknown> | null {
    try {
        const part = token.split('.')[1];
        if (!part) return null;
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

/** Expiry of a JWT in epoch ms, or null if it has no `exp` claim. */
function getExpiry(token: string): number | null {
    const exp = decodePayload(token)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
}

function isValid(token: string | null): token is string {
    if (!token || token.split('.').length !== 3) return false;
    if (!decodePayload(token)) return false;
    const expiry = getExpiry(token);
    // No exp claim: assume valid and let a 401 from the API end the session.
    return expiry === null || expiry - EXPIRY_SKEW_MS > Date.now();
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
    /** True only when a stored token exists and has not expired. */
    isAuthenticated: () => isValid(localStorage.getItem(TOKEN_KEY)) && !!localStorage.getItem(UNIT_ID_KEY),
    hasValidToken: () => isValid(localStorage.getItem(TOKEN_KEY)),
    /** Epoch ms when the stored token expires (minus skew), or null if unknown. */
    getSessionExpiry: () => {
        const token = localStorage.getItem(TOKEN_KEY);
        const expiry = token ? getExpiry(token) : null;
        return expiry === null ? null : expiry - EXPIRY_SKEW_MS;
    },
    /** Drop an expired/rejected token but remember the unit for re-login. */
    expireSession: () => localStorage.removeItem(TOKEN_KEY),
    logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(UNIT_ID_KEY);
        localStorage.removeItem(UNIT_LABEL_KEY);
    },
    /**
     * Sign in to my.scouting.org via the app's server (scouting.org doesn't
     * allow cross-origin calls from the browser). The server forwards the
     * credentials once and keeps nothing; only the returned token is stored,
     * and only by the caller.
     */
    loginWithCredentials: async (username: string, password: string): Promise<LoginResult> => {
        let res: Response;
        try {
            res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
                cache: 'no-store',
            });
        } catch {
            throw new Error('Could not reach the sign-in service. Check your connection and try again.');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.token) {
            throw new Error(data?.error || `Sign-in failed (${res.status}).`);
        }
        return { token: data.token, units: Array.isArray(data.units) ? data.units : [] };
    },
    getUserIds: (token?: string) => {
        const tokenToUse = token || localStorage.getItem(TOKEN_KEY);
        if (!tokenToUse) return null;
        const payload = decodePayload(tokenToUse);
        if (!payload) {
            console.error("Failed to decode token");
            return null;
        }
        return {
            userId: String(payload.uid),
            personGuid: payload.pgu as string
        };
    }
};
