import { useState, useEffect } from "react";
import "./index.css";
import "./App.css";
import { ScoutRow } from "./components/ScoutRow";
import { Setup } from "./components/Setup";
import type { ScoutAdvancement } from "./logic/advancement";
import { getStatus, RANK_ORDER } from "./logic/advancement";
import { auth } from "./api/auth";
import { scoutingClient } from "./api/scoutingClient";
import { cacheManager } from "./api/cache";
import { parseISO, differenceInMonths } from "date-fns";
import { Rocket, Users, Cog, Power, ArrowUpDown } from "lucide-react";
import { ThemeToggle } from "./theme/ThemeToggle";

function App() {
  const [scouts, setScouts] = useState<any[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(
    auth.isAuthenticated(),
  );
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
  const [filteredOutCount, setFilteredOutCount] = useState(0);

  type SortOption = { value: string; label: string };
  const SORT_OPTIONS: SortOption[] = [
    { value: "risk", label: "🚨 Most At-Risk First" },
    {
      value: "stagnant_desc",
      label: "⏱️ Most Stagnant (Time Since Last Rank)",
    },
    { value: "last_name", label: "👤 Last Name, First Name" },
    { value: "first_name", label: "👤 First Name, Last Name" },
    { value: "age_desc", label: "⏳ Oldest First (Age ↓)" },
    { value: "age_asc", label: "⏳ Youngest First (Age ↑)" },
    { value: "rank_desc", label: "⭐ Highest Rank First" },
    { value: "rank_asc", label: "⭐ Lowest Rank First" },
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
      const roster = await scoutingClient.getUnitRoster(unitId);
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
            const [ranksRes, mbRes] = await Promise.allSettled([
              scoutingClient.getRanks(userId),
              scoutingClient.getMeritBadges(userId),
            ]);

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

  const handleLogout = () => {
    auth.logout();
    setIsAuthenticated(false);
    setScouts([]);
  };

  const handleClearCache = () => {
    cacheManager.clear();
    setScouts([]);
    const unitId = auth.getUnitId();
    if (unitId) {
      loadData(unitId);
    }
  };

  return (
    <div className="app-shell app-container">
      <header className="app-header">
        <div className="app-header__inner">
          <div
            className="app-header__brand"
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <Rocket size={24} />
            <h1>Troop Velocity Tracker</h1>
          </div>
        </div>
      </header>

      <main className="app-main">
        {!isAuthenticated ? (
          <div className="app-view app-view--setup">
            <Setup onComplete={() => setIsAuthenticated(true)} />
          </div>
        ) : showSettings ? (
          <div className="app-view app-view--setup">
            <Setup
              onComplete={() => {
                setIsAuthenticated(true);
                setShowSettings(false);
              }}
              onCancel={() => setShowSettings(false)}
              isEditing={true}
              onClearCache={handleClearCache}
            />
          </div>
        ) : (
          <div className="dashboard">
            <nav
              className="dashboard-toolbar filter-header"
              aria-label="Dashboard filters and actions"
            >
              <div
                className="dashboard-toolbar__inner"
                style={{
                  maxWidth: "1200px",
                  margin: "0 auto",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
              <div
                className="dashboard-toolbar__lead"
                style={{ display: "flex", alignItems: "center", gap: "1rem" }}
              >
                <Users size={24} />
                <div className="dashboard-toolbar__titles">
                  <h2
                    className="dashboard-toolbar__title"
                    style={{ fontSize: "1.5rem", margin: 0 }}
                  >
                    {auth.getUnitLabel()?.trim() || "Troop"}{" "}
                    {loading &&
                      `(Loading ${loadingProgress.current}/${loadingProgress.total}…)`}
                  </h2>
                  <p
                    className="dashboard-toolbar__meta"
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-dim)",
                      margin: "0.25rem 0 0 0",
                    }}
                  >
                    Displaying {filteredScouts.length}/{scouts.length} scouts
                    {filteredOutCount > 0 && ` (${filteredOutCount} filtered)`}
                    {lastLoadedTime &&
                      ` • Last updated ${lastLoadedTime.toLocaleTimeString()}`}
                  </p>
                </div>
              </div>

              <div
                className="dashboard-toolbar__actions"
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <label htmlFor="scout-search" className="sr-only">
                  Filter scouts by name
                </label>
                <input
                  id="scout-search"
                  className="dashboard-toolbar__search"
                  type="text"
                  placeholder="Filter by name..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--input-border)",
                    color: "var(--text-main)",
                    borderRadius: "0.5rem",
                    padding: "0.6rem 0.75rem",
                    fontSize: "0.95rem",
                  }}
                />
                <div
                  className="dashboard-toolbar__sort"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <ArrowUpDown size={14} />
                  <label htmlFor="scout-sort" className="sr-only">
                    Sort scouts list
                  </label>
                  <select
                    id="scout-sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{
                      background: "var(--input-bg)",
                      border: "1px solid var(--input-border)",
                      color: "var(--text-main)",
                      borderRadius: "0.5rem",
                      padding: "0.6rem 0.75rem",
                      fontSize: "0.95rem",
                      cursor: "pointer",
                    }}
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedScouts.size > 0 && (
                  <>
                    <button
                      onClick={() => setShowComparison(!showComparison)}
                      style={{
                        background: showComparison
                          ? "var(--accent-ghost-active)"
                          : "var(--accent-ghost)",
                        color: "var(--accent)",
                        border: `1px solid var(--accent)`,
                        padding: "0.5rem 0.75rem",
                        borderRadius: "0.5rem",
                        fontSize: "0.9rem",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                      title={`Compare ${selectedScouts.size} selected scout${selectedScouts.size !== 1 ? "s" : ""}`}
                    >
                      {showComparison
                        ? `Viewing ${selectedScouts.size}`
                        : `Compare (${selectedScouts.size})`}
                    </button>
                    {showComparison && (
                      <button
                        onClick={() => {
                          setShowComparison(false);
                          setSelectedScouts(new Set());
                        }}
                        style={{
                          background: "var(--danger-soft-bg)",
                          color: "var(--red)",
                          border: "1px solid var(--red)",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "0.5rem",
                          fontSize: "0.9rem",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                        title="Clear comparison"
                      >
                        Clear
                      </button>
                    )}
                  </>
                )}
                <ThemeToggle />
                <button
                  style={{
                    background: "transparent",
                    color: "var(--text-main)",
                    border: "1px solid var(--card-border)",
                    width: "44px",
                    height: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "0.5rem",
                    cursor: "pointer",
                  }}
                  onClick={() => setShowSettings(!showSettings)}
                  aria-label="Settings"
                >
                  <Cog 
                    size={20} 
                    strokeWidth={2.5} 
                    color="currentColor"
                    style={{ minWidth: '20px', minHeight: '20px' }}
                  />
                </button>
                <button
                  style={{
                    background: "var(--danger-soft-bg)",
                    color: "var(--red)",
                    border: "1px solid var(--red)",
                    width: "44px",
                    height: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "0.5rem",
                    cursor: "pointer",
                  }}
                  onClick={handleLogout}
                  aria-label="Logout"
                >
                  <Power 
                    size={20} 
                    strokeWidth={2.5} 
                    color="currentColor"
                    style={{ minWidth: '20px', minHeight: '20px' }}
                  />
                </button>
              </div>
            </div>
          </nav>

            {showComparison ? (
              <div
                className="comparison-panel"
                style={{
                  background: "var(--accent-ghost)",
                  padding: "1.5rem",
                  borderRadius: "1rem",
                  border: "1px solid var(--card-border)",
                  marginBottom: "2rem",
                }}
              >
                <div
                  className="comparison-panel__header"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1.5rem",
                  }}
                >
                  <h3
                    className="comparison-panel__title"
                    style={{ fontSize: "1.2rem", fontWeight: 600 }}
                  >
                    Comparing {selectedScouts.size} Scout
                    {selectedScouts.size !== 1 ? "s" : ""}
                  </h3>
                  <button
                    onClick={() => {
                      setShowComparison(false);
                      setSelectedScouts(new Set());
                    }}
                    style={{
                      background: "var(--input-bg)",
                      border: "1px solid var(--card-border)",
                      padding: "0.5rem 1rem",
                      borderRadius: "0.5rem",
                      cursor: "pointer",
                      color: "var(--text-main)",
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : null}

            <div className="dashboard-content content-with-offset">
              <div className="scout-list">
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
                  <div
                    className="scout-list-empty"
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--text-dim)",
                    }}
                  >
                    {showComparison
                      ? "No selected scouts to compare"
                      : `No scouts match "${searchFilter}"`}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <div
          className="app-footer__inner"
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--footer-text)",
            fontSize: "0.8rem",
          }}
        >
          Troop Velocity Tracker &copy; 2026 • Powered by Scoutbook API
        </div>
      </footer>
    </div>
  );
}

export default App;
