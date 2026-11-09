import { useState, useEffect } from "react";
import "./index.css";
import { ScoutRow } from "./components/ScoutRow";
import { Setup } from "./components/Setup";
import { MeritBadgePlanner } from "./components/MeritBadgePlanner";
import { CounselorPanel } from "./components/CounselorPanel";
import type { CounselorLoad } from "./components/CounselorPanel";
import { loadUnitCounselors } from "./api/counselors";
import type { ScoutAdvancement } from "./logic/advancement";
import { getStatus, RANK_ORDER } from "./logic/advancement";
import type { LeadershipPosition, Status } from "./logic/advancement";
import { auth } from "./api/auth";
import { scoutingClient } from "./api/scoutingClient";
import { cacheManager } from "./api/cache";
import { parseISO, differenceInMonths, addMonths } from "date-fns";
import { Settings, LogOut, Search, ListChecks, Users, X } from "lucide-react";
import { BrandMark } from "./components/BrandMark";
import { ThemeToggle } from "./theme/ThemeToggle";

const SESSION_ENDED_NOTICE =
  "Your scouting.org session has expired. Sign in again to continue.";

function App() {
  const [scouts, setScouts] = useState<any[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(
    auth.isAuthenticated(),
  );
  // A remembered unit without a usable token means a previous session ended
  // (expired, or rejected by the API) rather than an explicit sign-out.
  const [sessionNotice, setSessionNotice] = useState(() => {
    if (auth.isAuthenticated()) return "";
    if (auth.getToken() && !auth.hasValidToken()) auth.expireSession();
    return auth.getUnitId() ? SESSION_ENDED_NOTICE : "";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({
    current: 0,
    total: 0,
  });
  const [lastLoadedTime, setLastLoadedTime] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<string>("risk");
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedScouts, setSelectedScouts] = useState<Set<number>>(new Set());
  const [showComparison, setShowComparison] = useState(false);
  // One side panel at a time: the badge planner or the counselor roster.
  const [sidePanel, setSidePanel] = useState<"planner" | "counselors" | null>(null);
  const [counselorLoad, setCounselorLoad] = useState<CounselorLoad | null>(null);
  const [filteredOutCount, setFilteredOutCount] = useState(0);

  type SortOption = { value: string; label: string };
  const SORT_OPTIONS: SortOption[] = [
    { value: "risk", label: "Most at risk" },
    { value: "stagnant_desc", label: "Longest since last rank" },
    { value: "last_name", label: "Last name" },
    { value: "first_name", label: "First name" },
    { value: "age_desc", label: "Oldest first" },
    { value: "age_asc", label: "Youngest first" },
    { value: "rank_desc", label: "Highest rank first" },
    { value: "rank_asc", label: "Lowest rank first" },
  ];

  const STATUS_ORDER = { red: 0, yellow: 1, green: 2 };

  const sortedScouts = [...scouts].sort((a, b) => {
    switch (sortBy) {
      case "last_name":
        return (
          a.lastName.localeCompare(b.lastName) ||
          a.firstName.localeCompare(b.firstName)
        );
      case "first_name":
        return (
          a.firstName.localeCompare(b.firstName) ||
          a.lastName.localeCompare(b.lastName)
        );
      case "risk": {
        const sa = STATUS_ORDER[getStatus(a.data as ScoutAdvancement)] ?? 2;
        const sb = STATUS_ORDER[getStatus(b.data as ScoutAdvancement)] ?? 2;
        if (sa !== sb) return sa - sb;
        const da = a.data?.dob ? parseISO(a.data.dob).getTime() : Infinity;
        const db = b.data?.dob ? parseISO(b.data.dob).getTime() : Infinity;
        return da - db || a.lastName.localeCompare(b.lastName);
      }
      case "age_desc": {
        const da = a.data?.dob ? parseISO(a.data.dob).getTime() : 0;
        const db = b.data?.dob ? parseISO(b.data.dob).getTime() : 0;
        return da - db; // older DOB = earlier timestamp = first
      }
      case "age_asc": {
        const da = a.data?.dob ? parseISO(a.data.dob).getTime() : 0;
        const db = b.data?.dob ? parseISO(b.data.dob).getTime() : 0;
        return db - da;
      }
      case "rank_desc": {
        const ra = RANK_ORDER.indexOf(
          (a.data as ScoutAdvancement).ranks
            .filter((r: any) => r.dateEarned)
            .at(-1)?.rankName ?? "",
        );
        const rb = RANK_ORDER.indexOf(
          (b.data as ScoutAdvancement).ranks
            .filter((r: any) => r.dateEarned)
            .at(-1)?.rankName ?? "",
        );
        return rb - ra || a.lastName.localeCompare(b.lastName);
      }
      case "stagnant_desc": {
        const getLastRankDate = (s: any) => {
          const earned = (s.data as ScoutAdvancement).ranks.filter(
            (r: any) => r.dateEarned,
          );
          if (earned.length === 0) return 0; // 0 timestamp places them at the top as most stagnant
          return Math.max(
            ...earned.map((r: any) => parseISO(r.dateEarned).getTime()),
          );
        };
        return (
          getLastRankDate(a) - getLastRankDate(b) ||
          a.lastName.localeCompare(b.lastName)
        );
      }
      case "rank_asc": {
        const ra = RANK_ORDER.indexOf(
          (a.data as ScoutAdvancement).ranks
            .filter((r: any) => r.dateEarned)
            .at(-1)?.rankName ?? "",
        );
        const rb = RANK_ORDER.indexOf(
          (b.data as ScoutAdvancement).ranks
            .filter((r: any) => r.dateEarned)
            .at(-1)?.rankName ?? "",
        );
        return ra - rb || a.lastName.localeCompare(b.lastName);
      }
      default:
        return 0;
    }
  });

  // Apply name filter
  const filteredScouts = sortedScouts.filter((scout) => {
    const fullName = `${scout.firstName} ${scout.lastName}`.toLowerCase();
    const matchesName = fullName.includes(searchFilter.toLowerCase());
    // If in comparison mode, only show selected scouts
    if (showComparison && selectedScouts.size > 0) {
      return selectedScouts.has(scout.userId) && matchesName;
    }
    return matchesName;
  });

  useEffect(() => {
    if (isAuthenticated) {
      setScouts([]); // clear previous data immediately
      const unitId = auth.getUnitId();
      if (unitId) {
        loadData(unitId);
      }
    }
  }, [isAuthenticated]);

  // Return to sign-in as soon as the stored token expires.
  useEffect(() => {
    if (!isAuthenticated) return;
    const expiry = auth.getSessionExpiry();
    if (expiry === null) return;
    const endSession = () => {
      auth.expireSession();
      setShowSettings(false);
      setSessionNotice(SESSION_ENDED_NOTICE);
      setIsAuthenticated(false);
    };
    // setTimeout overflows past ~24.8 days; tokens are far shorter-lived.
    const delay = Math.min(Math.max(expiry - Date.now(), 0), 2 ** 31 - 1);
    const timer = window.setTimeout(endSession, delay);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated]);

  const loadData = async (unitId: string) => {
    // Check cache first
    const cachedScouts = cacheManager.get(unitId);
    if (cachedScouts) {
      console.log("Loading scouts from cache");
      setScouts(cachedScouts);
      const cacheTimestamp = cacheManager.getCacheTimestamp(unitId);
      setLastLoadedTime(cacheTimestamp);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadingProgress({ current: 0, total: 0 });
    const allScouts: any[] = [];
    try {
      const [roster, leadershipRes] = await Promise.all([
        scoutingClient.getUnitRoster(unitId),
        // One call covers every scout; if it fails, cards just omit leadership.
        scoutingClient.getUnitLeadershipPositions(unitId).catch((err) => {
          console.warn("Leadership positions unavailable", err);
          return null;
        }),
      ]);
      const leadershipByUser = new Map<number, LeadershipPosition[]>();
      for (const youth of leadershipRes ?? []) {
        leadershipByUser.set(
          youth.userId,
          (youth.leadershipPositionHistory ?? [])
            .filter((p) => p.startDate && p.approved !== false)
            .map((p) => ({
              position: p.position,
              startDate: p.startDate!,
              endDate: p.endDate || undefined,
            })),
        );
      }
      const allRosterUsers = roster.users || [];
      const now = new Date();
      const users = allRosterUsers.filter((youth: any) => {
        // Filter out 18+ scouts
        if (typeof youth.age === "number" && youth.age >= 18) return false;
        const dobStr = youth.dateOfBirth || youth.dob;
        if (dobStr) {
          if (differenceInMonths(now, parseISO(dobStr)) >= 18 * 12)
            return false;
        }

        // Filter out Eagle scouts
        let currentRank = "";
        if (youth.lastRankApproved?.rank) {
          currentRank = youth.lastRankApproved.rank;
        } else if (
          Array.isArray(youth.highestRanksAwarded) &&
          youth.highestRanksAwarded.length > 0
        ) {
          currentRank = youth.highestRanksAwarded[0].rank || "";
        }
        if (currentRank.includes("Eagle")) return false;

        return true;
      });
      setFilteredOutCount(allRosterUsers.length - users.length);

      if (users.length === 0) {
        console.warn("Roster returned 0 users");
        return;
      }

      // Set initial progress
      setLoadingProgress({ current: 0, total: users.length });
      const totalYouth = users.length;
      await Promise.all(
        users.map(async (youth: any) => {
          const userId = String(youth.userId);
          try {
            const [ranksRes, mbRes, activityRes] = await Promise.allSettled([
              scoutingClient.getRanks(userId),
              scoutingClient.getMeritBadges(userId),
              scoutingClient.getActivitySummary(userId),
            ]);
            const activitySummary =
              activityRes.status === "fulfilled" ? activityRes.value : null;

            const rawRanks =
              ranksRes.status === "fulfilled" ? ranksRes.value : null;
            let ranksList: any[] = [];
            if (rawRanks?.program && Array.isArray(rawRanks.program)) {
              const scoutsBsa = rawRanks.program.find(
                (p: any) => p.program === "Scouts BSA",
              );
              if (scoutsBsa && Array.isArray(scoutsBsa.ranks)) {
                ranksList = scoutsBsa.ranks;
              }
            }

            const ranks = ranksList.map((r: any) => {
              let d =
                r.dateEarned ||
                r.earnedDate ||
                r.leaderApprovedDate ||
                r.markedCompletedDate ||
                r.awardedDate ||
                r.completedDate;
              if (typeof d === "string" && d.trim() === "") d = null;

              // If we still don't have a date but the API explicitly says it's awarded, use today as a fallback so it registers as earned
              if (!d && (r.awarded === true || r.status === "Awarded")) {
                d = new Date().toISOString();
              }

              let name = r.rankName ?? r.name ?? r.rank;
              if (name === "Star Scout") name = "Star";
              if (name === "Life Scout") name = "Life";
              if (name === "Eagle Scout") name = "Eagle";

              return {
                rankName: name,
                dateEarned: d,
              };
            });

            const mbData = mbRes.status === "fulfilled" ? mbRes.value : null;
            let mbArray: any[] = [];
            if (mbData?.program && Array.isArray(mbData.program)) {
              const scoutsBsa = mbData.program.find(
                (p: any) => p.program === "Scouts BSA",
              );
              if (scoutsBsa && Array.isArray(scoutsBsa.meritBadges))
                mbArray = scoutsBsa.meritBadges;
            } else if (Array.isArray(mbData?.meritBadges)) {
              mbArray = mbData.meritBadges;
            } else if (Array.isArray(mbData)) {
              mbArray = mbData;
            }

            const earnedMeritBadgesObj = mbArray.filter((mb: any) => {
              const d =
                mb.dateEarned ||
                mb.earnedDate ||
                mb.leaderApprovedDate ||
                mb.markedCompletedDate ||
                mb.awardedDate;
              const hasDate = typeof d === "string" && d.trim() !== "";
              return (
                mb.awarded === true ||
                mb.status === "Awarded" ||
                mb.percentCompleted === 1 ||
                hasDate
              );
            });
            const meritBadgeCount = earnedMeritBadgesObj.length;
            const earnedMeritBadges = earnedMeritBadgesObj.map(
              (mb: any) => mb.name || mb.meritBadge || "",
            );

            let dob = youth.dateOfBirth || youth.dob || "";
            let scoutEmail = youth.email || "";
            let profile: any = null;

            try {
              profile = await scoutingClient.getScoutProfile(userId);
              if (!dob) dob = profile?.dateOfBirth || profile?.dob || "";
              if (!scoutEmail) scoutEmail = profile?.email || "";
            } catch {
              /* ignore */
            }

            console.log(`API PAYLOADS FOR ${youth.firstName}:`, {
              youth,
              profile,
            });

            let parentEmails: string[] = [];
            if (youth.parents && Array.isArray(youth.parents)) {
              youth.parents.forEach((p: any) => {
                if (p.email) parentEmails.push(p.email);
              });
            }
            if (profile?.parents && Array.isArray(profile.parents)) {
              profile.parents.forEach((p: any) => {
                if (p.email) parentEmails.push(p.email);
              });
            }
            if (profile?.connections && Array.isArray(profile.connections)) {
              profile.connections.forEach((c: any) => {
                if (c.isParent && c.email) parentEmails.push(c.email);
              });
            }

            // deduplicate parent emails
            parentEmails = Array.from(
              new Set(
                parentEmails.filter(Boolean).map((e) => e.trim().toLowerCase()),
              ),
            );

            const scout = {
              userId: youth.userId,
              firstName: youth.firstName,
              lastName: youth.lastName,
              data: {
                dob,
                ranks,
                meritBadgeCount,
                earnedMeritBadges,
                scoutEmail,
                parentEmails,
                activity: activitySummary
                  ? {
                      campingNights: activitySummary.campingLogs?.totalNumberOfNights ?? 0,
                      serviceHours: activitySummary.serviceLogs?.totalNumberOfHours ?? 0,
                      hikingMiles: activitySummary.hikingLogs?.totalNumberOfMiles ?? 0,
                    }
                  : undefined,
                leadership: leadershipRes
                  ? leadershipByUser.get(youth.userId) ?? []
                  : undefined,
                nickname: youth.nickname || profile?.nickname,
              } as ScoutAdvancement,
            };

            // Catch any scouts whose unit roster was out-of-date, but their actual API shows they are Eagle
            const hasEagle = ranks.some(
              (r: any) => r.rankName === "Eagle" && r.dateEarned,
            );
            if (hasEagle) {
              return;
            }

            allScouts.push(scout);
            setScouts((prev) => {
              const existing = prev.find((s) => s.userId === scout.userId);
              if (existing) return prev;
              return [...prev, scout];
            });
          } catch (err) {
            console.warn(`Failed to load data for ${youth.firstName}`, err);
          } finally {
            setLoadingProgress((prev) => ({
              current: Math.min(prev.current + 1, totalYouth),
              total: totalYouth,
            }));
          }
        }),
      );
    } catch (err) {
      console.error("Failed to load roster:", err);
    } finally {
      // Cache the scouts if we loaded any
      if (allScouts.length > 0) {
        cacheManager.set(unitId, allScouts);
        setLastLoadedTime(new Date());
      }
      setLoading(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  };

  // Counselor profiles are one request per adult, so only fetch them once a
  // panel that uses them is opened.
  const loadCounselors = async (refresh = false) => {
    const unitId = auth.getUnitId();
    if (!unitId) return;
    setCounselorLoad({ state: "loading", done: 0, total: 0 });
    try {
      const counselors = await loadUnitCounselors(unitId, {
        refresh,
        onProgress: (done, total) => setCounselorLoad({ state: "loading", done, total }),
      });
      if (auth.getUnitId() === unitId) setCounselorLoad({ state: "ready", counselors });
    } catch (e) {
      setCounselorLoad({
        state: "error",
        message: e instanceof Error ? e.message : "unknown error",
      });
    }
  };

  useEffect(() => {
    if (sidePanel && isAuthenticated && counselorLoad === null) loadCounselors();
  }, [sidePanel, isAuthenticated, counselorLoad]);

  const togglePanel = (panel: "planner" | "counselors") =>
    setSidePanel((open) => (open === panel ? null : panel));

  const handleLogout = () => {
    auth.logout();
    setIsAuthenticated(false);
    setScouts([]);
    setCounselorLoad(null);
  };

  const handleClearCache = () => {
    cacheManager.clear();
    setCounselorLoad(null);
    setScouts([]);
    const unitId = auth.getUnitId();
    if (unitId) {
      loadData(unitId);
    }
  };

  const now = new Date();
  const statusCounts: Record<Status, number> = { red: 0, yellow: 0, green: 0 };
  let turning18Soon = 0;
  for (const s of scouts) {
    statusCounts[getStatus(s.data as ScoutAdvancement)]++;
    const dob = s.data?.dob ? parseISO(s.data.dob) : null;
    if (dob && differenceInMonths(addMonths(dob, 18 * 12), now) < 12)
      turning18Soon++;
  }

  const unitLabel = auth.getUnitLabel()?.trim() || "Troop";
  const comparing = showComparison && selectedScouts.size > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand">
            <BrandMark />
            <span className="brand__name">Troop Velocity Tracker</span>
          </div>
          {isAuthenticated && !showSettings && (
            <div className="topbar__actions">
              <ThemeToggle />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowSettings(!showSettings)}
                aria-label="Settings"
                title="Settings"
              >
                <Settings size={18} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={handleLogout}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} strokeWidth={1.5} />
              </button>
            </div>
          )}
          {(!isAuthenticated || showSettings) && (
            <div className="topbar__actions">
              <ThemeToggle />
            </div>
          )}
        </div>
      </header>

      <main className="page">
        {!isAuthenticated ? (
          <Setup
            notice={sessionNotice}
            onComplete={() => {
              setSessionNotice("");
              setIsAuthenticated(true);
            }}
          />
        ) : showSettings ? (
          <Setup
            onComplete={() => {
              setIsAuthenticated(true);
              setShowSettings(false);
            }}
            onCancel={() => setShowSettings(false)}
            isEditing={true}
            onClearCache={handleClearCache}
          />
        ) : (
          <div className="dashboard">
            <section className="overview" aria-label="Troop summary">
              <div className="overview__title">
                <h1>{unitLabel}</h1>
                <p className="overview__meta">
                  {loading
                    ? `Loading ${loadingProgress.current} of ${loadingProgress.total} scouts`
                    : `${scouts.length} scouts working toward Eagle`}
                  {filteredOutCount > 0 &&
                    ` · ${filteredOutCount} Eagle or 18+ hidden`}
                  {lastLoadedTime &&
                    ` · Updated ${lastLoadedTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
                </p>
              </div>
              <dl className="overview__stats">
                <div className="stat stat--red">
                  <dt>
                    <span className="status-dot" aria-hidden /> Urgent
                  </dt>
                  <dd className="figure">{statusCounts.red}</dd>
                </div>
                <div className="stat stat--yellow">
                  <dt>
                    <span className="status-dot" aria-hidden /> Watch
                  </dt>
                  <dd className="figure">{statusCounts.yellow}</dd>
                </div>
                <div className="stat stat--green">
                  <dt>
                    <span className="status-dot" aria-hidden /> On track
                  </dt>
                  <dd className="figure">{statusCounts.green}</dd>
                </div>
                <div className="stat">
                  <dt>Turning 18 within a year</dt>
                  <dd className="figure">{turning18Soon}</dd>
                </div>
              </dl>
            </section>

            <div className="listbar" role="toolbar" aria-label="Filter and sort scouts">
              <label className="field field--search">
                <Search size={16} strokeWidth={1.5} aria-hidden />
                <span className="sr-only">Filter scouts by name</span>
                <input
                  id="scout-search"
                  type="search"
                  placeholder="Filter by name"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </label>
              <label className="field field--select">
                <span className="field__label">Sort</span>
                <select
                  id="scout-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {selectedScouts.size > 0 && (
                <div className="listbar__selection">
                  <button
                    type="button"
                    className="button button--secondary"
                    aria-pressed={showComparison}
                    onClick={() => setShowComparison(!showComparison)}
                  >
                    {showComparison
                      ? "Show all scouts"
                      : `Compare ${selectedScouts.size} selected`}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Clear selection"
                    aria-label="Clear selection"
                    onClick={() => {
                      setShowComparison(false);
                      setSelectedScouts(new Set());
                    }}
                  >
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
              )}
              <div className="listbar__panels">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => togglePanel("counselors")}
                  aria-pressed={sidePanel === "counselors"}
                  title="Merit badge counselors in the unit and the badges they cover"
                >
                  <Users size={16} strokeWidth={1.5} />
                  Counselors
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => togglePanel("planner")}
                  aria-pressed={sidePanel === "planner"}
                  title="Suggest merit badges to host at troop meetings"
                >
                  <ListChecks size={16} strokeWidth={1.5} />
                  Badge planner
                </button>
              </div>
            </div>

            <div className={`workspace${sidePanel ? " workspace--planner" : ""}`}>
              {sidePanel === "planner" && (
                <MeritBadgePlanner
                  scouts={scouts}
                  counselors={counselorLoad?.state === "ready" ? counselorLoad.counselors : null}
                  unitLabel={unitLabel}
                  onClose={() => setSidePanel(null)}
                />
              )}
              {sidePanel === "counselors" && counselorLoad && (
                <CounselorPanel
                  load={counselorLoad}
                  scouts={scouts}
                  onClose={() => setSidePanel(null)}
                  onRefresh={() => loadCounselors(true)}
                />
              )}

              <section className="roster" aria-label="Scouts">
                <div className="roster__head" aria-hidden>
                  <span />
                  <span>
                    {comparing
                      ? `Comparing ${filteredScouts.length} scouts`
                      : `Showing ${filteredScouts.length} of ${scouts.length}`}
                  </span>
                  <span className="roster__head-trail">
                    Trail to Eagle, age 11 to 18
                  </span>
                  <span />
                </div>
                {filteredScouts.map((scout) => (
                  <ScoutRow
                    key={scout.userId}
                    userId={scout.userId}
                    firstName={scout.firstName}
                    lastName={scout.lastName}
                    scoutData={scout.data as ScoutAdvancement}
                    isSelected={selectedScouts.has(scout.userId)}
                    onSelectChange={(userId, selected) => {
                      const newSelected = new Set(selectedScouts);
                      if (selected) {
                        newSelected.add(userId);
                      } else {
                        newSelected.delete(userId);
                      }
                      setSelectedScouts(newSelected);
                    }}
                  />
                ))}
                {filteredScouts.length === 0 && scouts.length > 0 && (
                  <p className="roster__empty">
                    {showComparison
                      ? "No selected scouts to compare"
                      : `No scouts match “${searchFilter}”`}
                  </p>
                )}
                {scouts.length === 0 && loading && (
                  <p className="roster__empty">Loading roster</p>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        Troop Velocity Tracker © 2026 · Data from the Scoutbook API
      </footer>
    </div>
  );
}

export default App;
