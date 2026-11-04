import React, { useState, useEffect } from "react";
import { Loader2, AlertCircle, ShieldCheck, Info } from "lucide-react";
import { RankPatch } from "./RankPatch";
import { RANK_ORDER } from "../logic/advancement";
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

  const errorBox = error && (
    <div className="notice notice--error" role="alert">
      <AlertCircle size={16} strokeWidth={1.5} />
      {error}
    </div>
  );

  const form = (
    <div className="setup__panel">
      {notice && !signedIn && (
        <div className="notice" role="status">
          <Info size={16} strokeWidth={1.5} />
          {notice}
        </div>
      )}

      {!signedIn && (
        <>
          <div className="setup__heading">
            <h2>Sign in with my.scouting.org</h2>
            <p>The same account you use for Scoutbook and Internet Advancement</p>
          </div>
          <form className="setup__form" onSubmit={handleSignIn}>
            <label className="form-field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={signingIn}
              />
            </label>
            <label className="form-field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={signingIn}
              />
            </label>

            {errorBox}

            <button
              type="submit"
              disabled={signingIn || !username.trim() || !password}
              className="button button--primary button--large"
            >
              {signingIn ? (
                <>
                  <Loader2 className="spin" size={18} strokeWidth={1.5} />
                  Signing in
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <button
            type="button"
            className="link-button setup__advanced"
            onClick={() => setShowManualEntry(!showManualEntry)}
            aria-expanded={showManualEntry}
          >
            {showManualEntry ? "Hide token sign-in" : "Sign in with an existing token"}
          </button>

          {showManualEntry && (
            <div className="setup__manual">
              <p>
                If sign-in isn&apos;t working, paste a bearer token copied from an
                advancements.scouting.org session.
              </p>
              <div className="setup__manual-row">
                <input
                  type="password"
                  placeholder="Token"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={handleManualToken}
                  disabled={!manualToken.trim() || loadingUnits}
                  className="button button--secondary"
                >
                  Use token
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {signedIn && (
        <section className="setup__section">
          <div className="setup__heading">
            <h2>{isEditing ? "Settings" : "Choose your unit"}</h2>
            {isEditing && <p>Unit shown on the dashboard</p>}
          </div>

          {errorBox}

          {loadingUnits ? (
            <p className="setup__loading">
              <Loader2 className="spin" size={16} strokeWidth={1.5} />
              Finding your units
            </p>
          ) : units.length > 0 ? (
            <label className="form-field">
              <span>Unit</span>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Select a unit</option>
                {units.map((u) => (
                  <option key={u.guid} value={u.guid}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="form-field">
              <span>Unit GUID</span>
              <input
                type="text"
                placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              />
              <small>No units were found on your account, so enter the unit GUID</small>
            </label>
          )}

          <div className="setup__actions">
            {isEditing && onCancel && (
              <button onClick={onCancel} className="button button--secondary button--large">
                Cancel
              </button>
            )}
            <button
              onClick={() => token && save(token, unitId, units)}
              disabled={!token || !unitId}
              className="button button--primary button--large"
            >
              {isEditing ? "Save" : "Open dashboard"}
            </button>
          </div>
        </section>
      )}

      {isEditing && onClearCache && (
        <section className="setup__section setup__section--divided">
          <div className="setup__heading">
            <h3>Cached data</h3>
            <p>Roster data is cached for an hour. Refresh it if something looks stale.</p>
          </div>
          <button onClick={onClearCache} className="button button--secondary">
            Clear cache and reload
          </button>
        </section>
      )}
    </div>
  );

  if (isEditing) {
    return <div className="setup setup--settings">{form}</div>;
  }

  return (
    <div className="setup">
      <div className="setup__intro">
        <h1>Every scout&apos;s trail to Eagle, on one screen</h1>
        <p className="setup__lede">
          See who is on pace to finish before 18, who has stalled, and which
          merit badges your troop should host next.
        </p>
        <div className="patch-row" aria-hidden>
          {RANK_ORDER.map((rank) => (
            <div key={rank} className="patch-row__item">
              <RankPatch rank={rank} size={36} />
              <span>{rank}</span>
            </div>
          ))}
        </div>
        <div className="privacy">
          <h3>
            <ShieldCheck size={16} strokeWidth={1.5} />
            How your sign-in is handled
          </h3>
          <ul>
            <li>
              Your my.scouting.org username and password are used for one
              thing: signing in to scouting.org for you, so the app can read your
              unit&apos;s advancement data.
            </li>
            <li>
              They pass through this app&apos;s server because scouting.org
              doesn&apos;t let browser apps sign in directly. They are never
              logged, saved or shared.
            </li>
            <li>
              scouting.org returns a session token, stored only in this
              browser&apos;s local storage. Your password is never stored.
            </li>
            <li>
              The token expires on its own. Sign out at any time to remove it
              from this browser.
            </li>
          </ul>
        </div>
      </div>
      {form}
    </div>
  );
};
