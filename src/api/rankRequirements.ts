import { differenceInMonths, parseISO } from 'date-fns';
import { scoutingClient } from './scoutingClient';
import { cacheManager } from './cache';
import type { ScoutAdvancement } from '../logic/advancement';
import { RANK_ORDER } from '../logic/advancement';
import type { RequirementDef, ScoutRequirements } from '../logic/rankRequirements';
import { openRequirements, toRequirementDef } from '../logic/rankRequirements';

// Scoutbook rank ids (stable across versions), for the ranks taught as
// skills. Star and up are mostly merit badges, leadership and service.
export const SKILL_RANK_IDS: Record<string, number> = {
    'Scout': 1,
    'Tenderfoot': 2,
    'Second Class': 3,
    'First Class': 4,
};

const DONE_STATUSES = new Set(['completed', 'leader approved', 'awarded']);

const cacheKey = (unitId: string) => `${unitId}:rank-requirements`;

interface PlannerScout {
    userId: number;
    memberId?: number;
    firstName: string;
    lastName: string;
    data: ScoutAdvancement;
}

/** The skills rank a scout is working on next, if any. */
function nextSkillRank(scout: ScoutAdvancement) {
    const earned = scout.ranks
        .filter(r => r.dateEarned)
        .sort((a, b) => RANK_ORDER.indexOf(a.rankName) - RANK_ORDER.indexOf(b.rankName));
    const current = earned.at(-1);
    const next = current ? RANK_ORDER[RANK_ORDER.indexOf(current.rankName) + 1] : 'Scout';
    return next && SKILL_RANK_IDS[next] ? { rank: next, since: current?.dateEarned } : null;
}

const isDone = (r: { status?: string; dateCompleted?: string | null; leaderApprovedDate?: string | null; markedCompletedDate?: string | null }) =>
    DONE_STATUSES.has((r.status ?? '').toLowerCase()) || !!(r.dateCompleted || r.leaderApprovedDate || r.markedCompletedDate);

/**
 * Open requirements for every scout working on Scout through First Class.
 * One bulk status call per rank, plus the requirement text for each
 * requirements version in use (scouts can be on different versions).
 */
export async function loadRankRequirements(
    unitId: string,
    scouts: PlannerScout[],
    { refresh = false }: { refresh?: boolean } = {},
): Promise<ScoutRequirements[]> {
    if (refresh) cacheManager.remove(cacheKey(unitId));
    const cached = cacheManager.get(cacheKey(unitId));
    if (cached) return cached as ScoutRequirements[];

    const byRank = new Map<string, { scout: PlannerScout; since?: string }[]>();
    for (const scout of scouts) {
        const next = nextSkillRank(scout.data);
        if (!next || !scout.memberId) continue;
        const list = byRank.get(next.rank) ?? [];
        list.push({ scout, since: next.since });
        byRank.set(next.rank, list);
    }

    const defsByVersion = new Map<string, Promise<{ versionId: string; defs: RequirementDef[] }>>();
    const definitions = (rankId: number, versionId?: string) => {
        const key = `${rankId}:${versionId ?? 'current'}`;
        if (!defsByVersion.has(key)) {
            defsByVersion.set(key, scoutingClient.getRankRequirementDefs(rankId, versionId).then(body => ({
                versionId: String(body.requirements?.[0]?.versionId ?? versionId ?? ''),
                defs: (body.requirements ?? []).map(toRequirementDef),
            })));
        }
        return defsByVersion.get(key)!;
    };

    const now = new Date();
    const results = await Promise.all([...byRank.entries()].map(async ([rank, members]) => {
        const rankId = SKILL_RANK_IDS[rank];
        const statuses = await scoutingClient.getUnitRankRequirementStatus(
            unitId, rankId, members.map(m => m.scout.memberId!),
        );
        const byMember = new Map(statuses.map(s => [Number(s.memberId), s]));
        return Promise.all(members.map(async ({ scout, since }) => {
            const status = byMember.get(scout.memberId!);
            // Scouts who haven't started the rank have no version yet: use the current one.
            const { defs } = await definitions(rankId, status?.versionId ? String(status.versionId) : undefined);
            const completed = new Set((status?.requirements ?? []).filter(isDone).map(r => String(r.id)));
            return {
                userId: scout.userId,
                name: `${scout.data.nickname || scout.firstName} ${scout.lastName}`,
                rank,
                monthsSinceLastRank: since ? differenceInMonths(now, parseISO(since)) : null,
                open: openRequirements(rank, defs, completed),
            };
        }));
    }));

    const all = results.flat().sort((a, b) => a.name.localeCompare(b.name));
    cacheManager.set(cacheKey(unitId), all);
    return all;
}
