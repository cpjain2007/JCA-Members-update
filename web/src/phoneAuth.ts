import type { Member } from "./types";

/** Result list: last 4 of local + full domain, e.g. ••••wxyz@gmail.com */
export function maskEmailLast4AndDomain(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "";
  const at = trimmed.indexOf("@");
  if (at < 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!local || !domain) return trimmed;
  const last4 = local.length <= 4 ? local : local.slice(-4);
  const hidden = local.length <= 4 ? "" : "••••";
  return local.length <= 4 ? `${local}@${domain}` : `${hidden}${last4}@${domain}`;
}

/** Digits only for phone comparison */
export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/**
 * Pick the best number for SMS (cell first), return E.164 for US/CA 10–11 digit numbers.
 * Returns null if we cannot form a valid +E.164.
 */
export function toE164ForSms(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const d = phoneDigits(phone);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (phone.trim().startsWith("+") && d.length >= 10) return `+${d.replace(/^\+/, "")}`;
  return null;
}

export function pickPhoneForOtp(m: Member): { display: string; e164: string } | null {
  const order = [m.cellPhone, m.homePhone, m.businessPhone, m.alternatePhone];
  for (const raw of order) {
    if (!raw?.trim()) continue;
    const e164 = toE164ForSms(raw);
    if (e164) return { display: raw.trim(), e164 };
  }
  return null;
}

export function displayPhoneLast4(phone: string | null | undefined): string {
  if (!phone?.trim()) return "";
  const d = phoneDigits(phone);
  if (d.length <= 4) return `••• ${d}`;
  return `••• ••• ${d.slice(-4)}`;
}

/** Compare Firebase user.phoneNumber with member phones (US: last 10 digits). */
export function userPhoneMatchesMember(phoneE164: string | null | undefined, m: Member): boolean {
  if (!phoneE164) return false;
  const u = phoneDigits(phoneE164);
  const u10 = u.length >= 10 ? u.slice(-10) : u;
  if (u10.length < 10) return false;
  const candidates = [m.cellPhone, m.homePhone, m.businessPhone, m.alternatePhone];
  for (const p of candidates) {
    if (!p?.trim()) continue;
    const d = phoneDigits(p);
    if (d.length >= 10 && d.slice(-10) === u10) return true;
    const e = toE164ForSms(p);
    if (e && phoneDigits(e).slice(-10) === u10) return true;
  }
  return false;
}
