import { auth } from './auth';

// /scouting-api is proxied to https://api.scouting.org — by Vite in dev, by the
// bundled Node server in prod (see login-helper/server.mjs). Same path both ways.
const BASE_URL = '/scouting-api';
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
            // Token rejected: drop it (keeping the unit) so the app returns to
            // sign-in. Skipped during setup, which handles its own errors.
            if (!isInSetupMode) {
                auth.expireSession();
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

export type UnitLeadershipResponse = Array<{
    userId: number;
    memberId: number;
    leadershipPositionHistory?: Array<{
        position: string;
        startDate?: string;
        /** Empty or missing while the scout still holds the position. */
        endDate?: string | null;
        approved?: boolean;
    }>;
}>;

export interface UnitAdultsResponse {
    users?: Array<{
        memberId: number;
        firstName: string;
        lastName: string;
        nickName?: string | null;
    }>;
}

export interface CounselorProfileResponse {
    memberId: number;
    firstName?: string;
    lastName?: string;
    nickName?: string;
    email?: { email?: string } | null;
    phone?: { fullPhoneNumber?: string } | null;
    counselorAvailabilityShort?: string;
    counselorAvailabilityLong?: string;
    hasValidRegistration?: boolean;
    meritBadges?: Array<{
        meritBadgeId: number;
        meritBadgeName: string;
        effectiveDt?: string;
        /** Empty string when the approval is open-ended. */
        expiryDt?: string;
    }>;
    youths?: unknown[];
}

export const scoutingClient = {
    setSetupMode: (mode: boolean) => { isInSetupMode = mode; },

    getUnitRoster: (unitGuid: string): Promise<RosterResponse> =>
        scoutingFetch(`/organizations/v2/units/${unitGuid}/youths`),

    /** Every youth in the unit with their full leadership position history. */
    getUnitLeadershipPositions: (unitGuid: string): Promise<UnitLeadershipResponse> =>
        scoutingFetch(`/organizations/v2/units/${unitGuid}/leadershipPositions`),

    getUnitAdults: (unitGuid: string): Promise<UnitAdultsResponse> =>
        scoutingFetch(`/organizations/v2/units/${unitGuid}/adults`),

    getCounselorProfile: (memberId: number): Promise<CounselorProfileResponse> =>
        scoutingFetch(`/advancements/v2/meritBadges/counselors/${memberId}/profile`),

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
