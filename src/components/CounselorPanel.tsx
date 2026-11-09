import React, { useMemo, useState } from "react";
import { Mail, RefreshCw, X } from "lucide-react";
import type { UnitCounselor } from "../api/counselors";
import type { ScoutAdvancement } from "../logic/advancement";
import type { CounselorRef } from "../logic/counselors";
import { badgeCoverage, eagleCoverage } from "../logic/counselors";

export type CounselorLoad =
  | { state: "loading"; done: number; total: number }
  | { state: "error"; message: string }
  | { state: "ready"; counselors: UnitCounselor[] };

interface Props {
  load: CounselorLoad;
  scouts: { data: ScoutAdvancement }[];
  onClose: () => void;
  onRefresh: () => void;
}

type View = "eagle" | "badges" | "people";

const VIEWS: { value: View; label: string }[] = [
  { value: "eagle", label: "Eagle-required" },
  { value: "badges", label: "All badges" },
  { value: "people", label: "By counselor" },
];

// Same red/yellow/green language as the scout cards: none, one, two or more.
const depthClass = (n: number) => (n === 0 ? "red" : n === 1 ? "yellow" : "green");
const depthLabel = (n: number) =>
  n === 0 ? "No counselor" : n === 1 ? "1 counselor" : `${n} counselors`;

const Names: React.FC<{ people: CounselorRef[] }> = ({ people }) =>
  people.length ? (
    <ul className="counselors__names">
      {people.map((p) => (
        <li key={p.memberId}>{p.name}</li>
      ))}
    </ul>
  ) : null;

const EagleView: React.FC<{
  counselors: UnitCounselor[];
  scouts: { data: ScoutAdvancement }[];
}> = ({ counselors, scouts }) => {
  const rows = useMemo(() => eagleCoverage(counselors, scouts), [counselors, scouts]);
  const gaps = rows.filter((r) => r.counselorCount === 0);
  const thin = rows.filter((r) => r.counselorCount === 1);
  // Gaps that block scouts come first, then the most-needed badges.
  const sorted = [...rows].sort(
    (a, b) =>
      Math.min(a.counselorCount, 2) - Math.min(b.counselorCount, 2) ||
      b.scoutsNeeding - a.scoutsNeeding ||
      a.bucket.localeCompare(b.bucket),
  );

  return (
    <>
      <p className="counselors__summary">
        {gaps.length === 0
          ? "Every Eagle-required badge has a counselor in the unit."
          : `${gaps.length} Eagle-required badge${gaps.length !== 1 ? "s have" : " has"} no counselor in the unit.`}
        {thin.length > 0 &&
          ` ${thin.length} ${thin.length !== 1 ? "rely" : "relies"} on a single counselor.`}
      </p>
      <ul className="badge-planner__list">
        {sorted.map((r) => (
          <li key={r.bucket} className={`counselors__row counselors__row--${depthClass(r.counselorCount)}`}>
            <div className="badge-planner__item-header">
              <span className="status-dot" aria-hidden />
              <h4 className="badge-planner__badge">{r.bucket}</h4>
              <span className="badge-planner__count figure">
                {r.scoutsNeeding} scout{r.scoutsNeeding !== 1 ? "s" : ""} need it
              </span>
            </div>
            <p className="counselors__depth">{depthLabel(r.counselorCount)}</p>
            {r.options.length > 1
              ? r.options
                  .filter((o) => o.counselors.length)
                  .map((o) => (
                    <div key={o.badge} className="counselors__option">
                      <span className="counselors__option-name">{o.badge}</span>
                      <Names people={o.counselors} />
                    </div>
                  ))
              : <Names people={r.options[0].counselors} />}
          </li>
        ))}
      </ul>
    </>
  );
};

const BadgesView: React.FC<{ counselors: UnitCounselor[] }> = ({ counselors }) => {
  const [query, setQuery] = useState("");
  const all = useMemo(() => badgeCoverage(counselors), [counselors]);
  const q = query.trim().toLowerCase();
  const rows = q ? all.filter((r) => r.badge.toLowerCase().includes(q)) : all;
  const deep = all.filter((r) => r.counselors.length >= 2).length;

  return (
    <>
      <p className="counselors__summary">
        The unit can counsel {all.length} badge{all.length !== 1 ? "s" : ""};{" "}
        {deep} {deep !== 1 ? "have" : "has"} two or more counselors.
      </p>
      <label htmlFor="counselors-search" className="sr-only">
        Search badges
      </label>
      <input
        id="counselors-search"
        className="counselors__search"
        type="search"
        placeholder="Search badges"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {rows.length === 0 ? (
        <p className="badge-planner__empty">No counselor in the unit for “{query}”.</p>
      ) : (
        <ul className="badge-planner__list">
          {rows.map((r) => (
            <li key={r.badge} className={`counselors__row counselors__row--${depthClass(r.counselors.length)}`}>
              <div className="badge-planner__item-header">
                <span className="status-dot" aria-hidden />
                <h4 className="badge-planner__badge">{r.badge}</h4>
                {r.eagleBucket && <span className="counselors__tag">Eagle</span>}
                <span className="badge-planner__count figure">{r.counselors.length}</span>
              </div>
              <Names people={r.counselors} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

const PeopleView: React.FC<{ counselors: UnitCounselor[] }> = ({ counselors }) => (
  <ul className="badge-planner__list">
    {counselors.map((c) => (
      <li key={c.memberId} className="counselors__person">
        <div className="badge-planner__item-header">
          <h4 className="badge-planner__badge">{c.name}</h4>
          {c.email && (
            <a className="icon-button counselors__mail" href={`mailto:${c.email}`} title={`Email ${c.name}`} aria-label={`Email ${c.name}`}>
              <Mail size={14} strokeWidth={1.5} />
            </a>
          )}
          <span className="badge-planner__count figure">
            {c.badges.length} badge{c.badges.length !== 1 ? "s" : ""}
          </span>
        </div>
        <p className="badge-planner__note">
          {[
            c.availability,
            c.assignedScouts
              ? `${c.assignedScouts} scout${c.assignedScouts !== 1 ? "s" : ""} assigned`
              : "No scouts assigned",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {!c.registrationCurrent && (
          <p className="counselors__warning">Registration isn&apos;t current in Scoutbook</p>
        )}
        <ul className="counselors__chips">
          {c.badges.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </li>
    ))}
  </ul>
);

export const CounselorPanel: React.FC<Props> = ({ load, scouts, onClose, onRefresh }) => {
  const [view, setView] = useState<View>("eagle");
  const count = load.state === "ready" ? load.counselors.length : null;

  return (
    <section className="badge-planner counselors" aria-labelledby="counselors-title">
      <div className="badge-planner__header">
        <div>
          <h3 id="counselors-title" className="badge-planner__title">
            Merit badge counselors
          </h3>
          <p className="badge-planner__subtitle">
            {count === null
              ? "Adults in the unit approved to counsel merit badges"
              : `${count} adult${count !== 1 ? "s" : ""} in the unit approved to counsel merit badges`}
          </p>
        </div>
        <div className="badge-planner__controls">
          <button
            type="button"
            className="icon-button"
            onClick={onRefresh}
            disabled={load.state === "loading"}
            aria-label="Reload counselors from Scoutbook"
            title="Reload from Scoutbook"
          >
            <RefreshCw size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close counselors"
            title="Close"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {load.state === "loading" && (
        <p className="badge-planner__empty" role="status">
          Loading counselor profiles…{" "}
          {load.total > 0 && (
            <span className="figure">
              {load.done} of {load.total} adults
            </span>
          )}
        </p>
      )}

      {load.state === "error" && (
        <p className="badge-planner__empty" role="alert">
          Couldn&apos;t load counselors: {load.message}
        </p>
      )}

      {load.state === "ready" &&
        (load.counselors.length === 0 ? (
          <p className="badge-planner__empty">
            No adults in the unit are currently approved to counsel a merit badge.
          </p>
        ) : (
          <>
            <div className="segmented" role="tablist" aria-label="Counselor view">
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  role="tab"
                  aria-selected={view === v.value}
                  className={`segmented__option${view === v.value ? " segmented__option--active" : ""}`}
                  onClick={() => setView(v.value)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {view === "eagle" && <EagleView counselors={load.counselors} scouts={scouts} />}
            {view === "badges" && <BadgesView counselors={load.counselors} />}
            {view === "people" && <PeopleView counselors={load.counselors} />}
          </>
        ))}
    </section>
  );
};
