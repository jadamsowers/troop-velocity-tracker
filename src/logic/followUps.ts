import { differenceInMonths, parseISO } from 'date-fns';
import type { ScoutAdvancement } from './advancement';
import type { ScoutRequirements } from './rankRequirements';
import { readyForReview } from './rankRequirements';

// A merit badge started this long ago and still unfinished needs a nudge.
export const STALLED_MONTHS = 6;

export interface FollowUpItem {
    userId: number;
    scout: string;
    /** Rank or merit badge name. */
    subject: string;
    detail?: string;
    /** Months since a stalled badge was started. */
    months?: number;
}

export interface FollowUps {
    conference: FollowUpItem[];
    boardOfReview: FollowUpItem[];
    leaderApproval: FollowUpItem[];
    present: FollowUpItem[];
    stalled: FollowUpItem[];
}

interface FollowUpScout {
    userId: number;
    firstName: string;
    lastName: string;
    data: ScoutAdvancement;
}

const is = (status: string, ...values: string[]) => values.includes(status.trim().toLowerCase());

/**
 * Advancement that needs an adult to act. `requirements` (rank planner data)
 * adds Scoutmaster conference readiness; `counselorName` resolves a
 * counselor userId to a unit counselor's name.
 */
export function buildFollowUps(
    scouts: FollowUpScout[],
    requirements: ScoutRequirements[] | null,
    counselorName: (userId: number) => string | undefined,
    now = new Date(),
): FollowUps {
    const out: FollowUps = { conference: [], boardOfReview: [], leaderApproval: [], present: [], stalled: [] };
    const nameOf = (s: FollowUpScout) => `${s.data.nickname || s.firstName} ${s.lastName}`;
    const boardKeys = new Set<string>();

    for (const r of requirements ?? []) {
        if (!readyForReview(r)) continue;
        const needsConference = r.open.some(o => /scoutmaster conference/i.test(`${o.short} ${o.text}`));
        const item = { userId: r.userId, scout: r.name, subject: r.rank };
        if (needsConference) out.conference.push(item);
        else { out.boardOfReview.push(item); boardKeys.add(`${r.userId}|${r.rank}`); }
    }

    for (const s of scouts) {
        const scout = nameOf(s);
        for (const r of s.data.pendingRanks ?? []) {
            // "Completed" = every requirement marked done; the board of review is next.
            if (is(r.status, 'completed') && !boardKeys.has(`${s.userId}|${r.name}`)) {
                out.boardOfReview.push({ userId: s.userId, scout, subject: r.name });
                boardKeys.add(`${s.userId}|${r.name}`);
            }
            if (is(r.status, 'leader approved')) out.present.push({ userId: s.userId, scout, subject: r.name, detail: 'Rank' });
        }
        for (const b of s.data.pendingBadges ?? []) {
            if (is(b.status, 'counselor approved')) {
                out.leaderApproval.push({ userId: s.userId, scout, subject: b.name });
            } else if (is(b.status, 'leader approved')) {
                out.present.push({ userId: s.userId, scout, subject: b.name, detail: 'Merit badge' });
            } else if (is(b.status, 'started', 'leader signed') && b.dateStarted) {
                const months = differenceInMonths(now, parseISO(b.dateStarted));
                if (months < STALLED_MONTHS || (b.percentCompleted ?? 0) >= 1) continue;
                const counselor = b.counselorUserId
                    ? counselorName(b.counselorUserId) ?? 'counselor outside the unit'
                    : 'no counselor assigned';
                const pct = b.percentCompleted ? `${Math.round(b.percentCompleted * 100)}% done · ` : '';
                out.stalled.push({ userId: s.userId, scout, subject: b.name, months, detail: `${pct}started ${months} months ago · ${counselor}` });
            }
        }
    }

    const byScout = (a: FollowUpItem, b: FollowUpItem) => a.scout.localeCompare(b.scout) || a.subject.localeCompare(b.subject);
    out.conference.sort(byScout);
    out.boardOfReview.sort(byScout);
    out.leaderApproval.sort(byScout);
    out.present.sort(byScout);
    // Longest-stalled first.
    out.stalled.sort((a, b) => (b.months ?? 0) - (a.months ?? 0) || byScout(a, b));
    return out;
}
