interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

const CHARSETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
} as const;

// Rejection-sampling picks a random index in [0, max) without modulo bias.
function randomIndex(max: number): number {
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

function shuffled(chars: string[]): string[] {
  const arr = [...chars];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generatePassword(opts: PasswordOptions): string {
  const selected = (Object.keys(CHARSETS) as Array<keyof typeof CHARSETS>).filter(
    (k) => opts[k]
  );

  if (selected.length === 0) return "";

  const fullCharset = selected.map((k) => CHARSETS[k]).join("");
  const chars: string[] = [];

  // Guarantee at least one character from each enabled charset.
  for (const key of selected) {
    const cs = CHARSETS[key];
    chars.push(cs[randomIndex(cs.length)]);
  }

  // Fill remaining positions from the combined charset.
  while (chars.length < opts.length) {
    chars.push(fullCharset[randomIndex(fullCharset.length)]);
  }

  return shuffled(chars).join("");
}

// Entropy-based strength: bits = log2(charsetSize^length)
function calcStrength(opts: PasswordOptions): { bits: number; label: string; color: string } {
  const selected = (Object.keys(CHARSETS) as Array<keyof typeof CHARSETS>).filter(
    (k) => opts[k]
  );
  const poolSize = selected.reduce((sum, k) => sum + CHARSETS[k].length, 0);
  if (poolSize === 0) return { bits: 0, label: "", color: "#3e3e54" };

  const bits = Math.log2(poolSize) * opts.length;

  if (bits < 40) return { bits, label: "Very Weak", color: "#ef4444" };
  if (bits < 60) return { bits, label: "Weak", color: "#f97316" };
  if (bits < 80) return { bits, label: "Fair", color: "#eab308" };
  if (bits < 100) return { bits, label: "Strong", color: "#22c55e" };
  return { bits, label: "Very Strong", color: "#34d399" };
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
const cbSymbols = document.getElementById("cb-symbols") as HTMLInputElement;
const strengthBar = document.getElementById("strength-bar") as HTMLDivElement;
const strengthLabel = document.getElementById("strength-label") as HTMLDivElement;

// ── State ───────────────────────────────────────────────────────────────────

let currentPassword = "";
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getOptions(): PasswordOptions {
  return {
    length: clampLength(parseInt(lengthSlider.value, 10)),
    uppercase: cbUppercase.checked,
    lowercase: cbLowercase.checked,
    numbers: cbNumbers.checked,
    symbols: cbSymbols.checked,
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
  strengthLabel.textContent = label ? `${label} (~${Math.round(bits)} bits of entropy)` : "";
  strengthLabel.style.color = color;
}

function generate(): void {
  const opts = getOptions();
  currentPassword = generatePassword(opts);
  passwordOutput.textContent = currentPassword || "—";
  copyBtn.disabled = currentPassword.length === 0;
  updateStrengthUI(opts);
  clearCopyFeedback();
}

function clearCopyFeedback(): void {
  if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer);
  copyFeedback.textContent = "";
}

// ── Event listeners ──────────────────────────────────────────────────────────

generateBtn.addEventListener("click", generate);

lengthSlider.addEventListener("input", () => {
  lengthNumber.value = lengthSlider.value;
  updateStrengthUI(getOptions());
});

lengthNumber.addEventListener("change", () => {
  const clamped = clampLength(parseInt(lengthNumber.value, 10));
  lengthNumber.value = String(clamped);
  lengthSlider.value = String(clamped);
  updateStrengthUI(getOptions());
});

[cbUppercase, cbLowercase, cbNumbers, cbSymbols].forEach((cb) => {
  cb.addEventListener("change", () => updateStrengthUI(getOptions()));
});

copyBtn.addEventListener("click", async () => {
  if (!currentPassword) return;
  try {
    await navigator.clipboard.writeText(currentPassword);
    copyFeedback.textContent = "Copied!";
    if (copyFeedbackTimer !== null) clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => {
      copyFeedback.textContent = "";
    }, 2000);
  } catch {
    copyFeedback.textContent = "Copy failed — select manually";
    copyFeedback.style.color = "#f87171";
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────

generate();
