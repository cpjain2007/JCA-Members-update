import type { Member } from "./types";

/** Lowercase + Unicode normalize so e.g. full-width and accented letters still match. */
function fold(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").toLowerCase().trim();
}

function norm(s: string | null | undefined): string {
  return fold(s);
}

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

const TEXT_KEYS: (keyof Member)[] = [
  "firstName",
  "lastName",
  "spouse",
  "email",
  "membershipType",
  "status",
  "address",
  "apartment",
  "city",
  "state",
  "business",
  "homePhone",
  "businessPhone",
  "cellPhone",
  "alternatePhone",
  "childDetail1",
  "childDetail2",
  "childDetail3",
  "childDetail4",
  "editedAt",
  "searchText",
];

const NUM_STRING_KEYS: (keyof Member)[] = [
  "membershipNumber",
  "receipt",
  "year",
  "sl",
  "zip",
];

/**
 * Query tokens: words split on spaces, dots, @, commas; also splits 892-958 style into
 * segments so "892-958" and "neha.smith" both work. Users can combine any fragments.
 */
export function tokenizeQuery(raw: string): string[] {
  return fold(raw)
    .replace(/,/g, " ")
    .replace(/@/g, " ")
    .split(/[\s.]+/)
    .map((s) => s.replace(/[_,-]+/g, " ").trim())
    .flatMap((s) => s.split(/\s+/))
    .filter(Boolean);
}

function joinAllPhoneDigits(m: Member): string {
  return [
    ...(m.phoneDigits ?? []).map((p) => digitsOnly(p)),
    digitsOnly(m.homePhone),
    digitsOnly(m.businessPhone),
    digitsOnly(m.cellPhone),
    digitsOnly(m.alternatePhone),
  ]
    .filter(Boolean)
    .join("");
}

function joinIdAndZipDigits(m: Member): string {
  return [
    m.membershipNumber,
    m.receipt,
    m.year,
    m.sl,
    m.zip,
  ]
    .map((v) => (v == null || v === "" ? "" : digitsOnly(String(v))))
    .join("");
}

/** Single lowercase string over all fields so partial matches work across the record. */
function buildTextHaystack(m: Member): string {
  const parts: string[] = [];
  for (const key of TEXT_KEYS) {
    const v = m[key];
    if (v == null || v === "") continue;
    parts.push(fold(String(v)));
  }
  for (const key of NUM_STRING_KEYS) {
    const v = m[key];
    if (v == null || v === "") continue;
    parts.push(fold(String(v)));
  }
  const fn = norm(m.firstName);
  const ln = norm(m.lastName);
  if (fn && ln) {
    parts.push(`${fn} ${ln}`, `${ln} ${fn}`, `${fn}${ln}`);
  }
  return parts.join(" ");
}

/**
 * True if the member should appear for this query: every token must match at least one
 * field (text substring, or digit substring in phone / IDs). Tokens can mix name + email + phone.
 */
export function memberMatchesQuery(member: Member, raw: string): boolean {
  const q = raw.trim();
  if (!q) return true;

  const tokens = tokenizeQuery(q);
  if (tokens.length === 0) return true;

  const textHay = buildTextHaystack(member);
  const phoneDigits = joinAllPhoneDigits(member);
  const idDigits = joinIdAndZipDigits(member);
  const allDigitChars = phoneDigits + idDigits;

  return tokens.every((tok) => tokenMatchesToken(tok, textHay, phoneDigits, idDigits, allDigitChars));
}

function tokenMatchesToken(
  rawTok: string,
  textHay: string,
  phoneDigits: string,
  idDigits: string,
  allDigitChars: string,
): boolean {
  const t = fold(rawTok);
  if (!t) return true;

  if (textHay.includes(t)) return true;

  if (/^\d+$/.test(t)) {
    if (t.length >= 3) {
      return (
        phoneDigits.includes(t) || idDigits.includes(t) || allDigitChars.includes(t) || textHay.includes(t)
      );
    }
    if (t.length === 2) {
      return (
        phoneDigits.includes(t) ||
        idDigits.includes(t) ||
        allDigitChars.includes(t) ||
        textHay.includes(t)
      );
    }
    return allDigitChars.includes(t) || textHay.includes(t);
  }

  return false;
}
