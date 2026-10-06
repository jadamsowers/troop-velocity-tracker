import React, { useState, useEffect } from "react";
import { Loader2, LogIn, AlertCircle, ShieldCheck, Info } from "lucide-react";
import { auth } from "../api/auth";
import type { LoginUnit } from "../api/auth";
import { scoutingClient } from "../api/scoutingClient";

interface Props {
  onComplete: () => void;
  onCancel?: () => void;
  isEditing?: boolean;
  onClearCache?: () => void;
  /** Shown above the form, e.g. when a stored session has expired. */
  notice?: string;
}

interface OrgRef {
  organizationGuid?: string;
  orgGuid?: string;
  unitType?: string;
  unitNumber?: string;
  number?: string;
}

const inputStyle: React.CSSProperties = {
  padding: "0.85rem",
  borderRadius: "0.75rem",
  background: "var(--input-bg)",
  border: "1px solid var(--input-border)",
  color: "var(--text-main)",
  fontSize: "0.95rem",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  fontSize: "0.85rem",
  fontWeight: 500,
  width: "100%",
};

export const Setup: React.FC<Props> = ({
  onComplete,
  onCancel,
  isEditing = false,
  onClearCache,
  notice,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  // Token from this sign-in (or the still-valid stored one when editing).
  // Not written to localStorage until the user picks a unit.
  const [token, setToken] = useState<string | null>(
    auth.hasValidToken() ? auth.getToken() : null,
  );
  const [units, setUnits] = useState<LoginUnit[]>([]);
  const [unitId, setUnitId] = useState(auth.getUnitId() || "");
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [error, setError] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualToken, setManualToken] = useState("");

  useEffect(() => {
    // Already signed in (Settings, or a token saved without a unit): just
    // look up the units for the unit picker.
    if (token) loadUnitsForToken(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (tokenToSave: string, guid: string, available: LoginUnit[]) => {
    auth.setToken(tokenToSave);
    auth.setUnitId(guid);
    const selected = available.find((u) => u.guid === guid);
    const label =
      selected?.name?.trim() ||
      auth.getUnitLabel() ||
      (guid.length > 20 ? `Unit ${guid.slice(0, 8)}...` : guid) ||
      "Troop";
    auth.setUnitLabel(label);
    onComplete();
  };

  /** After sign-in: go straight in when the unit is unambiguous, else ask. */
  const handleNewToken = (newToken: string, found: LoginUnit[]) => {
    setToken(newToken);
    setUnits(found);
    const remembered = found.find((u) => u.guid === auth.getUnitId());
    const pick = remembered ?? (found.length === 1 ? found[0] : undefined);
    if (pick && !isEditing) {
      save(newToken, pick.guid, found);
      return;
    }
    if (pick) setUnitId(pick.guid);
  };

  const loadUnitsForToken = async (tokenToCheck: string) => {
    const ids = auth.getUserIds(tokenToCheck);
    if (!ids) {
      setError("That doesn't look like a valid Scouting token.");
      return null;
    }
    setLoadingUnits(true);
    setError("");
    scoutingClient.setSetupMode(true);
    // scoutingClient reads the token from storage; stash it temporarily.
    const previousToken = auth.getToken();
    auth.setToken(tokenToCheck);
    try {
      const [profile, myScouts] = await Promise.all([
        scoutingClient.getPersonProfile(ids.userId),
        scoutingClient.getMyScouts(ids.userId),
      ]);
      const found: LoginUnit[] = [];
      const addUnit = (org: OrgRef) => {
        const guid = org.organizationGuid || org.orgGuid;
        if (guid && !found.some((u) => u.guid === guid)) {
          found.push({
            guid,
            name: `${org.unitType || "Unit"} ${org.unitNumber || org.number || ""}`.trim(),
          });
        }
      };
      (profile?.organizationPositions || []).forEach(addUnit);
      if (Array.isArray(myScouts)) myScouts.forEach(addUnit);
      setUnits(found);
      if (!unitId && found.length === 1) setUnitId(found[0].guid);
      return found;
    } catch (e) {
      console.error("Failed to fetch units:", e);
      setError("Couldn't load your units with that token. It may have expired — please sign in again.");
      return null;
    } finally {
      if (previousToken) auth.setToken(previousToken);
      else auth.expireSession();
      scoutingClient.setSetupMode(false);
      setLoadingUnits(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSigningIn(true);
    setError("");
    try {
      const result = await auth.loginWithCredentials(username.trim(), password);
      handleNewToken(result.token, result.units);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      // Don't keep the password around in memory longer than needed.
      setPassword("");
      setSigningIn(false);
    }
  };

  const handleManualToken = async () => {
    const value = manualToken.trim();
    if (!value) return;
    const found = await loadUnitsForToken(value);
    if (found) {
      setManualToken("");
      handleNewToken(value, found);
    }
  };

  const signedIn = !!token;

  return (
    <div
      className="setup setup-form"
      style={{ maxWidth: "500px", margin: "0 auto" }}
    >
      <div className="setup__intro" style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h2 className="setup__title" style={{ fontSize: "1.5rem", fontWeight: "600" }}>
          {isEditing ? "Settings" : "Sign in with my.scouting.org"}
        </h2>
        <p className="setup__subtitle" style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
          Use the same account you use for Scoutbook and Internet Advancement
        </p>
      </div>

      <div className="setup__body" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
        {notice && !signedIn && (
          <div
            className="setup-notice"
            role="status"
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "0.75rem",
              background: "var(--accent-soft-bg)",
              border: "1px solid var(--accent-soft-border)",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Info size={16} color="var(--accent)" />
            {notice}
          </div>
        )}

        {!signedIn && (
          <section
            className="setup-section setup-section--login"
            style={{
              background: "var(--setup-section-surface)",
              padding: "1.5rem",
              borderRadius: "1rem",
              border: "1px solid var(--card-border)",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
            }}
          >
            <form
              className="setup-login-form"
              onSubmit={handleSignIn}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <label style={labelStyle}>
                Username
                <input
                  className="setup-login-username"
                  type="text"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={signingIn}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Password
                <input
                  className="setup-login-password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={signingIn}
                  style={inputStyle}
                />
              </label>

              {error && (
                <div
                  className="setup-error"
                  role="alert"
                  style={{
                    padding: "0.75rem",
                    borderRadius: "0.5rem",
                    background: "var(--danger-soft-bg)",
                    border: "1px solid var(--danger-soft-border)",
                    color: "var(--danger-soft-text)",
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={signingIn || !username.trim() || !password}
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
                {signingIn ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Signing in…
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    Sign in
                  </>
                )}
              </button>
            </form>

            <div
              className="setup-privacy"
              style={{
                padding: "1rem",
                borderRadius: "0.75rem",
                background: "var(--surface-inset)",
                border: "1px solid var(--card-border)",
                fontSize: "0.8rem",
                lineHeight: "1.55",
                color: "var(--text-dim)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontWeight: 600,
                  color: "var(--text-main)",
                  marginBottom: "0.5rem",
                }}
              >
                <ShieldCheck size={16} color="var(--accent)" />
                How your sign-in is handled
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <li>
                  This app uses your my.scouting.org username and password for
                  one thing: signing in to scouting.org for you. It then reads
                  your unit&apos;s advancement data.
                </li>
                <li>
                  Your credentials go from this page to scouting.org through this
                  app&apos;s server, because scouting.org doesn&apos;t let browser apps
                  sign in directly. They are{" "}
                  <strong>never logged, saved, or shared</strong>.
                </li>
                <li>
                  scouting.org sends back a session token. That token is stored{" "}
                  <strong>only in this browser&apos;s local storage</strong>. Your
                  password is never stored anywhere.
                </li>
                <li>
                  The token expires on its own, and then you&apos;ll be asked to sign
                  in again. Sign out at any time to remove it from this browser.
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setShowManualEntry(!showManualEntry)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                fontSize: "0.8rem",
                textDecoration: "underline",
                padding: "0.25rem",
                alignSelf: "center",
              }}
            >
              {showManualEntry ? "Hide advanced options" : "Advanced: use an existing token"}
            </button>

            {showManualEntry && (
              <div
                className="setup-manual-entry"
                style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
              >
                <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", lineHeight: "1.5", margin: 0 }}>
                  If sign-in isn&apos;t working, you can paste a bearer token
                  copied from an advancements.scouting.org session.
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className="setup-token-input"
                    type="password"
                    placeholder="Paste token…"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    autoComplete="off"
                    style={{ ...inputStyle, fontSize: "0.85rem" }}
                  />
                  <button
                    type="button"
                    onClick={handleManualToken}
                    disabled={!manualToken.trim() || loadingUnits}
                    className="button-secondary"
                    style={{
                      padding: "0 1rem",
                      background: "var(--input-bg)",
                      border: "1px solid var(--card-border)",
                      color: "var(--text-main)",
                      borderRadius: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    Use
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {signedIn && (
          <section
            className="setup-section setup-section--unit"
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            <h3 className="setup-section__title" style={{ fontSize: "1.1rem", fontWeight: "500", margin: 0 }}>
              Choose your unit
            </h3>

            {error && (
              <div
                className="setup-error"
                role="alert"
                style={{
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  background: "var(--danger-soft-bg)",
                  border: "1px solid var(--danger-soft-border)",
                  color: "var(--danger-soft-text)",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

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
            ) : units.length > 0 ? (
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
                  {units.map((u) => (
                    <option key={u.guid} value={u.guid}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div
                className="setup-unit-manual"
                style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
              >
                <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", textAlign: "center" }}>
                  No units were found on your account. You can enter your Unit
                  GUID manually:
                </p>
                <input
                  className="setup-unit-guid-input"
                  type="text"
                  placeholder="Paste Unit GUID (e.g., XXXXXXXX-XXXX-XXXX-XXXX-...)"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  style={{ ...inputStyle, fontSize: "0.8rem" }}
                />
              </div>
            )}

            <div className="setup-section__actions" style={{ display: "flex", gap: "1rem" }}>
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
                onClick={() => token && save(token, unitId, units)}
                disabled={!token || !unitId}
                className="button-primary"
                style={{ flex: 1, padding: "1rem", fontSize: "1rem", fontWeight: "600" }}
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
              🚀 Clear Cached Data & Refresh
            </button>
          </section>
        )}
      </div>
    </div>
  );
};
