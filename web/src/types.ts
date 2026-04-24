export type Member = {
  id: string;
  sl: number | null;
  lastName: string | null;
  firstName: string | null;
  spouse: string | null;
  membershipType: string | null;
  membershipNumber: number | null;
  status: string | null;
  receipt: number | null;
  year: number | null;
  editedAt: string | null;
  address: string | null;
  apartment: string | null;
  city: string | null;
  state: string | null;
  zip: string | number | null;
  homePhone: string | null;
  businessPhone: string | null;
  cellPhone: string | null;
  email: string | null;
  business: string | null;
  alternatePhone: string | null;
  childDetail1: string | null;
  childDetail2: string | null;
  childDetail3: string | null;
  childDetail4: string | null;
  phoneDigits?: string[];
  searchText?: string;
};

export type MemberForm = {
  sl: number | null;
  lastName: string;
  firstName: string;
  spouse: string;
  membershipType: string;
  membershipNumber: number | null;
  status: string;
  receipt: number | null;
  year: number | null;
  editedAt: string;
  address: string;
  apartment: string;
  city: string;
  state: string;
  zip: string;
  homePhone: string;
  businessPhone: string;
  cellPhone: string;
  email: string;
  business: string;
  alternatePhone: string;
  childDetail1: string;
  childDetail2: string;
  childDetail3: string;
  childDetail4: string;
};

export const emptyForm = (): MemberForm => ({
  sl: null,
  lastName: "",
  firstName: "",
  spouse: "",
  membershipType: "",
  membershipNumber: null,
  status: "",
  receipt: null,
  year: null,
  editedAt: "",
  address: "",
  apartment: "",
  city: "",
  state: "",
  zip: "",
  homePhone: "",
  businessPhone: "",
  cellPhone: "",
  email: "",
  business: "",
  alternatePhone: "",
  childDetail1: "",
  childDetail2: "",
  childDetail3: "",
  childDetail4: "",
});

/** First non-empty string among Firestore keys (handles legacy/Excel-style field names). */
function stringField(
  data: Record<string, unknown>,
  key: string,
  ...aliasKeys: string[]
): string | null {
  for (const k of [key, ...aliasKeys]) {
    if (!(k in data) || data[k] == null) continue;
    const s = String(data[k] as string | number | boolean).trim();
    if (s) return s;
  }
  return null;
}

export function memberDocToMember(id: string, data: Record<string, unknown>): Member {
  return {
    id,
    sl: (data.sl as number | null) ?? null,
    lastName: stringField(data, "lastName", "last_name", "LAST", "LastName", "last"),
    firstName: stringField(data, "firstName", "first_name", "FIRST", "First", "first"),
    spouse: (data.spouse as string | null) ?? null,
    membershipType: (data.membershipType as string | null) ?? null,
    membershipNumber: (data.membershipNumber as number | null) ?? null,
    status: (data.status as string | null) ?? null,
    receipt: (data.receipt as number | null) ?? null,
    year: (data.year as number | null) ?? null,
    editedAt: typeof data.editedAt === "string" ? data.editedAt : null,
    address: (data.address as string | null) ?? null,
    apartment: (data.apartment as string | null) ?? null,
    city: (data.city as string | null) ?? null,
    state: (data.state as string | null) ?? null,
    zip: (data.zip as string | number | null) ?? null,
    homePhone: (data.homePhone as string | null) ?? null,
    businessPhone: (data.businessPhone as string | null) ?? null,
    cellPhone: (data.cellPhone as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    business: (data.business as string | null) ?? null,
    alternatePhone: (data.alternatePhone as string | null) ?? null,
    childDetail1: (data.childDetail1 as string | null) ?? null,
    childDetail2: (data.childDetail2 as string | null) ?? null,
    childDetail3: (data.childDetail3 as string | null) ?? null,
    childDetail4: (data.childDetail4 as string | null) ?? null,
    phoneDigits: Array.isArray(data.phoneDigits)
      ? (data.phoneDigits as string[])
      : undefined,
    searchText: stringField(data, "searchText", "search_text") ?? undefined,
  };
}
