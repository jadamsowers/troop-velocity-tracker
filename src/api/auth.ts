const TOKEN_KEY = 'scoutbook_token';
const UNIT_ID_KEY = 'scoutbook_unit_id';

export const auth = {
    getToken: () => localStorage.getItem(TOKEN_KEY),
    setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
    getUnitId: () => localStorage.getItem(UNIT_ID_KEY),
    setUnitId: (unitId: string) => localStorage.setItem(UNIT_ID_KEY, unitId),
    isAuthenticated: () => !!localStorage.getItem(TOKEN_KEY),
    logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(UNIT_ID_KEY);
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
