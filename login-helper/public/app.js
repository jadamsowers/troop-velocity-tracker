const $ = (id) => document.getElementById(id);

const form = $("login-form");
const submitBtn = $("submit");
const errorEl = $("error");
const viewLogin = $("view-login");
const viewResult = $("view-result");
const tokenPreview = $("token-preview");
const unitBlock = $("unit-block");
const unitSelect = $("unit");
const noUnitsEl = $("no-units");
const copyBtn = $("copy-result");
const copyStatus = $("copy-status");
const resetBtn = $("reset");
const copySnippetBtn = $("copy-snippet");
const snippet = $("snippet");

let currentToken = null;
let currentUnits = [];

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function truncateToken(t) {
  if (!t) return "";
  if (t.length <= 30) return t;
  return `${t.slice(0, 16)}…${t.slice(-8)}`;
}

function showResult({ token, units }) {
  currentToken = token;
  currentUnits = units || [];
  tokenPreview.textContent = truncateToken(token);

  unitSelect.innerHTML = "";
  if (currentUnits.length === 0) {
    unitBlock.hidden = true;
    noUnitsEl.hidden = false;
  } else {
    unitBlock.hidden = false;
    noUnitsEl.hidden = true;
    for (const u of currentUnits) {
      const opt = document.createElement("option");
      opt.value = u.guid;
      opt.textContent = u.name || u.guid;
      unitSelect.appendChild(opt);
    }
  }

  viewLogin.hidden = true;
  viewResult.hidden = false;
  copyStatus.hidden = true;
}

function resetToLogin() {
  currentToken = null;
  currentUnits = [];
  viewResult.hidden = true;
  viewLogin.hidden = false;
  form.reset();
  clearError();
  copyStatus.hidden = true;
}

function buildPayload() {
  if (currentUnits.length === 0) {
    return JSON.stringify({ token: currentToken });
  }
  const guid = unitSelect.value;
  const unit = currentUnits.find((u) => u.guid === guid) || currentUnits[0];
  return JSON.stringify({
    token: currentToken,
    unitId: unit.guid,
    unitName: unit.name,
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const username = $("username").value.trim();
  const password = $("password").value;
  if (!username || !password) {
    showError("Please enter both email and password.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add("is-loading");

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.token) {
      showError(data.error || `Login failed (HTTP ${res.status}).`);
      return;
    }

    showResult(data);
  } catch {
    showError("Network error. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove("is-loading");
  }
});

copyBtn.addEventListener("click", async () => {
  const ok = await copyText(buildPayload());
  copyStatus.hidden = false;
  copyStatus.textContent = ok
    ? "Copied. Paste into Troop Velocity Tracker."
    : "Could not copy automatically — select the text above and copy manually.";
});

resetBtn.addEventListener("click", resetToLogin);

copySnippetBtn.addEventListener("click", async () => {
  await copyText(snippet.textContent.trim());
  copySnippetBtn.textContent = "Copied";
  setTimeout(() => {
    copySnippetBtn.textContent = "Copy snippet";
  }, 1500);
});
