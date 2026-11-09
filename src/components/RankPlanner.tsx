import React, { useMemo, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type { ScoutRequirements } from "../logic/rankRequirements";
import { readyForReview, sharedRequirements } from "../logic/rankRequirements";
import { RANK_ORDER } from "../logic/advancement";

export type RankRequirementsLoad =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; scouts: ScoutRequirements[] };

interface Props {
  load: RankRequirementsLoad;
  /** Scouts whose cached data predates member ids and so can't be looked up. */
  staleScouts: number;
  onClose: () => void;
  onRefresh: () => void;
}

export const RankPlanner: React.FC<Props> = ({ load, staleScouts, onClose, onRefresh }) => {
  const [rank, setRank] = useState<string>("all");
  const scouts = useMemo(() => (load.state === "ready" ? load.scouts : []), [load]);
  const ranks = RANK_ORDER.filter((r) => scouts.some((s) => s.rank === r));
  const inView = rank === "all" ? scouts : scouts.filter((s) => s.rank === rank);
  const shared = useMemo(() => sharedRequirements(inView), [inView]);
  const ready = inView.filter(readyForReview).length;

  return (
    <section className="badge-planner rank-planner" aria-labelledby="rank-planner-title">
      <div className="badge-planner__header">
        <div>
          <h3 id="rank-planner-title" className="badge-planner__title">
            Rank planner
          </h3>
          <p className="badge-planner__subtitle">
            Open Scout through First Class requirements, most-shared first, to
            plan skills instruction
          </p>
        </div>
        <div className="badge-planner__controls">
          <button
            type="button"
            className="icon-button"
            onClick={onRefresh}
            disabled={load.state === "loading"}
            aria-label="Reload requirements from Scoutbook"
            title="Reload from Scoutbook"
          >
            <RefreshCw size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close rank planner"
            title="Close"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {staleScouts > 0 && (
        <p className="counselors__warning">
          {staleScouts} scout{staleScouts !== 1 ? "s are" : " is"} from older cached data and
          can&apos;t be included. Use “Clear cached data” in Settings to reload.
        </p>
      )}

      {load.state === "loading" && (
        <p className="badge-planner__empty" role="status">
          Loading rank requirements…
        </p>
      )}
      {load.state === "error" && (
        <p className="badge-planner__empty" role="alert">
          Couldn&apos;t load requirements: {load.message}
        </p>
      )}

      {load.state === "ready" &&
        (scouts.length === 0 ? (
          <p className="badge-planner__empty">
            No scouts are working on Scout through First Class.
          </p>
        ) : (
          <>
            {ranks.length > 1 && (
              <div className="segmented" role="tablist" aria-label="Rank">
                {["all", ...ranks].map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="tab"
                    aria-selected={rank === r}
                    className={`segmented__option${rank === r ? " segmented__option--active" : ""}`}
                    onClick={() => setRank(r)}
                  >
                    {r === "all" ? "All" : r}
                  </button>
                ))}
              </div>
            )}
            <p className="counselors__summary">
              {inView.length} scout{inView.length !== 1 ? "s" : ""} working on{" "}
              {rank === "all" ? "Scout through First Class" : rank}
              {ready > 0 &&
                ` · ${ready} only need${ready === 1 ? "s" : ""} a Scoutmaster conference or board of review`}
            </p>
            {shared.length === 0 ? (
              <p className="badge-planner__empty">No open skill requirements.</p>
            ) : (
              <ul className="badge-planner__list">
                {shared.map((r) => (
                  <li key={r.key} className="badge-planner__item">
                    <div className="badge-planner__item-header">
                      <span className="rank-planner__number figure">
                        {rank === "all" ? `${r.rank} ` : ""}
                        {r.number}
                      </span>
                      <h4 className="badge-planner__badge">{r.short}</h4>
                      <span className="badge-planner__count figure">
                        {r.scouts.length} scout{r.scouts.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {(r.text !== r.short || r.choose) && (
                      <p className="badge-planner__note rank-planner__text" title={r.text}>
                        {r.choose ? `Complete ${r.choose} of the options. ` : ""}
                        {r.text !== r.short ? r.text : ""}
                      </p>
                    )}
                    <ul className="counselors__chips">
                      {r.scouts.map((s) => (
                        <li key={s.userId}>{s.name}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </>
        ))}
    </section>
  );
};
