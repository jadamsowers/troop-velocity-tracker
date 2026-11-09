import React, { useMemo } from "react";
import { X } from "lucide-react";
import type { ScoutAdvancement } from "../logic/advancement";
import type { UnitCounselor } from "../api/counselors";
import type { ScoutRequirements } from "../logic/rankRequirements";
import type { FollowUpItem } from "../logic/followUps";
import { buildFollowUps, STALLED_MONTHS } from "../logic/followUps";

interface Props {
  scouts: { userId: number; firstName: string; lastName: string; data: ScoutAdvancement }[];
  /** Rank planner data; null while loading or unavailable. */
  requirements: ScoutRequirements[] | null;
  requirementsLoading: boolean;
  counselors: UnitCounselor[] | null;
  onClose: () => void;
}

const Section: React.FC<{ title: string; hint: string; items: FollowUpItem[] }> = ({
  title,
  hint,
  items,
}) =>
  items.length ? (
    <>
      <h4 className="badge-planner__section">
        {title} <span className="figure follow-ups__count">{items.length}</span>
      </h4>
      <p className="badge-planner__note">{hint}</p>
      <ul className="badge-planner__list follow-ups__list">
        {items.map((i) => (
          <li key={`${i.userId}|${i.subject}`} className="follow-ups__item">
            <span className="follow-ups__scout">{i.scout}</span>
            <span className="follow-ups__subject">{i.subject}</span>
            {i.detail && <span className="follow-ups__detail">{i.detail}</span>}
          </li>
        ))}
      </ul>
    </>
  ) : null;

export const FollowUps: React.FC<Props> = ({
  scouts,
  requirements,
  requirementsLoading,
  counselors,
  onClose,
}) => {
  const f = useMemo(() => {
    const byUser = new Map((counselors ?? []).filter((c) => c.userId).map((c) => [c.userId!, c.name]));
    return buildFollowUps(scouts, requirements, (id) => byUser.get(id));
  }, [scouts, requirements, counselors]);
  const total =
    f.conference.length + f.boardOfReview.length + f.leaderApproval.length + f.present.length + f.stalled.length;

  return (
    <section className="badge-planner follow-ups" aria-labelledby="follow-ups-title">
      <div className="badge-planner__header">
        <div>
          <h3 id="follow-ups-title" className="badge-planner__title">
            Follow-ups
          </h3>
          <p className="badge-planner__subtitle">
            Advancement waiting on an adult: conferences, boards, approvals,
            awards and stalled badges
          </p>
        </div>
        <div className="badge-planner__controls">
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close follow-ups"
            title="Close"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {requirementsLoading && (
        <p className="badge-planner__note" role="status">
          Checking rank requirements for Scoutmaster conference readiness…
        </p>
      )}

      {total === 0 && !requirementsLoading ? (
        <p className="badge-planner__empty">Nothing waiting on an adult right now.</p>
      ) : (
        <>
          <Section
            title="Ready for a Scoutmaster conference"
            hint="Every other requirement for the rank is done"
            items={f.conference}
          />
          <Section
            title="Ready for a board of review"
            hint="All requirements complete"
            items={f.boardOfReview}
          />
          <Section
            title="Merit badges awaiting leader approval"
            hint="Counselor has signed off"
            items={f.leaderApproval}
          />
          <Section
            title="Ready to present at a court of honor"
            hint="Approved in Scoutbook but not yet awarded"
            items={f.present}
          />
          <Section
            title="Stalled merit badges"
            hint={`Started more than ${STALLED_MONTHS} months ago and not finished. Longest first, with the counselor to follow up with`}
            items={f.stalled}
          />
        </>
      )}
    </section>
  );
};
