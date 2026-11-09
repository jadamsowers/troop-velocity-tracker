import { differenceInMonths, differenceInYears, addMonths, isAfter, parseISO } from 'date-fns';
import type { CounselorRef } from './counselors';

export type Status = 'green' | 'yellow' | 'red';

export interface RankDate {
    rankName: string;
    dateEarned?: string;
}

export interface LeadershipPosition {
    position: string;
    startDate: string;
    /** Missing while the position is still held. */
    endDate?: string;
}

export interface ScoutAdvancement {
    dob: string;
    ranks: RankDate[];
    /** Undefined when leadership data couldn't be loaded (or predates this field in cache). */
    leadership?: LeadershipPosition[];
    meritBadgeCount: number;
    earnedMeritBadges: string[];
    scoutEmail?: string;
    parentEmails?: string[];
    nickname?: string;
}

export const EAGLE_REQUIRED_BUCKETS = [
    { name: 'First Aid', options: ['First Aid'] },
    { name: 'Citizenship in the Community', options: ['Citizenship in the Community'] },
    { name: 'Citizenship in the Nation', options: ['Citizenship in the Nation'] },
    { name: 'Citizenship in the World', options: ['Citizenship in the World'] },
    { name: 'Communication', options: ['Communication'] },
    { name: 'Cooking', options: ['Cooking'] },
    { name: 'Personal Fitness', options: ['Personal Fitness'] },
    { name: 'Emergency Preparedness OR Lifesaving', options: ['Emergency Preparedness', 'Lifesaving'] },
    { name: 'Environmental Science OR Sustainability', options: ['Environmental Science', 'Sustainability'] },
    { name: 'Personal Management', options: ['Personal Management'] },
    { name: 'Cycling OR Hiking OR Swimming', options: ['Cycling', 'Hiking', 'Swimming'] },
    { name: 'Camping', options: ['Camping'] },
    { name: 'Family Life', options: ['Family Life'] }
];

export function calculateMissingEagleRequired(earnedBadges: string[]): string[] {
    const earnedArray = earnedBadges.map(b => b.trim().toLowerCase());
    const missing: string[] = [];

    for (const bucket of EAGLE_REQUIRED_BUCKETS) {
        const hasEarned = bucket.options.some(opt => {
            const optLower = opt.toLowerCase();
            return earnedArray.some(earned => earned.includes(optLower));
        });
        if (!hasEarned) {
            missing.push(bucket.name);
        }
    }
    return missing;
}

export const RANK_ORDER = [
    'Scout',
    'Tenderfoot',
    'Second Class',
    'First Class',
    'Star',
    'Life',
    'Eagle'
];

export const WAIT_TIMES: Record<string, number> = {
    'Star': 4, // 4 months after First Class
    'Life': 6, // 6 months after Star
    'Eagle': 6 // 6 months after Life
};

// Months in a position of responsibility, served while holding the previous rank.
export const LEADERSHIP_MONTHS: Record<string, number> = { Star: 4, Life: 6, Eagle: 6 };

const DAYS_PER_MONTH = 30.4375;

export interface LeadershipProgress {
    nextRank: string;
    requiredMonths: number;
    /** Months served since the current rank was earned (overlapping positions count once). */
    months: number;
    /** Positions held today. */
    current: string[];
}

/**
 * Leadership time toward Star, Life or Eagle: days in any position since the
 * current rank was earned, merging overlaps so two positions held at once
 * don't double-count. Null when the next rank has no leadership requirement
 * or the data isn't loaded.
 */
export function getLeadershipProgress(scout: ScoutAdvancement, now = new Date()): LeadershipProgress | null {
    if (!scout.leadership) return null;
    const earned = scout.ranks
        .filter(r => r.dateEarned)
        .sort((a, b) => RANK_ORDER.indexOf(a.rankName) - RANK_ORDER.indexOf(b.rankName));
    const current = earned.at(-1);
    if (!current) return null;
    const nextRank = RANK_ORDER[RANK_ORDER.indexOf(current.rankName) + 1];
    const requiredMonths = LEADERSHIP_MONTHS[nextRank];
    if (!requiredMonths) return null;

    const since = parseISO(current.dateEarned!).getTime();
    const today = now.getTime();
    const spans = scout.leadership
        .map(p => [
            Math.max(parseISO(p.startDate).getTime(), since),
            Math.min(p.endDate ? parseISO(p.endDate).getTime() : today, today),
        ])
        .filter(([start, end]) => end > start)
        .sort((a, b) => a[0] - b[0]);

    // Merge overlaps, then count each span in calendar months (Feb 9 to Jun 9
    // is 4 months) with leftover days as a fraction.
    const merged: [number, number][] = [];
    for (const [start, end] of spans) {
        const last = merged.at(-1);
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else merged.push([start, end]);
    }
    let months = 0;
    for (const [start, end] of merged) {
        const whole = differenceInMonths(end, start);
        months += whole + (end - addMonths(start, whole).getTime()) / 86_400_000 / DAYS_PER_MONTH;
    }

    return {
        nextRank,
        requiredMonths,
        months,
        current: scout.leadership
            .filter(p => !p.endDate || parseISO(p.endDate).getTime() >= today)
            .map(p => p.position),
    };
}

const MERIT_BADGE_REQUIREMENTS: Record<string, number> = {
    'Star': 6,
    'Life': 11,
    'Eagle': 21
};

export function getStatus(scout: ScoutAdvancement): Status {
    const now = new Date();
    const dob = parseISO(scout.dob);
    const monthsUntil18 = differenceInMonths(addMonths(dob, 18 * 12), now);
    const ageYears = differenceInYears(now, dob);

    // Sort ranks by order
    const earnedRanks = scout.ranks
        .filter(r => r.dateEarned)
        .sort((a, b) => RANK_ORDER.indexOf(a.rankName) - RANK_ORDER.indexOf(b.rankName));

    const currentRank = earnedRanks[earnedRanks.length - 1]?.rankName || 'None';
    const nextRank = RANK_ORDER[RANK_ORDER.indexOf(currentRank) + 1];

    // 1. Age-based check: Red if < 7 months until 18, Yellow if < 13 months (catches all 17+)
    if (monthsUntil18 < 7) return 'red';
    let ageBasedStatus: Status | null = null;
    if (monthsUntil18 < 13) ageBasedStatus = 'yellow';

    // 2. Special case: Scouts who are 12+ and have no rank yet should be in yellow condition
    if (ageYears >= 12 && earnedRanks.length === 0) {
        ageBasedStatus = 'yellow';
    }

    // 3. Special case: Scouts who are 17+ and not yet at eagle should be in red condition
    if (ageYears >= 17 && currentRank !== 'Eagle') {
        return 'red';
    }

    // 4. Life scouts working toward Eagle: check if they have good progress and time
    // If Life rank with good Eagle progress and time left (13+ months), they can be green
    if (currentRank === 'Life' && nextRank === 'Eagle' && monthsUntil18 >= 13) {
        const missingEagleReqs = calculateMissingEagleRequired(scout.earnedMeritBadges);
        // If they're missing 3 or fewer required merit badges, they're on track
        if (missingEagleReqs.length <= 3) {
            // Even with age consideration, Life scouts with good progress and plenty of time are green
            ageBasedStatus = null; // don't apply age penalty
        }
    }

    // 5. Velocity check (Assume at least one rank per year)
    if (earnedRanks.length > 0) {
        const lastRankDate = parseISO(earnedRanks[earnedRanks.length - 1].dateEarned!);
        if (differenceInYears(now, lastRankDate) >= 1) {
            return 'yellow';
        }
    }

    // 6. Wait time check
    let isWaitOverdue = false;
    if (nextRank && WAIT_TIMES[nextRank] && earnedRanks.length > 0) {
        const lastRankDate = parseISO(earnedRanks[earnedRanks.length - 1].dateEarned!);
        const waitPeriod = WAIT_TIMES[nextRank];
        const eligibilityDate = addMonths(lastRankDate, waitPeriod);

        // If they ARE past the wait period but haven't earned it yet, check if they are "stuck"
        if (isAfter(now, eligibilityDate)) {
            isWaitOverdue = true;
            if (isAfter(now, addMonths(eligibilityDate, 3))) {
                return 'yellow'; // 3 months overdue
            }
        }
    }

    // 7. Merit Badge check
    // Only penalize them for missing merit badges if their mandatory wait period is ALREADY up.
    // Young/fast scouts shouldn't be penalized for not having merit badges on day 1 of their new rank waiting period.
    if (nextRank && MERIT_BADGE_REQUIREMENTS[nextRank] && isWaitOverdue) {
        const required = MERIT_BADGE_REQUIREMENTS[nextRank];
        if (scout.meritBadgeCount < required - 2) return 'red'; // More than 2 badges short
        if (scout.meritBadgeCount < required) {
            return 'yellow'; // Short of required
        }
    }

    // Return age-based status if determined, otherwise green
    return ageBasedStatus || 'green';
}

export function getStatusReason(scout: ScoutAdvancement): string {
    const now = new Date();
    const dob = parseISO(scout.dob);
    const monthsUntil18 = differenceInMonths(addMonths(dob, 18 * 12), now);
    const ageYears = differenceInYears(now, dob);

    if (monthsUntil18 < 7) return `${monthsUntil18} month${monthsUntil18 !== 1 ? 's' : ''} to 18, Eagle window closing`;
    if (monthsUntil18 < 13) return `${monthsUntil18} months to 18, needs to speed up`;

    const earnedRanks = scout.ranks
        .filter(r => r.dateEarned)
        .sort((a, b) => RANK_ORDER.indexOf(a.rankName) - RANK_ORDER.indexOf(b.rankName));

    if (ageYears >= 12 && earnedRanks.length === 0) {
        return `No rank yet at age ${ageYears}`;
    }

    const currentRank = earnedRanks[earnedRanks.length - 1]?.rankName || 'None';
    const nextRank = RANK_ORDER[RANK_ORDER.indexOf(currentRank) + 1];

    if (earnedRanks.length > 0) {
        const lastRankDate = parseISO(earnedRanks[earnedRanks.length - 1].dateEarned!);
        const monthsSince = differenceInMonths(now, lastRankDate);
        if (differenceInYears(now, lastRankDate) >= 1) {
            return `No new rank in ${monthsSince} months`;
        }
    }

    // Past the rank's time requirement but short on leadership time: that's the blocker.
    const leadership = getLeadershipProgress(scout, now);
    if (leadership && nextRank && WAIT_TIMES[nextRank] && earnedRanks.length > 0) {
        const lastRankDate = parseISO(earnedRanks[earnedRanks.length - 1].dateEarned!);
        const short = leadership.requiredMonths - leadership.months;
        if (differenceInMonths(now, lastRankDate) >= WAIT_TIMES[nextRank] && short >= 0.5) {
            return leadership.current.length
                ? `${Math.ceil(short)} more month${Math.ceil(short) !== 1 ? 's' : ''} of leadership for ${nextRank}`
                : `Needs a leadership position for ${nextRank}`;
        }
    }

    if (nextRank && WAIT_TIMES[nextRank] && earnedRanks.length > 0) {
        const lastRankDate = parseISO(earnedRanks[earnedRanks.length - 1].dateEarned!);
        const waitPeriod = WAIT_TIMES[nextRank];
        const eligibilityDate = addMonths(lastRankDate, waitPeriod);
        if (isAfter(now, addMonths(eligibilityDate, 3))) {
            return `Eligible for ${nextRank} since ${eligibilityDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
        }
    }

    if (nextRank && MERIT_BADGE_REQUIREMENTS[nextRank]) {
        const required = MERIT_BADGE_REQUIREMENTS[nextRank];
        if (scout.meritBadgeCount < required) {
            return `Needs ${required - scout.meritBadgeCount} more merit badge${required - scout.meritBadgeCount !== 1 ? 's' : ''} for ${nextRank}`;
        }
    }

    // Special recognition for Life scouts on track to Eagle
    if (currentRank === 'Life' && nextRank === 'Eagle') {
        const missingEagleReqs = calculateMissingEagleRequired(scout.earnedMeritBadges);
        if (missingEagleReqs.length <= 3) {
            return `On track for Eagle with time to spare`;
        }
    }

    return 'On track';
}

export function generateProgressReport(scout: ScoutAdvancement, firstName: string): string {
    const now = new Date();
    const dob = parseISO(scout.dob);
    const monthsUntil18 = differenceInMonths(addMonths(dob, 18 * 12), now);

    const earnedRanks = scout.ranks
        .filter(r => r.dateEarned)
        .sort((a, b) => RANK_ORDER.indexOf(a.rankName) - RANK_ORDER.indexOf(b.rankName));

    const currentRank = earnedRanks[earnedRanks.length - 1]?.rankName || 'None';
    const nextRankIndex = RANK_ORDER.indexOf(currentRank) + 1;
    const nextRank = nextRankIndex < RANK_ORDER.length ? RANK_ORDER[nextRankIndex] : null;

    let report = `Hi ${firstName},\n\nHere is your current advancement progress update:\n\n`;

    // 1. Current Rank & Time since last rank
    if (earnedRanks.length > 0) {
        const lastRankDate = parseISO(earnedRanks[earnedRanks.length - 1].dateEarned!);
        const monthsSince = differenceInMonths(now, lastRankDate);
        report += `⭐ Current Rank: ${currentRank} (Earned ${monthsSince} month${monthsSince === 1 ? '' : 's'} ago)\n`;
        
        if (nextRank && WAIT_TIMES[nextRank]) {
            const waitPeriod = WAIT_TIMES[nextRank];
            const eligibilityDate = addMonths(lastRankDate, waitPeriod);
            if (isAfter(now, eligibilityDate)) {
                report += `   - You have already met the ${waitPeriod}-month waiting period for ${nextRank}!\n`;
            } else {
                const monthsLeft = differenceInMonths(eligibilityDate, now);
                report += `   - You still have ${Math.max(1, monthsLeft)} month${monthsLeft === 1 ? '' : 's'} left in your ${waitPeriod}-month waiting period for ${nextRank}.\n`;
            }
        }
    } else {
        report += `⭐ Current Rank: Scout (No ranks earned yet)\n`;
    }

    report += `\n`;

    // 2. Merit Badges
    const missingEagleReqs = calculateMissingEagleRequired(scout.earnedMeritBadges);
    const earnedCount = scout.meritBadgeCount;
    report += `🎖️ Merit Badges Earned: ${earnedCount} / 21 total required for Eagle\n`;
    
    if (missingEagleReqs.length > 0) {
        report += `   - Missing Eagle-Required (${missingEagleReqs.length}): ${missingEagleReqs.join(', ')}\n`;
    } else {
        report += `   - Missing Eagle-Required: None! Great job.\n`;
    }

    const missingTotal = Math.max(0, 21 - earnedCount);
    // If they have all required but are short on total, they need electives.
    if (missingTotal > missingEagleReqs.length) {
        report += `   - You still need ${missingTotal - missingEagleReqs.length} more elective badge(s).\n`;
    }

    report += `\n`;

    // 3. Age Warning
    if (monthsUntil18 > 0 && monthsUntil18 < 24) {
        report += `⏳ Age Reminder: You turn 18 in ${monthsUntil18} month${monthsUntil18 === 1 ? '' : 's'}. Make sure to complete all requirements and your Eagle Project before your 18th birthday!\n\n`;
    }

    report += `Let me know how I can help you get to your next rank.\n\nYours in Scouting,\n[Your Name/Title]`;

    return report;
}

export function getRankProgress(scout: ScoutAdvancement) {
    return RANK_ORDER.map(rank => {
        const earned = scout.ranks.find(r => r.rankName === rank);
        return {
            rank,
            earnedDate: earned?.dateEarned,
            isCurrent: scout.ranks[scout.ranks.length - 1]?.rankName === rank
        };
    });
}

// How well each Eagle-required bucket fits a troop meeting or evening event.
// 'meeting'  — most requirements can be completed in group sessions.
// 'kickoff'  — group sessions cover the discussion pieces, but the badge has a
//              multi-week tracking or at-home component scouts finish on their own.
// 'outing'   — the core requirements need a campout, pool, trail, or ride.
export type GroupFormat = 'meeting' | 'kickoff' | 'outing';

export const GROUP_BADGE_FORMATS: Record<string, { host: string; format: GroupFormat; note: string }> = {
    'First Aid': { host: 'First Aid', format: 'meeting', note: 'Hands-on skills stations work well in a series of meetings.' },
    'Citizenship in the Community': { host: 'Citizenship in the Community', format: 'kickoff', note: 'Discussions fit meetings; scouts still attend a local government meeting and do 8 hours of service.' },
    'Citizenship in the Nation': { host: 'Citizenship in the Nation', format: 'meeting', note: 'Mostly discussion; plan one historic site visit or field trip.' },
    'Citizenship in the World': { host: 'Citizenship in the World', format: 'meeting', note: 'Discussion-heavy and easy to run as a group.' },
    'Communication': { host: 'Communication', format: 'meeting', note: 'Speeches and campfire programs can be presented to the troop.' },
    'Cooking': { host: 'Cooking', format: 'kickoff', note: 'Nutrition and meal planning fit meetings; the camp and trail meals need outings.' },
    'Personal Fitness': { host: 'Personal Fitness', format: 'kickoff', note: 'Kick off the 12-week program at a meeting and check in at later meetings.' },
    'Emergency Preparedness OR Lifesaving': { host: 'Emergency Preparedness', format: 'meeting', note: 'Emergency Preparedness fits meetings plus one drill; Lifesaving needs a pool.' },
    'Environmental Science OR Sustainability': { host: 'Environmental Science', format: 'kickoff', note: 'Group activities fit meetings; observation or home-tracking pieces happen between sessions. Sustainability is the alternative.' },
    'Personal Management': { host: 'Personal Management', format: 'kickoff', note: 'Kick off the 13-week budget at a meeting; discussions fit later meetings.' },
    'Cycling OR Hiking OR Swimming': { host: 'Hiking', format: 'outing', note: 'Requires long hikes, rides, or swim sessions — schedule as outings.' },
    'Camping': { host: 'Camping', format: 'outing', note: 'Requires 20 nights of camping — comes from troop campouts.' },
    'Family Life': { host: 'Family Life', format: 'kickoff', note: 'Discussions fit a meeting; the 90-day chore log and family project happen at home.' },
};

// Formats for the non-default options in OR buckets, used when the unit can
// only counsel the alternative.
const ALTERNATE_FORMATS: Record<string, GroupFormat> = {
    'Lifesaving': 'outing',
    'Sustainability': 'kickoff',
    'Cycling': 'outing',
    'Swimming': 'outing',
};

const FORMAT_ORDER: Record<GroupFormat, number> = { meeting: 0, kickoff: 1, outing: 2 };

export interface GroupBadgeScout {
    name: string;
    monthsUntil18: number;
}

export interface GroupBadgeSuggestion {
    bucket: string;
    host: string;
    format: GroupFormat;
    note: string;
    score: number;
    scouts: GroupBadgeScout[];
    /** Unit counselors for `host`; undefined when counselor data isn't loaded. */
    counselors?: CounselorRef[];
    /** Other options in an OR bucket that the unit can also counsel. */
    alternates?: { badge: string; counselors: CounselorRef[] }[];
}

// Scouts with less runway count for more, so a badge three 17-year-olds need
// outranks one that three 15-year-olds need.
function urgencyWeight(monthsUntil18: number): number {
    if (monthsUntil18 <= 12) return 3;
    if (monthsUntil18 <= 24) return 2;
    return 1;
}

/**
 * Rank Eagle-required buckets to host at meetings. With `counselorsFor`,
 * badges the unit can counsel rank first, then by urgency-weighted demand,
 * then 2+ counselors ahead of one, then meeting-friendly formats.
 */
export function suggestGroupMeritBadges(
    scouts: { firstName: string; lastName: string; data: ScoutAdvancement }[],
    windowMonths: number,
    counselorsFor?: (badge: string) => CounselorRef[],
): { suggestions: GroupBadgeSuggestion[]; scoutsInWindow: number; needElectives: GroupBadgeScout[] } {
    const now = new Date();
    const byBucket = new Map<string, GroupBadgeSuggestion>();
    const needElectives: GroupBadgeScout[] = [];
    let scoutsInWindow = 0;

    for (const scout of scouts) {
        if (!scout.data?.dob) continue;
        const monthsUntil18 = differenceInMonths(addMonths(parseISO(scout.data.dob), 18 * 12), now);
        if (monthsUntil18 < 0 || monthsUntil18 > windowMonths) continue;
        scoutsInWindow++;

        const entry = { name: `${scout.firstName} ${scout.lastName}`, monthsUntil18 };
        const missing = calculateMissingEagleRequired(scout.data.earnedMeritBadges || []);
        for (const bucket of missing) {
            const meta = GROUP_BADGE_FORMATS[bucket];
            let suggestion = byBucket.get(bucket);
            if (!suggestion) {
                suggestion = { bucket, ...meta, score: 0, scouts: [] };
                byBucket.set(bucket, suggestion);
            }
            suggestion.score += urgencyWeight(monthsUntil18);
            suggestion.scouts.push(entry);
        }

        if (Math.max(0, 21 - scout.data.meritBadgeCount) > missing.length) {
            needElectives.push(entry);
        }
    }

    const covered = (s: GroupBadgeSuggestion) => (s.counselors?.length ? 1 : 0);
    const deep = (s: GroupBadgeSuggestion) => ((s.counselors?.length ?? 0) >= 2 ? 1 : 0);
    const suggestions = [...byBucket.values()]
        .map(s => ({ ...s, scouts: s.scouts.sort((a, b) => a.monthsUntil18 - b.monthsUntil18) }))
        .map(s => (counselorsFor ? withCounselors(s, counselorsFor) : s))
        .sort((a, b) =>
            covered(b) - covered(a) ||
            b.score - a.score ||
            deep(b) - deep(a) ||
            FORMAT_ORDER[a.format] - FORMAT_ORDER[b.format] ||
            b.scouts.length - a.scouts.length ||
            a.host.localeCompare(b.host));
    needElectives.sort((a, b) => a.monthsUntil18 - b.monthsUntil18);

    return { suggestions, scoutsInWindow, needElectives };
}

function withCounselors(
    s: GroupBadgeSuggestion,
    counselorsFor: (badge: string) => CounselorRef[],
): GroupBadgeSuggestion {
    const options = EAGLE_REQUIRED_BUCKETS.find(b => b.name === s.bucket)?.options ?? [s.host];
    const byOption = options.map(badge => ({ badge, counselors: counselorsFor(badge) }));
    const host = byOption.find(o => o.badge === s.host) ?? byOption[0];
    // If nobody counsels the default pick but someone counsels an
    // alternative, suggest the alternative the troop can actually run.
    const pick = host.counselors.length ? host : byOption.find(o => o.counselors.length) ?? host;
    const switched = pick.badge !== s.host;
    return {
        ...s,
        host: pick.badge,
        format: switched ? ALTERNATE_FORMATS[pick.badge] ?? s.format : s.format,
        note: switched ? `Hosting ${pick.badge}: the unit has a counselor for it but not ${s.host}.` : s.note,
        counselors: pick.counselors,
        alternates: byOption.filter(o => o.badge !== pick.badge && o.counselors.length),
    };
}
