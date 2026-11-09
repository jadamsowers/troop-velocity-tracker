// Rank requirement trees: which requirements a scout still needs for the
// rank they're working on, and which open requirements the troop shares.

export interface RequirementDef {
    id: string;
    parentId?: string;
    /** "4a", "10" … as printed in the handbook. */
    number: string;
    short: string;
    text: string;
    required: boolean;
    /** For choice groups ("do two of the following"); undefined means all children. */
    childrenRequired?: number;
}

export interface OpenRequirement {
    /** Groups the same requirement across scouts: rank + number + summary. */
    key: string;
    rank: string;
    number: string;
    short: string;
    text: string;
    /** Set when the open item is a choice group: complete this many of its options. */
    choose?: number;
    /** Scoutmaster conference or board of review, handled as a review step rather than a skill. */
    review: boolean;
}

const REVIEW_PATTERN = /scoutmaster conference|board of review/i;

const plainText = (html: string) =>
    html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function toRequirementDef(raw: Record<string, unknown>): RequirementDef {
    const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
    const childrenRequired = Number(str(raw.childrenRequired));
    const short = plainText(str(raw.short));
    return {
        id: str(raw.id),
        parentId: str(raw.parentRequirementId) || undefined,
        number: str(raw.requirementNumber) || str(raw.listNumber).replace(/\.$/, ''),
        short,
        text: plainText(str(raw.name)) || short,
        required: str(raw.required).toLowerCase() !== 'false',
        childrenRequired: childrenRequired > 0 ? childrenRequired : undefined,
    };
}

/**
 * Open requirements for one scout on one rank. `completed` holds the ids of
 * requirements Scoutbook shows as done. A parent that needs all of its
 * children expands to the specific open children; a choice group is listed
 * once with how many options to finish.
 */
export function openRequirements(rank: string, defs: RequirementDef[], completed: Set<string>): OpenRequirement[] {
    const children = new Map<string, RequirementDef[]>();
    for (const d of defs) {
        if (!d.parentId) continue;
        const list = children.get(d.parentId) ?? [];
        list.push(d);
        children.set(d.parentId, list);
    }

    const isComplete = (d: RequirementDef): boolean => {
        if (completed.has(d.id)) return true;
        const kids = (children.get(d.id) ?? []).filter(k => k.required || d.childrenRequired);
        if (!kids.length) return false;
        const need = d.childrenRequired ?? kids.length;
        return kids.filter(isComplete).length >= need;
    };

    const item = (d: RequirementDef, choose?: number): OpenRequirement => ({
        key: `${rank}|${d.number}|${d.short}`,
        rank,
        number: d.number,
        short: d.short,
        text: d.text,
        choose,
        review: REVIEW_PATTERN.test(`${d.short} ${d.text}`),
    });

    const open: OpenRequirement[] = [];
    const visit = (d: RequirementDef) => {
        if (isComplete(d)) return;
        const kids = children.get(d.id) ?? [];
        if (kids.length && !d.childrenRequired) {
            kids.filter(k => k.required).forEach(visit);
        } else {
            open.push(item(d, d.childrenRequired));
        }
    };
    defs.filter(d => !d.parentId && d.required).forEach(visit);
    return open;
}

export interface ScoutRequirements {
    userId: number;
    name: string;
    rank: string;
    monthsSinceLastRank: number | null;
    open: OpenRequirement[];
}

export interface SharedRequirement extends OpenRequirement {
    scouts: { userId: number; name: string }[];
}

/**
 * Skill requirements open for more than one scout, most-shared first.
 * Ties go to the requirement whose scouts have waited longest since their
 * last rank, then to handbook order.
 */
export function sharedRequirements(scouts: ScoutRequirements[]): SharedRequirement[] {
    // Insertion order of the Map is handbook order, used as the last tie-break.
    const byKey = new Map<string, SharedRequirement>();
    const wait = new Map<string, number>();
    for (const s of scouts) {
        for (const r of s.open) {
            if (r.review) continue;
            let entry = byKey.get(r.key);
            if (!entry) {
                entry = { ...r, scouts: [] };
                byKey.set(r.key, entry);
            }
            entry.scouts.push({ userId: s.userId, name: s.name });
            wait.set(r.key, (wait.get(r.key) ?? 0) + (s.monthsSinceLastRank ?? 0));
        }
    }
    const order = [...byKey.keys()];
    return [...byKey.values()].sort((a, b) =>
        b.scouts.length - a.scouts.length ||
        (wait.get(b.key) ?? 0) - (wait.get(a.key) ?? 0) ||
        order.indexOf(a.key) - order.indexOf(b.key));
}

/** All requirements done except the Scoutmaster conference / board of review. */
export const readyForReview = (s: ScoutRequirements) =>
    s.open.length > 0 && s.open.every(r => r.review);
