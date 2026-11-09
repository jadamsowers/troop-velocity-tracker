import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import type {
  GroupBadgeScout,
  GroupBadgeSuggestion,
  GroupFormat,
  ScoutAdvancement,
} from "../logic/advancement";
import { suggestGroupMeritBadges } from "../logic/advancement";
import type { UnitCounselor } from "../api/counselors";
import { badgeKey, counselorIndex } from "../logic/counselors";

interface Props {
  scouts: { firstName: string; lastName: string; data: ScoutAdvancement }[];
  /** Unit counselors; null while not (yet) loaded, which ranks by demand alone. */
  counselors: UnitCounselor[] | null;
  onClose: () => void;
}

const WINDOW_OPTIONS = [
  { value: 12, label: "18 within 12 months" },
  { value: 24, label: "18 within 24 months" },
  { value: 36, label: "18 within 36 months" },
];

const FORMAT_LABEL: Record<GroupFormat, string> = {
  meeting: "Fits a meeting",
  kickoff: "Start at a meeting",
  outing: "Needs an outing",
};

const urgencyClass = (months: number) =>
  months <= 12 ? "red" : months <= 24 ? "yellow" : "green";

const ScoutChips: React.FC<{ scouts: GroupBadgeScout[] }> = ({ scouts }) => (
  <ul className="badge-planner__scouts">
    {scouts.map((s) => (
      <li
        key={s.name}
        className={`badge-planner__scout badge-planner__scout--${urgencyClass(s.monthsUntil18)}`}
        title={`${s.monthsUntil18} month${s.monthsUntil18 !== 1 ? "s" : ""} until 18`}
      >
        <span className="status-dot" aria-hidden />
        {s.name} <span className="figure">{s.monthsUntil18} mo</span>
      </li>
    ))}
  </ul>
);

const SuggestionCard: React.FC<{ s: GroupBadgeSuggestion; rank?: number }> = ({
  s,
  rank,
}) => (
  <li className="badge-planner__item">
    <div className="badge-planner__item-header">
      {rank !== undefined && (
        <span className="badge-planner__rank figure">{rank}</span>
      )}
      <h4 className="badge-planner__badge">{s.host}</h4>
      <span className={`badge-planner__format badge-planner__format--${s.format}`}>
        {FORMAT_LABEL[s.format]}
      </span>
      <span className="badge-planner__count figure">
        {s.scouts.length} scout{s.scouts.length !== 1 ? "s" : ""}
      </span>
    </div>
    <p className="badge-planner__note">{s.note}</p>
    {s.counselors && (
      <p className="badge-planner__counselors">
        {s.counselors.length ? (
          <>
            Counselor{s.counselors.length !== 1 ? "s" : ""}:{" "}
            <strong>{s.counselors.map((c) => c.name).join(", ")}</strong>
          </>
        ) : (
          "No counselor in the unit"
        )}
        {s.alternates?.map((a) => (
          <React.Fragment key={a.badge}>
            {" · "}
            {a.badge}: {a.counselors.map((c) => c.name).join(", ")}
          </React.Fragment>
        ))}
      </p>
    )}
    <ScoutChips scouts={s.scouts} />
  </li>
);

export const MeritBadgePlanner: React.FC<Props> = ({
  scouts,
  counselors,
  onClose,
}) => {
  const [windowMonths, setWindowMonths] = useState(24);
  const counselorsFor = useMemo(() => {
    if (!counselors) return undefined;
    const index = counselorIndex(counselors);
    return (badge: string) => index.get(badgeKey(badge)) ?? [];
  }, [counselors]);
  const { suggestions, scoutsInWindow, needElectives } =
    suggestGroupMeritBadges(scouts, windowMonths, counselorsFor);

  // Without counselor data every suggestion counts as runnable.
  const runnable = (s: GroupBadgeSuggestion) => !s.counselors || s.counselors.length > 0;
  const hostable = suggestions.filter((s) => runnable(s) && s.format !== "outing");
  const outings = suggestions.filter((s) => runnable(s) && s.format === "outing");
  const uncovered = suggestions.filter((s) => !runnable(s));

  return (
    <section className="badge-planner" aria-labelledby="badge-planner-title">
      <div className="badge-planner__header">
        <div>
          <h3 id="badge-planner-title" className="badge-planner__title">
            Badge planner
          </h3>
          <p className="badge-planner__subtitle">
            {counselors
              ? "Eagle-required badges to host, ranked by whether the unit has a counselor, how many scouts need them and how soon they turn 18"
              : "Eagle-required badges to host, ranked by how many scouts need them and how soon they turn 18"}
          </p>
        </div>
        <div className="badge-planner__controls">
          <label htmlFor="badge-planner-window" className="sr-only">
            Age window
          </label>
          <select
            id="badge-planner-window"
            value={windowMonths}
            onChange={(e) => setWindowMonths(Number(e.target.value))}
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close badge planner"
            title="Close"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {scoutsInWindow === 0 ? (
        <p className="badge-planner__empty">
          No scouts turn 18 within {windowMonths} months.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="badge-planner__empty">
          All {scoutsInWindow} scout{scoutsInWindow !== 1 ? "s" : ""} in this
          window have every Eagle-required merit badge.
        </p>
      ) : (
        <>
          {hostable.length > 0 && (
            <ol className="badge-planner__list">
              {hostable.map((s, i) => (
                <SuggestionCard key={s.bucket} s={s} rank={i + 1} />
              ))}
            </ol>
          )}
          {uncovered.length > 0 && (
            <>
              <h4 className="badge-planner__section">
                Needed, but no counselor in the unit
              </h4>
              <ul className="badge-planner__list">
                {uncovered.map((s) => (
                  <SuggestionCard key={s.bucket} s={s} />
                ))}
              </ul>
            </>
          )}
          {outings.length > 0 && (
            <>
              <h4 className="badge-planner__section">
                Also needed, but plan as outings
              </h4>
              <ul className="badge-planner__list">
                {outings.map((s) => (
                  <SuggestionCard key={s.bucket} s={s} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {needElectives.length > 0 && (
        <div className="badge-planner__electives">
          <h4 className="badge-planner__section">
            Still short on electives
          </h4>
          <p className="badge-planner__note">
            Any elective these scouts haven't earned moves them toward 21
            badges
          </p>
          <ScoutChips scouts={needElectives} />
        </div>
      )}
    </section>
  );
};
