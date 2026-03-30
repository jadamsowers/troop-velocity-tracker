import React, { useState, useEffect } from "react";
import { Loader2, LogIn, AlertCircle, KeyRound } from "lucide-react";
import { auth, loginWithCredentials } from "../api/auth";
import { scoutingClient } from "../api/scoutingClient";

interface Props {
  onComplete: () => void;
  onCancel?: () => void;
  isEditing?: boolean;
  onClearCache?: () => void;
}

interface Unit {
  guid: string;
  name: string;
  type: string;
  number: string;
}

export const Setup: React.FC<Props> = ({
  onComplete,
  onCancel,
  isEditing = false,
  onClearCache,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(auth.getToken() || "");
  const [unitId, setUnitId] = useState(auth.getUnitId() || "");
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [error, setError] = useState<string>("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [pastedUnitLabel, setPastedUnitLabel] = useState("");

  useEffect(() => {
    if (token && token.split(".").length === 3) {
      fetchUnits();
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoginLoading(true);
    setError("");
    try {
      const result = await loginWithCredentials(username, password);
      setToken(result.token);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleTokenChange = (val: string) => {
    if (val.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(val);
        if (parsed.token) {
          setToken(parsed.token);
          if (parsed.unitId) setUnitId(parsed.unitId);
          if (parsed.unitName || parsed.unitLabel)
            setPastedUnitLabel(parsed.unitName || parsed.unitLabel);
          setError("");
          return;
        }
      } catch { /* not JSON */ }
    }
    setToken(val);
    setError("");
  };

  const fetchUnits = async () => {
    const previousToken = auth.getToken();
    auth.setToken(token);
    scoutingClient.setSetupMode(true);

    const ids = auth.getUserIds();
    if (!ids) {
      scoutingClient.setSetupMode(false);
      if (!previousToken) auth.logout();
      return;
    }

    setLoadingUnits(true);
    setError("");
    try {
      const profile = await scoutingClient.getPersonProfile(ids.userId);
      const myScouts = await scoutingClient.getMyScouts(ids.userId);

      const discoveredUnits: Unit[] = [];
      const seenGuids = new Set<string>();

      const addUnit = (org: any) => {
        const guid = org.organizationGuid || org.orgGuid;
        if (guid && !seenGuids.has(guid)) {
          discoveredUnits.push({
            guid,
            name: `${org.unitType || "Unit"} ${org.unitNumber || org.number || ""}`.trim(),
            type: org.unitType || "Unit",
            number: org.unitNumber || org.number || "",
          });
          seenGuids.add(guid);
        }
      };

      if (profile.organizationPositions)
        profile.organizationPositions.forEach(addUnit);
      if (myScouts && Array.isArray(myScouts)) myScouts.forEach(addUnit);

      setUnits(discoveredUnits);
      if (discoveredUnits.length === 1 && !unitId) {
        setUnitId(discoveredUnits[0].guid);
      }
    } catch (e) {
      console.error("Failed to fetch units:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(
        `Unable to fetch units: ${errorMessage}. Please check your token is valid.`,
      );
      if (previousToken) {
        auth.setToken(previousToken);
      } else {
        auth.logout();
      }
    } finally {
      scoutingClient.setSetupMode(false);
      setLoadingUnits(false);
    }
  };

  const handleSave = () => {
    if (token && unitId) {
      auth.setToken(token);
      auth.setUnitId(unitId);
      const selected = units.find((u) => u.guid === unitId);
      const label =
        selected?.name?.trim() ||
        pastedUnitLabel ||
        (selected?.number ? `Troop ${selected.number}` : "") ||
        (unitId.length > 20 ? `Unit ${unitId.slice(0, 8)}...` : unitId) ||
        "Troop";
      auth.setUnitLabel(label);
      onComplete();
    }
  };

  return (
    <div
      className="setup setup-form"
      style={{ maxWidth: "500px", margin: "0 auto" }}
    >
      <div
        className="setup__header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <div className="setup__intro" style={{ textAlign: "center", flex: 1 }}>
          <h2 className="setup__title" style={{ fontSize: "1.5rem", fontWeight: "600" }}>
            Connect Scoutbook
          </h2>
          <p className="setup__subtitle" style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
            Sign in with your Scouting America account
          </p>
        </div>
      </div>

      <div className="setup__body" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
        <section
          className="setup-section setup-section--login"
          style={{
            background: "var(--setup-section-surface)",
            padding: "1.5rem",
            borderRadius: "1rem",
            border: "1px solid var(--card-border)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.25rem",
          }}
        >
          <div
            className="setup-section__heading"
            style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
          >
            <LogIn size={20} color="var(--accent)" />
            <h3 className="setup-section__title" style={{ fontSize: "1.1rem", fontWeight: "500" }}>
              Sign in with Scouting America
            </h3>
          </div>
          <p
            style={{
              fontSize: "0.9rem",
              color: "var(--text-dim)",
              textAlign: "center",
              lineHeight: "1.6",
              maxWidth: "380px",
            }}
          >
            Use the same credentials you use for Scoutbook or Internet Advancement.
          </p>

          <form
            onSubmit={handleLogin}
            style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              style={{
                padding: "0.85rem",
                borderRadius: "0.75rem",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--text-main)",
                fontSize: "0.9rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                padding: "0.85rem",
                borderRadius: "0.75rem",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--text-main)",
                fontSize: "0.9rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              disabled={loginLoading || !username || !password}
              className="button-primary"
              style={{
                padding: "0.85rem 2rem",
                fontSize: "1rem",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                width: "100%",
                justifyContent: "center",
              }}
            >
              {loginLoading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>

          {error && (
            <div
              className="setup-error"
              style={{
                padding: "0.75rem",
                borderRadius: "0.5rem",
                background: "var(--danger-soft-bg)",
                border: "1px solid var(--danger-soft-border)",
                color: "var(--danger-soft-text)",
                fontSize: "0.85rem",
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            onClick={() => setShowManualEntry(!showManualEntry)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-dim)",
              cursor: "pointer",
              fontSize: "0.8rem",
              textDecoration: "underline",
              padding: "0.25rem",
            }}
          >
            {showManualEntry ? "Hide manual entry" : "Paste token manually instead"}
          </button>

          {showManualEntry && (
            <div
              className="setup-manual-entry"
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                borderTop: "1px solid var(--card-border)",
                paddingTop: "1.25rem",
              }}
            >
              <div
                className="setup-section__heading"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "0.5rem",
                }}
              >
                <KeyRound size={16} color="var(--text-dim)" />
                <h4 style={{ fontSize: "0.95rem", fontWeight: "500", margin: 0 }}>
                  Manual Token Entry
                </h4>
              </div>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-dim)",
                  lineHeight: "1.5",
                }}
              >
                Paste a JWT token or JSON login package from browser dev tools:
              </p>
              <input
                className="setup-token-input"
                type="password"
                placeholder="Paste token or JSON login package..."
                value={token}
                onChange={(e) => handleTokenChange(e.target.value)}
                style={{
                  padding: "0.85rem",
                  borderRadius: "0.75rem",
                  background: "var(--input-bg)",
                  border: "1px solid var(--input-border)",
                  color: "var(--text-main)",
                  fontSize: "0.9rem",
                  width: "100%",
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>
          )}
        </section>

        {(units.length > 0 || loadingUnits || (token && token.length > 50)) && (
          <section
            className="setup-section setup-section--unit"
            style={{
              borderTop: "1px solid var(--card-border)",
              paddingTop: "2.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            <div
              className="setup-section__heading"
              style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
            >
              <div
                className="setup-step-badge"
                style={{
                  background: "var(--accent)",
                  color: "white",
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                  fontSize: "14px",
                }}
              >
                2
              </div>
              <h3 className="setup-section__title" style={{ fontSize: "1.1rem", fontWeight: "500" }}>
                Confirm Unit
              </h3>
            </div>

            {loadingUnits ? (
              <div
                className="setup-unit-loading"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "var(--accent)",
                  fontSize: "0.85rem",
                  padding: "1rem",
                }}
              >
                <Loader2 className="animate-spin" size={16} /> Fetching your
                Scouting units...
              </div>
            ) : (
              <>
                {units.length > 0 ? (
                  <div
                    className="setup-unit-select-wrap"
                    style={{
                      padding: "0.75rem",
                      background: "var(--accent-soft-bg)",
                      borderRadius: "0.75rem",
                      border: "1px solid var(--accent-soft-border)",
                    }}
                  >
                    <select
                      className="setup-unit-select"
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        borderRadius: "0.5rem",
                        background: "var(--surface-inset)",
                        border: "1px solid var(--card-border)",
                        color: "var(--text-main)",
                        fontSize: "0.9rem",
                      }}
                    >
                      <option value="">Select unit...</option>
                      {units.map((u: Unit) => (
                        <option key={u.guid} value={u.guid}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div
                    className="setup-unit-manual"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-dim)",
                        textAlign: "center",
                      }}
                    >
                      No units found automatically. You can enter your Unit GUID
                      manually:
                    </p>
                    <input
                      className="setup-unit-guid-input"
                      type="text"
                      placeholder="Paste Unit GUID (e.g., XXXXXXXX-XXXX-XXXX-XXXX-...)"
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        borderRadius: "0.5rem",
                        background: "var(--surface-inset)",
                        border: "1px solid var(--card-border)",
                        color: "var(--text-main)",
                        fontSize: "0.8rem",
                      }}
                    />
                  </div>
                )}
              </>
            )}

            <div className="setup-section__actions" style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
              {isEditing && onCancel && (
                <button
                  onClick={onCancel}
                  className="button-secondary"
                  style={{
                    flex: 1,
                    padding: "1rem",
                    fontSize: "1rem",
                    fontWeight: "600",
                    background: "var(--input-bg)",
                    border: "1px solid var(--card-border)",
                    color: "var(--text-main)",
                    borderRadius: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!token || !unitId}
                className="button-primary"
                style={{
                  flex: 1,
                  padding: "1rem",
                  fontSize: "1rem",
                  fontWeight: "600",
                }}
              >
                {isEditing ? "Save Settings" : "Launch Troop Velocity Tracker"}
              </button>
            </div>
          </section>
        )}

        {isEditing && onClearCache && (
          <section
            className="setup-section setup-section--cache"
            style={{
              borderTop: "1px solid var(--card-border)",
              paddingTop: "2rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", textAlign: "center" }}>
              Having trouble with stale data?
            </p>
            <button
              onClick={onClearCache}
              style={{
                background: "var(--danger-soft-bg)",
                color: "var(--red)",
                border: "1px solid var(--red)",
                padding: "0.75rem 1.5rem",
                borderRadius: "0.75rem",
                fontSize: "0.9rem",
                cursor: "pointer",
                fontWeight: 600,
                width: "100%",
                transition: "background 0.2s, transform 0.1s",
              }}
              title="Clear cached scout data and refresh"
            >
              Clear Cached Data & Refresh
            </button>
          </section>
        )}
      </div>
    </div>
  );
};
