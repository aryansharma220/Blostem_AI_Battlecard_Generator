const KNOWN_COMPETITORS = [
  "Razorpay",
  "Paytm",
  "PhonePe",
  "Trustly",
  "Stripe",
  "Adyen",
  "Cashfree",
  "PayU",
  "Flutterwave",
];

const KNOWN_ALIASES = {
  razorpay: "Razorpay",
  paytm: "Paytm",
  phonepe: "PhonePe",
  "phone pe": "PhonePe",
  phonepay: "PhonePe",
  trustly: "Trustly",
  stripe: "Stripe",
  adyen: "Adyen",
  cashfree: "Cashfree",
  payu: "PayU",
  flutterwave: "Flutterwave",
};

function normalizeSpaces(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function keyFor(value = "") {
  return normalizeSpaces(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a = "", b = "") {
  const s = String(a || "");
  const t = String(b || "");
  const rows = s.length + 1;
  const cols = t.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function looksLikeGibberish(value = "") {
  const normalized = normalizeSpaces(value);
  const alphaOnly = normalized.toLowerCase().replace(/[^a-z]/g, "");
  if (!alphaOnly) return true;

  const vowels = (alphaOnly.match(/[aeiou]/g) || []).length;
  const uniqueRatio = new Set(alphaOnly.split("")).size / alphaOnly.length;

  if (alphaOnly.length >= 7 && vowels === 0) return true;
  if (/[bcdfghjklmnpqrstvwxyz]{7,}/i.test(alphaOnly)) return true;
  if (alphaOnly.length >= 8 && uniqueRatio < 0.35) return true;
  if (/([bcdfghjklmnpqrstvwxyz])\1\1/i.test(alphaOnly)) return true;
  return false;
}

function nearestKnownCompetitor(key = "") {
  if (!key) return null;
  const knownKeys = KNOWN_COMPETITORS.map((name) => ({
    name,
    key: keyFor(name),
  }));

  let best = null;
  for (const candidate of knownKeys) {
    const distance = levenshtein(key, candidate.key);
    if (!best || distance < best.distance) {
      best = { ...candidate, distance };
    }
  }

  if (!best) return null;
  const maxAllowed = Math.max(1, Math.floor(best.key.length * 0.3));
  if (best.distance <= maxAllowed) return best;
  return null;
}

export function normalizeAndValidateCompetitorInput(input = "") {
  const raw = normalizeSpaces(input);
  if (!raw) {
    return { ok: false, reason: "Missing competitor name" };
  }

  if (raw.length < 3 || raw.length > 60) {
    return { ok: false, reason: "Competitor name must be between 3 and 60 characters." };
  }

  if (!/^[a-z0-9 .&'_-]+$/i.test(raw)) {
    return { ok: false, reason: "Competitor name contains invalid characters." };
  }

  if (looksLikeGibberish(raw)) {
    return { ok: false, reason: "Competitor name looks invalid. Please enter a real company name." };
  }

  const alias = KNOWN_ALIASES[raw.toLowerCase()] || KNOWN_ALIASES[keyFor(raw)] || null;
  if (alias) {
    return {
      ok: true,
      competitor: alias,
      correctedFrom: alias.toLowerCase() !== raw.toLowerCase() ? raw : null,
    };
  }

  const near = nearestKnownCompetitor(keyFor(raw));
  if (near && near.name.toLowerCase() !== raw.toLowerCase()) {
    return {
      ok: true,
      competitor: near.name,
      correctedFrom: raw,
    };
  }

  return {
    ok: true,
    competitor: raw,
    correctedFrom: null,
  };
}
