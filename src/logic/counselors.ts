import type { UnitCounselor } from '../api/counselors';
import type { ScoutAdvancement } from './advancement';
import { EAGLE_REQUIRED_BUCKETS, calculateMissingEagleRequired } from './advancement';

export interface CounselorRef {
    memberId: number;
    name: string;
}

export interface BadgeCoverage {
    badge: string;
    counselors: CounselorRef[];
    /** Eagle-required bucket this badge satisfies, if any. */
    eagleBucket?: string;
}

export interface EagleBucketCoverage {
    bucket: string;
    options: { badge: string; counselors: CounselorRef[] }[];
    /** Distinct counselors across every option in the bucket. */
    counselorCount: number;
    /** Scouts on the roster who still need this bucket. */
    scoutsNeeding: number;
}

/** Normalize badge names so "Citizenship in the Nation" matches regardless of case or punctuation. */
export const badgeKey = (name: string) =>
    name.toLowerCase().replace(/merit badge/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const BUCKET_BY_BADGE = new Map(
    EAGLE_REQUIRED_BUCKETS.flatMap(b => b.options.map(o => [badgeKey(o), b.name] as const)),
);

export const eagleBucketFor = (badge: string) => BUCKET_BY_BADGE.get(badgeKey(badge));

/** badgeKey → counselors approved for it. */
export function counselorIndex(counselors: UnitCounselor[]): Map<string, CounselorRef[]> {
    const index = new Map<string, CounselorRef[]>();
    for (const c of counselors) {
        for (const badge of c.badges) {
            const key = badgeKey(badge);
            const list = index.get(key) ?? [];
            list.push({ memberId: c.memberId, name: c.name });
            index.set(key, list);
        }
    }
    return index;
}

/** Every badge the unit can counsel, alphabetically. */
export function badgeCoverage(counselors: UnitCounselor[]): BadgeCoverage[] {
    const names = new Map<string, string>();
    for (const c of counselors) for (const b of c.badges) if (!names.has(badgeKey(b))) names.set(badgeKey(b), b);
    const index = counselorIndex(counselors);
    return [...names.entries()]
        .map(([key, badge]) => ({ badge, counselors: index.get(key) ?? [], eagleBucket: eagleBucketFor(badge) }))
        .sort((a, b) => a.badge.localeCompare(b.badge));
}

/** The 13 Eagle-required buckets with unit coverage and scout demand. */
export function eagleCoverage(
    counselors: UnitCounselor[],
    scouts: { data: ScoutAdvancement }[],
): EagleBucketCoverage[] {
    const index = counselorIndex(counselors);
    const demand = new Map<string, number>();
    for (const s of scouts) {
        for (const bucket of calculateMissingEagleRequired(s.data?.earnedMeritBadges || [])) {
            demand.set(bucket, (demand.get(bucket) ?? 0) + 1);
        }
    }
    return EAGLE_REQUIRED_BUCKETS.map(b => {
        const options = b.options.map(badge => ({ badge, counselors: index.get(badgeKey(badge)) ?? [] }));
        const distinct = new Set(options.flatMap(o => o.counselors.map(c => c.memberId)));
        return { bucket: b.name, options, counselorCount: distinct.size, scoutsNeeding: demand.get(b.name) ?? 0 };
    });
}
