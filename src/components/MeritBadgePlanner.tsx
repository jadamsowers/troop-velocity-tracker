import React, { useState } from "react";
import type {
  GroupBadgeScout,
  GroupBadgeSuggestion,
  GroupFormat,
  ScoutAdvancement,
} from "../logic/advancement";
import { suggestGroupMeritBadges } from "../logic/advancement";

interface Props {
  scouts: { firstName: string; lastName: string; data: ScoutAdvancement }[];
  onClose: () => void;
}

const WINDOW_OPTIONS = [
  { value: 12, label: "Turning 18 within 12 months" },
  { value: 24, label: "Turning 18 within 24 months" },
  { value: 36, label: "Turning 18 within 36 months" },
];

const FORMAT_LABEL: Record<GroupFormat, string> = {
  meeting: "Meeting-friendly",
  kickoff: "Kick off at a meeting",
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
        {s.name} <span>{s.monthsUntil18}mo</span>
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
        <span className="badge-planner__rank">{rank}</span>
      )}
      <h4 className="badge-planner__badge">{s.host}</h4>
      <span className={`badge-planner__format badge-planner__format--${s.format}`}>
        {FORMAT_LABEL[s.format]}
      </span>
      <span className="badge-planner__count">
        {s.scouts.length} scout{s.scouts.length !== 1 ? "s" : ""}
      </span>
    </div>
    <p className="badge-planner__note">{s.note}</p>
    <ScoutChips scouts={s.scouts} />
  </li>
);

export const MeritBadgePlanner: React.FC<Props> = ({ scouts, onClose }) => {
  const [windowMonths, setWindowMonths] = useState(24);
  const { suggestions, scoutsInWindow, needElectives } =
    suggestGroupMeritBadges(scouts, windowMonths);

  const hostable = suggestions.filter((s) => s.format !== "outing");
  const outings = suggestions.filter((s) => s.format === "outing");

  return (
    <section className="badge-planner" aria-labelledby="badge-planner-title">
      <div className="badge-planner__header">
        <div>
          <h3 id="badge-planner-title" className="badge-planner__title">
            Merit Badge Planner
          </h3>
          <p className="badge-planner__subtitle">
            Eagle-required badges to host, ranked by how many scouts need them
            and how soon they turn 18.
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
          <button className="badge-planner__close" onClick={onClose}>
            Done
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
            Any meeting-friendly elective these scouts haven't earned moves
            them toward 21 badges.
          </p>
          <ScoutChips scouts={needElectives} />
        </div>
      )}
    </section>
  );
};
