import { differenceInMonths, differenceInYears, addMonths, isAfter, parseISO } from 'date-fns';

export type Status = 'green' | 'yellow' | 'red';

export interface RankDate {
    rankName: string;
    dateEarned?: string;
}

export interface ScoutAdvancement {
    dob: string;
    ranks: RankDate[];
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

    if (monthsUntil18 < 7) return `🚨 Only ${monthsUntil18} month${monthsUntil18 !== 1 ? 's' : ''} until age 18 — Eagle eligibility closing fast.`;
    if (monthsUntil18 < 13) return `⚠️ Age ${ageYears}: ${monthsUntil18} months until 18 — needs to accelerate advancement.`;

    const earnedRanks = scout.ranks
        .filter(r => r.dateEarned)
        .sort((a, b) => RANK_ORDER.indexOf(a.rankName) - RANK_ORDER.indexOf(b.rankName));

    if (ageYears >= 12 && earnedRanks.length === 0) {
        return `⚠️ Age ${ageYears} and no ranks earned yet — needs to start advancement trail toward Eagle.`;
    }

    const currentRank = earnedRanks[earnedRanks.length - 1]?.rankName || 'None';
    const nextRank = RANK_ORDER[RANK_ORDER.indexOf(currentRank) + 1];

    if (earnedRanks.length > 0) {
        const lastRankDate = parseISO(earnedRanks[earnedRanks.length - 1].dateEarned!);
        const monthsSince = differenceInMonths(now, lastRankDate);
        if (differenceInYears(now, lastRankDate) >= 1) {
            return `⚠️ No rank advancement in ${monthsSince} months. Last rank: ${currentRank}.`;
        }
    }

    if (nextRank && WAIT_TIMES[nextRank] && earnedRanks.length > 0) {
        const lastRankDate = parseISO(earnedRanks[earnedRanks.length - 1].dateEarned!);
        const waitPeriod = WAIT_TIMES[nextRank];
        const eligibilityDate = addMonths(lastRankDate, waitPeriod);
        if (isAfter(now, addMonths(eligibilityDate, 3))) {
            return `⚠️ Eligible for ${nextRank} since ${eligibilityDate.toLocaleDateString()} but hasn't advanced.`;
        }
    }

    if (nextRank && MERIT_BADGE_REQUIREMENTS[nextRank]) {
        const required = MERIT_BADGE_REQUIREMENTS[nextRank];
        if (scout.meritBadgeCount < required) {
            return `${scout.meritBadgeCount < required - 2 ? '🚨' : '⚠️'} Needs ${required - scout.meritBadgeCount} more merit badge${required - scout.meritBadgeCount !== 1 ? 's' : ''} for ${nextRank} (has ${scout.meritBadgeCount}/${required}).`;
        }
    }

    // Special recognition for Life scouts on track to Eagle
    if (currentRank === 'Life' && nextRank === 'Eagle') {
        const missingEagleReqs = calculateMissingEagleRequired(scout.earnedMeritBadges);
        if (missingEagleReqs.length <= 3) {
            return `✅ Life rank working toward Eagle with strong progress — on track with time to spare!`;
        }
    }

    return '✅ On track — advancing well toward Eagle.';
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
