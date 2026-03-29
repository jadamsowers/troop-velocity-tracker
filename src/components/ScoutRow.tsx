import React, { useState } from "react";
import { addMonths, differenceInMonths, parseISO } from "date-fns";
import { Mail } from "lucide-react";
import { ScoutSelectCheckbox } from "./ScoutSelectCheckbox";
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

const RANK_SHORT: Record<string, string> = {
  Scout: "⚜️",
  Tenderfoot: "🥾",
  "Second Class": "🥈",
  "First Class": "🥇",
  Star: "⭐",
  Life: "❤️",
  Eagle: "🦅",
};

const PREREQUISITES: Record<string, string> = {
  Star: "First Class",
  Life: "Star",
  Eagle: "Life",
};

// Helper function to format dates with '26 year format
const formatDateWithApostrophe = (date: Date): string => {
  const month = date.toLocaleDateString(undefined, { month: "short" });
  const year = "'" + date.getFullYear().toString().slice(-2);
  return `${month} ${year}`;
};

// Helper function to format date label for tooltip
const formatDateLabel = (date: Date, isProjected: boolean): string => {
  const month = date.toLocaleDateString(undefined, { month: "short" });
  const day = date.getDate();
  const year = "'" + date.getFullYear().toString().slice(-2);
  const formatted = `${month} ${day}/${year}`;
  return isProjected ? `(${formatted})` : formatted;
};

export const ScoutRow: React.FC<Props> = ({
  firstName,
  lastName,
  scoutData,
  userId,
  isSelected = false,
  onSelectChange,
}) => {
  const [showMbPopover, setShowMbPopover] = useState(false);
  const status = getStatus(scoutData);
  const reason = getStatusReason(scoutData);

  const now = new Date();
  const dob = scoutData.dob ? parseISO(scoutData.dob) : null;
  const birthday18 = dob ? addMonths(dob, 18 * 12) : null;
  const monthsUntil18 = birthday18 ? differenceInMonths(birthday18, now) : null;

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

  // ── Build projected "earliest possible" dates for every rank ──
  // Earned ranks use their real date.
  // Unearned ranks with wait requirements are chained forward from their prereq.

  const draftEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    const report = generateProgressReport(scoutData, firstName);
    const to = scoutData.scoutEmail || "";
    const cc = scoutData.parentEmails?.join(";") || "";
    const subject = `Troop Advancement Update: ${firstName} ${lastName}`;
    const mailtoLink = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(report)}`;
    window.location.href = mailtoLink;
  };

  // Calculate age in years and months
  const getAgeString = (): string => {
    if (!dob) return "Age unknown";
    const years = Math.floor(differenceInMonths(now, dob) / 12);
    const months = differenceInMonths(now, dob) % 12;
    return `${years}y ${months}mo`;
  };
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

  // ── Milestones: earned → real dot, projected → dimmer dashed dot ──
  const milestones = RANK_ORDER.map((rank) => {
    const earned = earnedRanks.find((r) => r.rankName === rank);
    const projDate = projectedDates[rank] ?? null;
    const isProjected = !earned && !!projDate;
    return {
      rank,
      short: RANK_SHORT[rank] ?? rank,
      earned: earned ? parseISO(earned.dateEarned!) : null,
      projected: isProjected ? projDate : null,
      percent: earned
        ? toPercent(parseISO(earned.dateEarned!))
        : projDate
          ? toPercent(projDate)
          : null,
    };
  });

  const birthdayMarkers: { age: number; percent: number }[] = [];
  if (dob) {
    let age = 11;
    while (age <= 18) {
      const bday = addMonths(dob, age * 12);
      if (bday > spanEnd) break;
      if (bday >= spanStart) {
        birthdayMarkers.push({ age, percent: toPercent(bday) });
      }
      age++;
    }
  }

  const preJoinPercent =
    bday11 && firstDate && firstDate > bday11 ? toPercent(firstDate) : 0;

  // ── Wait zones for Star / Life / Eagle ──
  // Each zone has:
  //   start  = prereq earned (or projected) date
  //   end    = start + mandatory wait months
  //   nowClamp = clamped "today" within [start, end] — shows elapsed progress
  //   isSpeculative = prereq not yet actually earned
  interface WaitZone {
    rank: string;
    start: number;
    end: number;
    nowClamp: number;
    isSpeculative: boolean;
  }
  const waitZones: WaitZone[] = [];

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
      isSpeculative = false;
    } else if (projectedDates[prereq]) {
      waitStart = projectedDates[prereq];
      isSpeculative = true;
    }

    if (!waitStart) continue;

    const waitEnd = addMonths(waitStart, waitMonths);
    const startPct = toPercent(waitStart);
    const endPct = Math.min(100, toPercent(waitEnd));
    if (endPct <= startPct) continue;

    // nowClamp: how far we are through the wait window
    const rankEarnedDate = rankEarned?.dateEarned
      ? parseISO(rankEarned.dateEarned)
      : null;
    const nowClamp = rankEarnedDate
      ? Math.min(endPct, toPercent(rankEarnedDate)) // rank earned: filled to earn date
      : Math.min(endPct, nowPercent); // not yet earned: filled to today

    waitZones.push({
      rank,
      start: startPct,
      end: endPct,
      nowClamp,
      isSpeculative,
    });
  }

  const statusColor = {
    green: "var(--green)",
    yellow: "var(--yellow)",
    red: "var(--red)",
  }[status];

  return (
    <article
      className="scout-card"
      style={{
        position: "relative",
        zIndex: showMbPopover ? 50 : 1,
      }}
    >
      {/* ── Single-line header: left | centered status | right badges ── */}
      {/* ── Structured header: Name/Age/MBs on left | Status on right ── */}
      <header className="scout-card-header">
        <div className="scout-header-main">
          <div className="scout-header-row">
            <div className="scout-header-cluster">
              {userId !== undefined && onSelectChange && (
                <ScoutSelectCheckbox
                  userId={userId}
                  checked={isSelected}
                  onChange={onSelectChange}
                />
              )}

              <button
                type="button"
                onClick={draftEmail}
                title="Draft Progress Report Email"
                className="scout-email-btn"
              >
                <Mail size={16} />
              </button>

              <span className="scout-rank-emoji-wrap" aria-hidden>
                <span className="scout-rank-emoji">
                  {RANK_SHORT[currentRank] || "⚜️"}
                </span>
              </span>

              <span className="scout-name">
                {scoutData.nickname || firstName} {lastName}
              </span>

              <span className="scout-age">{getAgeString()}</span>
            </div>
          </div>

          <div
            className="scout-merit-badge-subline"
            onClick={() => setShowMbPopover(!showMbPopover)}
          >
            <span className="scout-merit-badge-subline__icon">🎖</span>
            <span className="scout-merit-badge-subline__text">
              {21 - totalMissing}/21 required merit badges
            </span>
            {totalMissing === 0 && (
              <span className="scout-merit-badge-subline__complete-check">
                ✓
              </span>
            )}

            {showMbPopover && totalMissing > 0 && (
              <div
                className="scout-merit-popover"
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  left: 0, // Since it's now subline under name, left-align it
                  zIndex: 100,
                  padding: "1rem",
                  background: "var(--popover-bg)",
                  border: "1px solid var(--popover-border)",
                  borderRadius: "0.75rem",
                  boxShadow: "var(--shadow-popover)",
                  minWidth: "240px",
                  cursor: "default",
                  textAlign: "left",
                  animation: "popoverIn 0.2s ease-out",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Arrow */}
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    left: 20, // Arrow follows the new left alignment
                    width: 12,
                    height: 12,
                    background: "var(--popover-bg)",
                    borderLeft: "1px solid var(--popover-border)",
                    borderTop: "1px solid var(--popover-border)",
                    transform: "rotate(45deg)",
                  }}
                />

                <div
                  className="scout-merit-popover__title"
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--popover-title)",
                    marginBottom: "0.75rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>Missing Eagle Required:</span>
                  <span
                    style={{ color: "var(--accent-muted)", fontWeight: 400 }}
                  >
                    {missingEagleReqs.length} left
                  </span>
                </div>

                <ul
                  className="scout-merit-popover__list"
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    color: "var(--popover-text)",
                    fontSize: "0.75rem",
                    display: "grid",
                    gridTemplateColumns:
                      missingEagleReqs.length > 8 ? "1fr 1fr" : "1fr",
                    gap: "0.35rem 1rem",
                    whiteSpace: "normal",
                  }}
                >
                  {missingEagleReqs.map((req) => (
                    <li
                      key={req}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "var(--accent-muted)",
                          opacity: 0.6,
                        }}
                      />
                      {req}
                    </li>
                  ))}
                </ul>

                {(missingElectives > 0 || totalMissing === 0) && (
                  <div
                    style={{
                      marginTop: "1rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid var(--popover-border)",
                      fontSize: "0.7rem",
                      color: "var(--text-dim)",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Electives missing:</span>
                    <span style={{ fontWeight: 600 }}>{missingElectives}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="scout-header-right">
          <span
            className="scout-status"
            style={{
              background: `${statusColor}20`,
              border: `1px solid ${statusColor}`,
              color: statusColor,
            }}
          >
            {reason}
          </span>
        </div>
      </header>

      <div className="scout-card__body">
        {/* ── Time-scaled bar graph ── */}
        <div
          className="scout-timeline"
          style={{ position: "relative", height: 40, userSelect: "none" }}
        >
          {/* Track */}
          <div
            className="scout-timeline__track"
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: 6,
              borderRadius: 3,
              background: "var(--timeline-track-bg)",
              transform: "translateY(-50%)",
            }}
          />

          {/* Pre-join inactive section */}
          {preJoinPercent > 0 && (
            <div
              className="scout-timeline__prejoin"
              title="Time before joining unit"
              style={{
                position: "absolute",
                top: "50%",
                transform: "translateY(-50%)",
                left: 0,
                width: `${preJoinPercent}%`,
                height: 6,
                borderRadius: "3px 0 0 3px",
                background: `repeating-linear-gradient(
                                -45deg,
                                var(--timeline-prejoin-stripe), var(--timeline-prejoin-stripe) 4px,
                                transparent 4px, transparent 8px
                            )`,
                border: "1px solid var(--timeline-prejoin-border)",
                zIndex: 1,
              }}
            />
          )}

          {/* Wait zones: stripe background + elapsed-progress overlay */}
          {waitZones.map((z) => {
            const stripeColor = z.isSpeculative
              ? "var(--wait-stripe-a)"
              : "var(--wait-stripe-b)";
            const stripeAlt = z.isSpeculative
              ? "var(--wait-stripe-alt-a)"
              : "var(--wait-stripe-alt-b)";
            const borderColor = z.isSpeculative
              ? "var(--wait-border-soft)"
              : "var(--wait-border-strong)";
            const progressColor = z.isSpeculative
              ? "var(--wait-progress-spec)"
              : "var(--wait-progress-solid)";
            return (
              <React.Fragment key={z.rank}>
                {/* Full wait stripe */}
                <div
                  className="scout-timeline__wait-zone"
                  title={`${z.isSpeculative ? "Projected " : ""}${WAIT_TIMES[z.rank]}-month wait for ${z.rank}`}
                  style={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    left: `${z.start}%`,
                    width: `${z.end - z.start}%`,
                    height: 6,
                    borderRadius: 3,
                    background: `repeating-linear-gradient(
                                        -45deg,
                                        ${stripeColor}, ${stripeColor} 3px,
                                        ${stripeAlt} 3px, ${stripeAlt} 7px
                                    )`,
                    border: `1px solid ${borderColor}`,
                  }}
                />
                {/* Elapsed progress within the wait window */}
                {z.nowClamp > z.start && (
                  <div
                    className="scout-timeline__wait-progress"
                    style={{
                      position: "absolute",
                      top: "50%",
                      transform: "translateY(-50%)",
                      left: `${z.start}%`,
                      width: `${z.nowClamp - z.start}%`,
                      height: 6,
                      borderRadius: "3px 0 0 3px",
                      background: progressColor,
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* Birthday markers */}
          {birthdayMarkers.map((m) => (
            <div
              key={m.age}
              className="scout-timeline__birthday-marker"
              title={`Age ${m.age}`}
              style={{
                position: "absolute",
                left: `${m.percent}%`,
                top: 4,
                bottom: "50%",
                width: 1,
                background: "var(--timeline-marker-line)",
                transform: "translateX(-50%)",
                zIndex: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: "0.6rem",
                  color: "var(--timeline-marker-label)",
                  marginBottom: 2,
                  fontWeight: 600,
                }}
              >
                {m.age}
              </span>
            </div>
          ))}

          {/* Solid fill for earned section */}
          {milestones.filter((m) => m.earned !== null).length > 0 && (
            <div
              className="scout-timeline__earned-fill"
              style={{
                position: "absolute",
                top: "50%",
                transform: "translateY(-50%)",
                left: 0,
                width: `${milestones.filter((m) => m.earned !== null).at(-1)?.percent ?? 0}%`,
                height: 6,
                borderRadius: 3,
                background:
                  "linear-gradient(to right, var(--timeline-accent-start), var(--timeline-accent-end))",
                opacity: 0.85,
              }}
            />
          )}

          {/* Milestone dots */}
          {milestones.map((m) => {
            if (m.percent === null) return null;
            return (
              <div
                key={m.rank}
                className="scout-timeline__milestone"
                title={`${m.rank}${m.earned
                  ? ` – earned ${formatDateLabel(m.earned, false)}`
                  : m.projected
                    ? ` – earliest ${formatDateLabel(m.projected, true)}`
                    : ""
                  }`}
                style={{
                  position: "absolute",
                  left: `${m.percent}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 2,
                  fontSize: "1.05rem",
                  lineHeight: 1,
                  opacity: m.earned ? 1 : 0.45,
                  filter: m.projected
                    ? "grayscale(100%) drop-shadow(0 0 2px rgba(255,255,255,0.1))"
                    : "drop-shadow(0 0 4px rgba(255,255,255,0.3))",
                }}
              >
                {m.short}
              </div>
            );
          })}

          {/* Today marker */}
          {nowPercent > 0 && nowPercent < 100 && (
            <div
              className="scout-timeline__today"
              title="Today"
              style={{
                position: "absolute",
                left: `${nowPercent}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: "var(--timeline-today)",
                transform: "translateX(-50%)",
                borderRadius: 1,
              }}
            />
          )}
        </div>

        {/* ── Rank Date labels ── */}
        <div
          className="scout-rank-axis"
          style={{ position: "relative", height: 32, marginTop: 4 }}
        >
          {milestones
            .filter((m) => m.percent !== null)
            .map((m, index) => {
              const isProjected = m.projected !== null;
              return (
                <span
                  key={m.rank}
                  className="scout-rank-axis__label"
                  style={{
                    position: "absolute",
                    left: `${m.percent}%`,
                    top: index % 2 === 0 ? 0 : 15,
                    transform: "translateX(-50%)",
                    fontSize: "0.68rem",
                    color: m.earned ? "var(--text-dim)" : "var(--rank-axis-projected)",
                    fontWeight: m.earned ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.earned
                    ? formatDateWithApostrophe(m.earned)
                    : isProjected
                      ? `(${formatDateWithApostrophe(m.projected!)})`
                      : null}
                </span>
              );
            })}
        </div>
      </div>
    </article>
  );
};
