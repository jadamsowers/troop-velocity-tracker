import { format } from 'date-fns';
import { scoutingClient } from './scoutingClient';
import type { CounselorProfileResponse } from './scoutingClient';
import { cacheManager } from './cache';

export interface UnitCounselor {
    memberId: number;
    /** Matches assignedCounselorUserId on a scout's merit badge. */
    userId?: number;
    name: string;
    email?: string;
    phone?: string;
    availability?: string;
    registrationCurrent: boolean;
    /** Merit badges the counselor is approved for today, sorted by name. */
    badges: string[];
    /** Scouts currently assigned to this counselor in Scoutbook. */
    assignedScouts: number;
}

// Profiles are one request per adult; keep a few in flight at a time so a
// large unit doesn't fire dozens of requests at scouting.org at once.
const CONCURRENCY = 6;

const cacheKey = (unitId: string) => `${unitId}:counselors`;

/** Same rule advancements.scouting.org uses: effective today, and not yet expired. */
export function isApprovalActive(effectiveDt?: string, expiryDt?: string, today = new Date()): boolean {
    if (!effectiveDt) return false;
    // Compare calendar days in local time; the API sends plain YYYY-MM-DD dates.
    const day = format(today, 'yyyy-MM-dd');
    return effectiveDt.slice(0, 10) <= day && (!expiryDt || expiryDt.slice(0, 10) >= day);
}

function toCounselor(profile: CounselorProfileResponse, fallbackName: string): UnitCounselor {
    const badges = [...new Set(
        (profile.meritBadges || [])
            .filter(b => isApprovalActive(b.effectiveDt, b.expiryDt))
            .map(b => b.meritBadgeName.trim()),
    )].sort((a, b) => a.localeCompare(b));
    const first = profile.nickName?.trim() || profile.firstName?.trim();
    return {
        memberId: profile.memberId,
        userId: profile.userId,
        name: first && profile.lastName ? `${first} ${profile.lastName.trim()}` : fallbackName,
        email: profile.email?.email || undefined,
        phone: profile.phone?.fullPhoneNumber || undefined,
        availability: profile.counselorAvailabilityLong || profile.counselorAvailabilityShort || undefined,
        registrationCurrent: profile.hasValidRegistration !== false,
        badges,
        assignedScouts: Array.isArray(profile.youths) ? profile.youths.length : 0,
    };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

/**
 * Adults on the unit roster who are currently approved to counsel at least
 * one merit badge. Cached for an hour alongside the scout roster.
 */
export async function loadUnitCounselors(
    unitId: string,
    { onProgress, refresh = false }: { onProgress?: (done: number, total: number) => void; refresh?: boolean } = {},
): Promise<UnitCounselor[]> {
    if (refresh) cacheManager.remove(cacheKey(unitId));
    const cached = cacheManager.get(cacheKey(unitId));
    if (cached) return cached as UnitCounselor[];

    const roster = await scoutingClient.getUnitAdults(unitId);
    const adults = (roster.users || []).filter(a => a.memberId);
    let done = 0;
    onProgress?.(0, adults.length);

    const profiles = await mapPool(adults, CONCURRENCY, async adult => {
        const fallbackName = `${adult.nickName?.trim() || adult.firstName} ${adult.lastName}`.trim();
        try {
            const profile = await scoutingClient.getCounselorProfile(adult.memberId);
            return toCounselor(profile, fallbackName);
        } catch (e) {
            // One unreadable profile shouldn't hide the rest of the unit.
            console.warn(`Counselor profile unavailable for member ${adult.memberId}`, e);
            return null;
        } finally {
            onProgress?.(++done, adults.length);
        }
    });

    const counselors = profiles
        .filter((c): c is UnitCounselor => !!c && c.badges.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    cacheManager.set(cacheKey(unitId), counselors);
    return counselors;
}
