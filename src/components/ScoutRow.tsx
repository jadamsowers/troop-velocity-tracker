import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addMonths, differenceInMonths, parseISO } from "date-fns";
import { Check, ChevronDown, Mail } from "lucide-react";
import { ScoutSelectCheckbox } from "./ScoutSelectCheckbox";
import { RankPatch } from "./RankPatch";
import type { ScoutAdvancement } from "../logic/advancement";
import {
  getStatus,
  getStatusReason,
  RANK_ORDER,
  WAIT_TIMES,
  calculateMissingEagleRequired,
  generateProgressReport,
} from "../logic/advancement";

interface Props {
  firstName: string;
  lastName: string;
  scoutData: ScoutAdvancement;
  userId?: number;
  isSelected?: boolean;
  onSelectChange?: (userId: number, selected: boolean) => void;
}

const PREREQUISITES: Record<string, string> = {
  Star: "First Class",
  Life: "Star",
  Eagle: "Life",
};

// "Sep ’20" — one date format for every label on the trail
const formatShort = (date: Date): string =>
  `${date.toLocaleDateString(undefined, { month: "short" })} ’${date.getFullYear().toString().slice(-2)}`;

const formatLong = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// Minimum horizontal room a date label needs, in px
const LABEL_SPACE = 48;

export const ScoutRow: React.FC<Props> = ({
  firstName,
  lastName,
  scoutData,
  userId,
  isSelected = false,
  onSelectChange,
}) => {
  const [showMbPopover, setShowMbPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const [trailWidth, setTrailWidth] = useState(0);

  useLayoutEffect(() => {
    const el = trailRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setTrailWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!showMbPopover) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setShowMbPopover(false);
      } else if (!popoverRef.current?.contains(e.target as Node)) {
        setShowMbPopover(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [showMbPopover]);

  const status = getStatus(scoutData);
  const reason = getStatusReason(scoutData);

  const now = new Date();
  const dob = scoutData.dob ? parseISO(scoutData.dob) : null;
  const birthday18 = dob ? addMonths(dob, 18 * 12) : null;
  const earnedRanks = scoutData.ranks
    .filter((r) => r.dateEarned)
    .sort(
      (a, b) => RANK_ORDER.indexOf(a.rankName) - RANK_ORDER.indexOf(b.rankName),
    );

  const currentRank = earnedRanks[earnedRanks.length - 1]?.rankName ?? "None";

  const missingEagleReqs = calculateMissingEagleRequired(
    scoutData.earnedMeritBadges || [],
  );

  // Calculate elective badges
  const totalRequiredEarned = 13 - missingEagleReqs.length;
  const totalEarned = scoutData.earnedMeritBadges?.length || 0;
  const electivesEarned = Math.max(0, totalEarned - totalRequiredEarned);
  const missingElectives = Math.max(0, 8 - electivesEarned);
  const totalMissing = missingEagleReqs.length + missingElectives;

  const draftEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    const report = generateProgressReport(scoutData, firstName);
    const to = scoutData.scoutEmail || "";
    const cc = scoutData.parentEmails?.join(";") || "";
    const subject = `Troop Advancement Update: ${firstName} ${lastName}`;
    const mailtoLink = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(report)}`;
    window.location.href = mailtoLink;
  };

  const getAgeString = (): string => {
    if (!dob) return "Age unknown";
    const years = Math.floor(differenceInMonths(now, dob) / 12);
    const months = differenceInMonths(now, dob) % 12;
    return `${years} yr ${months} mo`;
  };

  // ── Projected "earliest possible" dates for every rank ──
  // Earned ranks use their real date.
  // Unearned ranks with wait requirements are chained forward from their prereq.
  const projectedDates: Record<string, Date> = {};
  for (const rank of RANK_ORDER) {
    const earned = earnedRanks.find((r) => r.rankName === rank);
    if (earned?.dateEarned) {
      projectedDates[rank] = parseISO(earned.dateEarned);
    } else {
      const prereq = PREREQUISITES[rank];
      const waitMonths = WAIT_TIMES[rank];
      if (prereq && projectedDates[prereq] && waitMonths) {
        const rawProj = addMonths(projectedDates[prereq], waitMonths);
        projectedDates[rank] = rawProj < now ? now : rawProj;
      }
    }
  }

  // ── Timeline span ──
  const bday11 = dob ? addMonths(dob, 11 * 12) : null;
  const firstDate = earnedRanks[0]?.dateEarned
    ? parseISO(earnedRanks[0].dateEarned)
    : null;

  let spanStart = now;
  if (bday11 && firstDate) {
    spanStart = bday11 < firstDate ? bday11 : firstDate;
  } else if (bday11) {
    spanStart = bday11;
  } else if (firstDate) {
    spanStart = firstDate;
  }

  const rawSpanEnd = birthday18 ?? addMonths(now, 48);
  // If Eagle would be projected past 18th birthday, extend the span to show it
  const projectedEagle = projectedDates["Eagle"];
  const spanEnd =
    projectedEagle && projectedEagle > rawSpanEnd ? projectedEagle : rawSpanEnd;
  const totalMonths = Math.max(differenceInMonths(spanEnd, spanStart), 1);

  const toPercent = (date: Date) => {
    const months = differenceInMonths(date, spanStart);
    return Math.min(100, Math.max(0, (months / totalMonths) * 100));
  };

  const nowPercent = toPercent(now);
  const cutoffPercent = birthday18 ? toPercent(birthday18) : 100;

  // ── Milestones: earned → sewn patch, projected → outline ──
  const milestones = RANK_ORDER.map((rank) => {
    const earned = earnedRanks.find((r) => r.rankName === rank);
    const projDate = projectedDates[rank] ?? null;
    const isProjected = !earned && !!projDate;
    const date = earned ? parseISO(earned.dateEarned!) : isProjected ? projDate : null;
    return {
      rank,
      earned: !!earned,
      date,
      late: isProjected && !!birthday18 && projDate! > birthday18,
      percent: date ? toPercent(date) : null,
    };
  }).filter((m) => m.percent !== null);

  // Pick which date labels to show so none overlap: the last earned rank and
  // the next projected one first, then the rest from the right.
  const lastEarnedIdx = milestones.map((m) => m.earned).lastIndexOf(true);
  const order = milestones
    .map((_, i) => i)
    .sort((a, b) => {
      const pri = (i: number) =>
        i === lastEarnedIdx ? 0 : i === lastEarnedIdx + 1 ? 1 : milestones[i].rank === "Eagle" ? 2 : 3;
      return pri(a) - pri(b) || b - a;
    });
  const shownLabels = new Set<number>();
  if (trailWidth > 0) {
    const placed: number[] = [];
    for (const i of order) {
      const x = (milestones[i].percent! / 100) * trailWidth;
      if (placed.every((p) => Math.abs(p - x) >= LABEL_SPACE)) {
        placed.push(x);
        shownLabels.add(i);
      }
    }
  }

  const birthdayMarkers: { age: number; percent: number }[] = [];
  if (dob) {
    for (let age = 11; age <= 18; age++) {
      const bday = addMonths(dob, age * 12);
      if (bday > spanEnd) break;
      if (bday >= spanStart) birthdayMarkers.push({ age, percent: toPercent(bday) });
    }
  }

  const preJoinPercent =
    bday11 && firstDate && firstDate > bday11 ? toPercent(firstDate) : 0;

  // ── Wait zones for Star / Life / Eagle ──
  // start = prereq earned (or projected) date, end = start + mandatory wait,
  // elapsed = how far into the wait today (or the rank's earn date) is.
  const waitZones: {
    rank: string;
    start: number;
    end: number;
    elapsed: number;
    isSpeculative: boolean;
  }[] = [];

  for (const rank of ["Star", "Life", "Eagle"]) {
    const waitMonths = WAIT_TIMES[rank];
    const prereq = PREREQUISITES[rank];
    if (!prereq || !waitMonths) continue;

    const prereqEarned = earnedRanks.find((r) => r.rankName === prereq);
    const rankEarned = earnedRanks.find((r) => r.rankName === rank);

    let waitStart: Date | null = null;
    let isSpeculative = false;
    if (prereqEarned?.dateEarned) {
      waitStart = parseISO(prereqEarned.dateEarned);
    } else if (projectedDates[prereq]) {
      waitStart = projectedDates[prereq];
      isSpeculative = true;
    }
    if (!waitStart) continue;

    const startPct = toPercent(waitStart);
    const endPct = Math.min(100, toPercent(addMonths(waitStart, waitMonths)));
    if (endPct <= startPct) continue;

    const elapsed = rankEarned?.dateEarned
      ? Math.min(endPct, toPercent(parseISO(rankEarned.dateEarned)))
      : Math.min(endPct, nowPercent);

    waitZones.push({ rank, start: startPct, end: endPct, elapsed, isSpeculative });
  }

  const earnedFill = milestones.filter((m) => m.earned).at(-1)?.percent ?? 0;
  const displayName = `${scoutData.nickname || firstName} ${lastName}`;

  return (
    <article
      className={`scout-row scout-row--${status}${showMbPopover ? " scout-row--raised" : ""}`}
    >
      <div className="scout-row__select">
        {userId !== undefined && onSelectChange && (
          <ScoutSelectCheckbox
            userId={userId}
            checked={isSelected}
            onChange={onSelectChange}
          />
        )}
      </div>

      <div className="scout-row__identity">
        <RankPatch
          rank={currentRank === "None" ? "Scout" : currentRank}
          state={currentRank === "None" ? "none" : "earned"}
          size={24}
          title={currentRank === "None" ? "No rank yet" : currentRank}
        />
        <div className="scout-row__text">
          <div className="scout-row__name-line">
            <h3 className="scout-row__name">{displayName}</h3>
            <span className="scout-row__meta">
              {getAgeString()} · {currentRank === "None" ? "No rank" : currentRank}
            </span>
          </div>
          <p className="scout-row__status">
            <span className="status-dot" aria-hidden />
            {reason}
          </p>
          <div className="scout-row__badges" ref={popoverRef}>
            <button
              type="button"
              className="link-button"
              onClick={() => setShowMbPopover(!showMbPopover)}
              aria-expanded={showMbPopover}
              aria-label={`Merit badges for ${displayName}: ${21 - totalMissing} of 21 toward Eagle`}
            >
              <span className="figure">{21 - totalMissing}</span> of 21 merit
              badges toward Eagle
              {totalMissing === 0 ? (
                <Check size={14} className="scout-row__complete" />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>

            {showMbPopover && totalMissing > 0 && (
              <div className="popover" role="dialog" aria-label="Missing merit badges">
                <div className="popover__head">
                  <span>Missing Eagle-required</span>
                  <span className="figure">{missingEagleReqs.length}</span>
                </div>
                {missingEagleReqs.length > 0 ? (
                  <ul
                    className={`popover__list${missingEagleReqs.length > 8 ? " popover__list--two" : ""}`}
                  >
                    {missingEagleReqs.map((req) => (
                      <li key={req}>{req}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="popover__empty">All Eagle-required badges earned</p>
                )}
                {missingElectives > 0 && (
                  <div className="popover__foot">
                    <span>Electives still needed</span>
                    <span className="figure">{missingElectives}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="trail" ref={trailRef}>
        {/* Age axis */}
        {birthdayMarkers.map((m) => (
          <div
            key={m.age}
            className={`trail__age${m.age === 18 ? " trail__age--cutoff" : ""}`}
            style={{ left: `${m.percent}%` }}
            title={m.age === 18 ? "18th birthday — Eagle deadline" : `Age ${m.age}`}
          >
            <span>{m.age}</span>
          </div>
        ))}

        <div className="trail__track" />

        {cutoffPercent < 100 && (
          <div
            className="trail__overtime"
            style={{ left: `${cutoffPercent}%`, right: 0 }}
            title="Past 18th birthday"
          />
        )}

        {preJoinPercent > 0 && (
          <div
            className="trail__prejoin"
            style={{ width: `${preJoinPercent}%` }}
            title="Before joining the unit"
          />
        )}

        <div className="trail__earned" style={{ width: `${earnedFill}%` }} />

        {waitZones.map((z) => (
          <React.Fragment key={z.rank}>
            <div
              className={`trail__wait${z.isSpeculative ? " trail__wait--projected" : ""}`}
              style={{ left: `${z.start}%`, width: `${z.end - z.start}%` }}
              title={`${z.isSpeculative ? "Projected " : ""}${WAIT_TIMES[z.rank]}-month wait for ${z.rank}`}
            />
            {z.elapsed > z.start && !z.isSpeculative && (
              <div
                className="trail__wait-elapsed"
                style={{ left: `${z.start}%`, width: `${z.elapsed - z.start}%` }}
              />
            )}
          </React.Fragment>
        ))}

        {nowPercent > 0 && nowPercent < 100 && (
          <div className="trail__today" style={{ left: `${nowPercent}%` }} title="Today" />
        )}

        {milestones.map((m, i) => {
          const label = m.earned
            ? `${m.rank}, earned ${formatLong(m.date!)}`
            : `${m.rank}, earliest ${formatLong(m.date!)}${m.late ? " (after 18th birthday)" : ""}`;
          return (
            <div
              key={m.rank}
              className="trail__milestone"
              style={{ left: `${m.percent}%` }}
            >
              <RankPatch
                rank={m.rank}
                state={m.earned ? "earned" : m.late ? "late" : "projected"}
                size={18}
                title={label}
              />
              {shownLabels.has(i) && (
                <span
                  className={`trail__date${m.earned ? "" : " trail__date--projected"}${m.late ? " trail__date--late" : ""}`}
                >
                  {formatShort(m.date!)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={draftEmail}
        className="icon-button scout-row__mail"
        title="Draft progress email"
        aria-label={`Draft progress email for ${displayName}`}
      >
        <Mail size={16} strokeWidth={1.5} />
      </button>
    </article>
  );
};
