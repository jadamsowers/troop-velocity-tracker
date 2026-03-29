import { auth } from './auth';

// In dev, Vite proxies /scouting-api → https://api.scouting.org to bypass CORS.
// In production the app must be served from a domain the API allows, or behind a real proxy.
const BASE_URL = import.meta.env.DEV ? '/scouting-api' : 'https://api.scouting.org';
const ESB_URL = 'aHR0cHM6Ly9hZHZhbmNlbWVudHMuc2NvdXRpbmcub3JnL3Jvc3Rlcg==';

// Flag to prevent auto-logout during setup/validation
let isInSetupMode = false;

async function scoutingFetch(endpoint: string, options: RequestInit = {}, token?: string) {
    const tokenToUse = token || auth.getToken();
    if (!tokenToUse) throw new Error('No authentication token found');

    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${tokenToUse}`,
            'x-esb-url': ESB_URL,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        if (response.status === 401) {
            // Only auto-logout if not in setup mode
            if (!isInSetupMode) {
                auth.logout();
                window.location.reload();
            }
        }
        const errorText = await response.text();
        console.error(`API Error (${response.status}):`, errorText);
        throw new Error(`API Error ${response.status}: ${response.statusText}${errorText ? ` - ${errorText.substring(0, 100)}` : ''}`);
    }

    return response.json();
}

export interface Scout {
    personGuid: string;
    firstName: string;
    lastName: string;
    dob?: string;
}

export interface RosterResponse {
    users: Array<{
        userId: number;
        personGuid: string;
        firstName: string;
        lastName: string;
        dob?: string;
    }>;
}

export const scoutingClient = {
    setSetupMode: (mode: boolean) => { isInSetupMode = mode; },

    getUnitRoster: (unitGuid: string): Promise<RosterResponse> =>
        scoutingFetch(`/organizations/v2/units/${unitGuid}/youths`),

    getPersonProfile: (userId: string) =>
        scoutingFetch(`/persons/v2/${userId}/personprofile`),

    getMyScouts: (userId: string) =>
        scoutingFetch(`/persons/${userId}/myScout`),

    getScoutProfile: (userId: string) =>
        scoutingFetch(`/persons/v2/${userId}/personprofile`),

    getRanks: (userId: string) =>
        scoutingFetch(`/advancements/v2/youth/${userId}/ranks`),

    getMeritBadges: (userId: string) =>
        scoutingFetch(`/advancements/v2/youth/${userId}/meritBadges`),

    // Join Date is often found in membership history
    getMembershipRegistrations: (personGuid: string) =>
        scoutingFetch(`/persons/v2/${personGuid}/membershipRegistrations`, { method: 'POST', body: JSON.stringify({}) }),
};
