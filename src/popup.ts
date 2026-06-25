declare namespace chrome {
  namespace i18n {
    function getMessage(messageName: string, substitutions?: string | string[]): string;
  }
}

const FALLBACKS: Record<string, string> = {
  strengthVeryWeak:   "Very Weak",
  strengthWeak:       "Weak",
  strengthFair:       "Fair",
  strengthStrong:     "Strong",
  strengthVeryStrong: "Very Strong",
  strengthInfo:       "~$1 bits of entropy",
  copied:             "Copied!",
  copyFailed:         "Copy failed — select manually",
  tabGenerator:       "Generator",
  tabHistory:         "History",
  historyEmpty:       "No history yet.",
};

function i18n(key: string, subs?: string[]): string {
  try {
    return chrome.i18n.getMessage(key, subs) || FALLBACKS[key] || "";
  } catch {
    let msg = FALLBACKS[key] ?? "";
    subs?.forEach((v, idx) => { msg = msg.replace(`$${idx + 1}`, v); });
    return msg;
  }
}

interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: string; // enabled symbol chars, empty = none
}

const CHARSETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
} as const;

// Maps printable ASCII (0x21–0x7E) to their full-width Unicode equivalents.
function toFullWidth(str: string): string {
  return Array.from(str).map(ch => {
    const code = ch.charCodeAt(0);
    return code >= 0x21 && code <= 0x7E ? String.fromCharCode(code + 0xFEE0) : ch;
  }).join("");
}

// Batches crypto.getRandomValues calls; rejection-samples to avoid modulo bias.
function makeRng(): (max: number) => number {
  const buf = new Uint8Array(128);
  let pos = buf.length;
  return function (max: number): number {
    const limit = 256 - (256 % max);
    for (;;) {
      if (pos >= buf.length) {
        crypto.getRandomValues(buf);
        pos = 0;
      }
      const v = buf[pos++];
      if (v < limit) return v % max;
    }
  };
}

function shuffled(chars: string[], rng: (max: number) => number): string[] {
  const arr = [...chars];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generatePassword(opts: PasswordOptions): string {
  const charsets: string[] = (Object.keys(CHARSETS) as Array<keyof typeof CHARSETS>)
    .filter((k) => opts[k])
    .map((k) => CHARSETS[k]);
  if (opts.symbols) charsets.push(opts.symbols);

  if (charsets.length === 0) return "";

  const rng = makeRng();
  const fullCharset = charsets.join("");
  const chars: string[] = [];

  // Guarantee at least one character from each enabled charset.
  for (const cs of charsets) {
    chars.push(cs[rng(cs.length)]);
  }

  // Fill remaining positions from the combined charset.
  while (chars.length < opts.length) {
    chars.push(fullCharset[rng(fullCharset.length)]);
  }

  return shuffled(chars, rng).join("");
}

// Entropy-based strength: bits = log2(charsetSize^length)
function calcStrength(opts: PasswordOptions): { bits: number; label: string; color: string } {
  const poolSize =
    (Object.keys(CHARSETS) as Array<keyof typeof CHARSETS>)
      .filter((k) => opts[k])
      .reduce((sum, k) => sum + CHARSETS[k].length, 0) + opts.symbols.length;
  if (poolSize === 0) return { bits: 0, label: "", color: "#3e3e54" };

  const bits = Math.log2(poolSize) * opts.length;

  if (bits < 40) return { bits, label: i18n("strengthVeryWeak"), color: "#ef4444" };
  if (bits < 60) return { bits, label: i18n("strengthWeak"), color: "#f97316" };
  if (bits < 80) return { bits, label: i18n("strengthFair"), color: "#eab308" };
  if (bits < 100) return { bits, label: i18n("strengthStrong"), color: "#22c55e" };
  return { bits, label: i18n("strengthVeryStrong"), color: "#34d399" };
}

function applyI18n(): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach(el => {
    const msg = i18n(el.dataset.i18n!);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach(el => {
    const msg = i18n(el.dataset.i18nTitle!);
    if (msg) el.title = msg;
  });
}

// ── DOM references ──────────────────────────────────────────────────────────

const passwordOutput = document.getElementById("password-output") as HTMLSpanElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const copyFeedback = document.getElementById("copy-feedback") as HTMLDivElement;
const generateBtn = document.getElementById("generate-btn") as HTMLButtonElement;
const lengthSlider = document.getElementById("length-slider") as HTMLInputElement;
const lengthNumber = document.getElementById("length-number") as HTMLInputElement;
const cbUppercase = document.getElementById("cb-uppercase") as HTMLInputElement;
const cbLowercase = document.getElementById("cb-lowercase") as HTMLInputElement;
const cbNumbers = document.getElementById("cb-numbers") as HTMLInputElement;
const symbolCheckboxes = Array.from(document.querySelectorAll<HTMLInputElement>("[data-symbol]"));
const cbSymbolsAll = document.getElementById("cb-symbols-all") as HTMLInputElement;
const cbFullWidth = document.getElementById("cb-fullwidth") as HTMLInputElement;
const strengthBar = document.getElementById("strength-bar") as HTMLDivElement;
const strengthLabel = document.getElementById("strength-label") as HTMLDivElement;
const optionsSection = document.querySelector(".options") as HTMLDivElement;
const optionsHeader = document.querySelector(".options-header") as HTMLDivElement;
const historyList = document.getElementById("history-list") as HTMLDivElement;
const historyEmpty = document.getElementById("history-empty") as HTMLDivElement;
const tabBtns = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab-btn"));
const generatorPanel = document.getElementById("tab-generator") as HTMLDivElement;
const historyPanel = document.getElementById("tab-history") as HTMLDivElement;

// ── State ───────────────────────────────────────────────────────────────────

let rawPassword = "";
let currentPassword = "";
const feedbackTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
let passwordHistory: string[] = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getOptions(): PasswordOptions {
  return {
    length: clampLength(parseInt(lengthSlider.value, 10)),
    uppercase: cbUppercase.checked,
    lowercase: cbLowercase.checked,
    numbers: cbNumbers.checked,
    symbols: symbolCheckboxes.filter((cb) => cb.checked).map((cb) => cb.dataset.symbol!).join(""),
  };
}

function clampLength(n: number): number {
  return Math.max(8, Math.min(64, isNaN(n) ? 16 : n));
}

function updateStrengthUI(opts: PasswordOptions): void {
  const { bits, label, color } = calcStrength(opts);
  const pct = Math.min(100, (bits / 120) * 100);
  strengthBar.style.width = `${pct}%`;
  strengthBar.style.backgroundColor = color;
  strengthLabel.textContent = label
    ? `${label} (${i18n("strengthInfo", [Math.round(bits).toString()])})`
    : "";
  strengthLabel.style.color = color;
}

function generate(): void {
  const opts = getOptions();
  if (currentPassword) {
    passwordHistory = [currentPassword, ...passwordHistory].slice(0, 5);
    saveHistory();
    renderHistory();
  }
  rawPassword = generatePassword(opts);
  currentPassword = cbFullWidth.checked ? toFullWidth(rawPassword) : rawPassword;
  passwordOutput.textContent = currentPassword || "—";
  copyBtn.disabled = currentPassword.length === 0;
  updateStrengthUI(opts);
  clearCopyFeedback();
}

function syncSymbolsAll(): void {
  const checkedCount = symbolCheckboxes.filter((cb) => cb.checked).length;
  cbSymbolsAll.checked = checkedCount === symbolCheckboxes.length;
  cbSymbolsAll.indeterminate = checkedCount > 0 && checkedCount < symbolCheckboxes.length;
}

function clearCopyFeedback(): void {
  const t = feedbackTimers.get(copyFeedback);
  if (t !== undefined) { clearTimeout(t); feedbackTimers.delete(copyFeedback); }
  copyFeedback.textContent = "";
  copyFeedback.style.color = "";
}

async function copyPassword(text: string, feedbackEl: HTMLElement): Promise<void> {
  const t = feedbackTimers.get(feedbackEl);
  if (t !== undefined) { clearTimeout(t); feedbackTimers.delete(feedbackEl); }
  feedbackEl.textContent = "";
  feedbackEl.style.color = "";
  try {
    await navigator.clipboard.writeText(text);
    feedbackEl.textContent = i18n("copied");
    feedbackTimers.set(feedbackEl, setTimeout(() => {
      feedbackEl.textContent = "";
      feedbackTimers.delete(feedbackEl);
    }, 2000));
  } catch {
    feedbackEl.textContent = i18n("copyFailed");
    feedbackEl.style.color = "#f87171";
  }
}

function saveHistory(): void {
  localStorage.setItem("passwordHistory", JSON.stringify(passwordHistory));
}

function loadHistory(): void {
  const raw = localStorage.getItem("passwordHistory");
  passwordHistory = raw ? JSON.parse(raw) : [];
}

function renderHistory(): void {
  historyList.innerHTML = "";
  if (passwordHistory.length === 0) {
    historyEmpty.style.display = "";
    return;
  }
  historyEmpty.style.display = "none";
  passwordHistory.forEach((pw) => {
    const entry = document.createElement("div");
    entry.className = "history-entry";
    const row = document.createElement("div");
    row.className = "history-item";
    const text = document.createElement("span");
    text.className = "history-text";
    text.textContent = pw;
    const btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.title = i18n("copyToClipboard");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const feedback = document.createElement("div");
    feedback.className = "copy-feedback";
    btn.addEventListener("click", () => copyPassword(pw, feedback));
    row.appendChild(text);
    row.appendChild(btn);
    entry.appendChild(row);
    entry.appendChild(feedback);
    historyList.appendChild(entry);
  });
}

function saveSettings(): void {
  const settings = {
    length: parseInt(lengthSlider.value, 10),
    uppercase: cbUppercase.checked,
    lowercase: cbLowercase.checked,
    numbers: cbNumbers.checked,
    symbols: symbolCheckboxes.filter(cb => cb.checked).map(cb => cb.dataset.symbol!),
    fullwidth: cbFullWidth.checked,
  };
  localStorage.setItem("settings", JSON.stringify(settings));
}

function loadSettings(): void {
  const raw = localStorage.getItem("settings");
  const s = raw ? JSON.parse(raw) : null;
  if (s) {
    const len = clampLength(s.length ?? 16);
    lengthSlider.value = String(len);
    lengthNumber.value = String(len);
    cbUppercase.checked = s.uppercase ?? true;
    cbLowercase.checked = s.lowercase ?? true;
    cbNumbers.checked = s.numbers ?? true;
    cbFullWidth.checked = s.fullwidth ?? false;
    if (Array.isArray(s.symbols)) {
      const enabled = new Set<string>(s.symbols);
      symbolCheckboxes.forEach(cb => { cb.checked = enabled.has(cb.dataset.symbol!); });
    }
    syncSymbolsAll();
  } else {
    if (cbSymbolsAll.checked) symbolCheckboxes.forEach(cb => { cb.checked = true; });
  }
  loadHistory();
  renderHistory();
  applyI18n();
  generate();
}

// ── Event listeners ──────────────────────────────────────────────────────────

generateBtn.addEventListener("click", generate);

tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    tabBtns.forEach(b => b.classList.toggle("active", b === btn));
    generatorPanel.style.display = btn.dataset.tab === "generator" ? "" : "none";
    historyPanel.style.display = btn.dataset.tab === "history" ? "" : "none";
  });
});

optionsHeader.addEventListener("click", () => {
  optionsSection.classList.toggle("expanded");
});

lengthSlider.addEventListener("input", () => {
  lengthNumber.value = lengthSlider.value;
  saveSettings();
});

lengthNumber.addEventListener("change", () => {
  const clamped = clampLength(parseInt(lengthNumber.value, 10));
  lengthNumber.value = String(clamped);
  lengthSlider.value = String(clamped);
  saveSettings();
});

[cbUppercase, cbLowercase, cbNumbers].forEach((cb) => {
  cb.addEventListener("change", () => {
    saveSettings();
  });
});

symbolCheckboxes.forEach((cb) => {
  cb.addEventListener("change", () => {
    syncSymbolsAll();
    saveSettings();
  });
});

cbSymbolsAll.addEventListener("change", () => {
  symbolCheckboxes.forEach((cb) => { cb.checked = cbSymbolsAll.checked; });
  saveSettings();
});

cbFullWidth.addEventListener("change", () => {
  currentPassword = cbFullWidth.checked ? toFullWidth(rawPassword) : rawPassword;
  passwordOutput.textContent = currentPassword || "—";
  copyBtn.disabled = currentPassword.length === 0;
  clearCopyFeedback();
  saveSettings();
});

copyBtn.addEventListener("click", async () => {
  if (!currentPassword) return;
  copyPassword(currentPassword, copyFeedback);
});

// ── Init ─────────────────────────────────────────────────────────────────────

loadSettings();
