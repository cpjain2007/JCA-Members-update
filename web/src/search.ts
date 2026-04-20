import type { Member } from "./types";

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Match if every whitespace-separated token hits first name, last name, full name, email, or phone digits. */
export function memberMatchesQuery(member: Member, raw: string): boolean {
  const q = raw.trim();
  if (!q) return true;

  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const allPhoneDigits = [
    ...(member.phoneDigits ?? []),
    digits(member.homePhone),
    digits(member.businessPhone),
    digits(member.cellPhone),
    digits(member.alternatePhone),
  ]
    .filter(Boolean)
    .join("");

  const fullName = `${norm(member.firstName)} ${norm(member.lastName)}`.trim();
  const fullNameRev = `${norm(member.lastName)} ${norm(member.firstName)}`.trim();

  return tokens.every((tok) => {
    if (/^\d{3,}$/.test(tok)) {
      return allPhoneDigits.includes(tok);
    }
    const t = tok.toLowerCase();
    return (
      norm(member.firstName).includes(t) ||
      norm(member.lastName).includes(t) ||
      fullName.includes(t) ||
      fullNameRev.includes(t) ||
      norm(member.email).includes(t)
    );
  });
}
