import React from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import type { GroupBadgeScout, GroupBadgeSuggestion, GroupFormat } from "../logic/advancement";

interface Props {
  unitLabel: string;
  windowMonths: number;
  hostable: GroupBadgeSuggestion[];
  uncovered: GroupBadgeSuggestion[];
  outings: GroupBadgeSuggestion[];
  needElectives: GroupBadgeScout[];
  /** False when counselor data isn't loaded, so the counselor column is omitted. */
  showCounselors: boolean;
}

const FORMAT_LABEL: Record<GroupFormat, string> = {
  meeting: "Fits a meeting",
  kickoff: "Start at a meeting",
  outing: "Needs an outing",
};

const scoutList = (scouts: GroupBadgeScout[]) =>
  scouts.map((s) => `${s.name} (${s.monthsUntil18} mo)`).join(", ");

const Rows: React.FC<{ items: GroupBadgeSuggestion[]; ranked?: boolean; showCounselors: boolean }> = ({
  items,
  ranked,
  showCounselors,
}) => (
  <table className="print-plan__table">
    <thead>
      <tr>
        {ranked && <th className="print-plan__num">#</th>}
        <th>Badge</th>
        <th className="print-plan__col--format">Format</th>
        {showCounselors && <th className="print-plan__col--counselors">Counselors</th>}
        <th className="print-plan__col--scouts">Scouts to invite</th>
      </tr>
    </thead>
    <tbody>
      {items.map((s, i) => (
        <tr key={s.bucket}>
          {ranked && <td className="print-plan__num">{i + 1}</td>}
          <td>
            <strong>{s.host}</strong>
            <div className="print-plan__note">{s.note}</div>
          </td>
          <td>{FORMAT_LABEL[s.format]}</td>
          {showCounselors && (
            <td>
              {s.counselors?.length ? s.counselors.map((c) => c.name).join(", ") : "None in unit"}
              {s.alternates?.map((a) => (
                <div key={a.badge} className="print-plan__note">
                  {a.badge}: {a.counselors.map((c) => c.name).join(", ")}
                </div>
              ))}
            </td>
          )}
          <td>
            {s.scouts.length}: {scoutList(s.scouts)}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/**
 * Print-only copy of the Badge planner. Rendered into <body> beside #root;
 * the print stylesheet hides the app and shows only this.
 */
export const PrintMeetingPlan: React.FC<Props> = ({
  unitLabel,
  windowMonths,
  hostable,
  uncovered,
  outings,
  needElectives,
  showCounselors,
}) =>
  createPortal(
    <div className="print-plan" aria-hidden>
      <header className="print-plan__header">
        <h1>{unitLabel} meeting plan</h1>
        <p>
          Eagle-required merit badges to host for scouts turning 18 within {windowMonths} months ·
          Prepared {format(new Date(), "MMMM d, yyyy")}
        </p>
      </header>

      {hostable.length > 0 ? (
        <section>
          <h2>Host at meetings</h2>
          <Rows items={hostable} ranked showCounselors={showCounselors} />
        </section>
      ) : (
        <p>No Eagle-required badges to host at meetings for this window.</p>
      )}

      {uncovered.length > 0 && (
        <section>
          <h2>Needed, but no counselor in the unit</h2>
          <Rows items={uncovered} showCounselors={showCounselors} />
        </section>
      )}

      {outings.length > 0 && (
        <section>
          <h2>Plan as outings</h2>
          <Rows items={outings} showCounselors={showCounselors} />
        </section>
      )}

      {needElectives.length > 0 && (
        <section>
          <h2>Still short on electives</h2>
          <p>{scoutList(needElectives)}</p>
        </section>
      )}

      <footer className="print-plan__footer">Troop Velocity Tracker · data from Scoutbook</footer>
    </div>,
    document.body,
  );
