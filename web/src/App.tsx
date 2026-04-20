import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { db, getFirebaseApp } from "./firebase";
import { memberMatchesQuery } from "./search";
import {
  emptyForm,
  memberDocToMember,
  type Member,
  type MemberForm,
} from "./types";

const MEMBERS_COLLECTION = "members";
const MEMBER_CHANGES_COLLECTION = "member_changes";
const DEVICE_STORAGE_KEY = "jca_member_device_id";

function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing && existing.length === 36) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function formFromMember(m: Member): MemberForm {
  return {
    sl: m.sl,
    lastName: m.lastName ?? "",
    firstName: m.firstName ?? "",
    spouse: m.spouse ?? "",
    membershipType: m.membershipType ?? "",
    membershipNumber: m.membershipNumber,
    status: m.status ?? "",
    receipt: m.receipt,
    year: m.year,
    editedAt: m.editedAt ?? "",
    address: m.address ?? "",
    apartment: m.apartment ?? "",
    city: m.city ?? "",
    state: m.state ?? "",
    zip: m.zip === null || m.zip === undefined ? "" : String(m.zip),
    homePhone: m.homePhone ?? "",
    businessPhone: m.businessPhone ?? "",
    cellPhone: m.cellPhone ?? "",
    email: m.email ?? "",
    business: m.business ?? "",
    alternatePhone: m.alternatePhone ?? "",
    childDetail1: m.childDetail1 ?? "",
    childDetail2: m.childDetail2 ?? "",
    childDetail3: m.childDetail3 ?? "",
    childDetail4: m.childDetail4 ?? "",
  };
}

function payloadFromForm(form: MemberForm): Record<string, unknown> {
  const zipVal = String(form.zip ?? "").trim();
  return {
    sl: form.sl,
    lastName: form.lastName || null,
    firstName: form.firstName || null,
    spouse: form.spouse || null,
    membershipType: form.membershipType || null,
    membershipNumber: form.membershipNumber,
    status: form.status || null,
    receipt: form.receipt,
    year: form.year,
    editedAt: form.editedAt || null,
    address: form.address || null,
    apartment: form.apartment || null,
    city: form.city || null,
    state: form.state || null,
    zip: zipVal === "" ? null : /^\d+$/.test(zipVal) ? Number(zipVal) : zipVal,
    homePhone: form.homePhone || null,
    businessPhone: form.businessPhone || null,
    cellPhone: form.cellPhone || null,
    email: form.email || null,
    business: form.business || null,
    alternatePhone: form.alternatePhone || null,
    childDetail1: form.childDetail1 || null,
    childDetail2: form.childDetail2 || null,
    childDetail3: form.childDetail3 || null,
    childDetail4: form.childDetail4 || null,
  };
}

function buildSearchParts(payload: Record<string, unknown>): string[] {
  return [
    String(payload.firstName ?? "").toLowerCase(),
    String(payload.lastName ?? "").toLowerCase(),
    String(payload.spouse ?? "").toLowerCase(),
    String(payload.email ?? "").toLowerCase(),
    String(payload.homePhone ?? "").replace(/\D/g, ""),
    String(payload.businessPhone ?? "").replace(/\D/g, ""),
    String(payload.cellPhone ?? "").replace(/\D/g, ""),
    String(payload.alternatePhone ?? "").replace(/\D/g, ""),
  ].filter(Boolean);
}

async function writeMemberChangeSnapshot(params: {
  membershipNumber: number;
  payload: Record<string, unknown>;
  searchParts: string[];
  deviceId: string | null;
  changeType: "new" | "modified";
}) {
  const { membershipNumber, payload, searchParts, deviceId, changeType } = params;
  await setDoc(
    doc(db(), MEMBER_CHANGES_COLLECTION, String(membershipNumber)),
    {
      ...payload,
      membershipNumber,
      changeType,
      phoneDigits: searchParts.filter((p) => /^\d+$/.test(p)),
      searchText: searchParts.join(" "),
      changedAt: serverTimestamp(),
      changedByDeviceId: deviceId ?? "unknown",
    },
    { merge: true },
  );
}

export function App() {
  const [initError, setInitError] = useState<string | null>(null);
  const [appReady, setAppReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [form, setForm] = useState<MemberForm>(emptyForm());

  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "error">(
    "idle",
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      getFirebaseApp();
      setDeviceId(getOrCreateDeviceId());
      setAppReady(true);
    } catch (e) {
      setInitError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshMembers = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const snap = await getDocs(collection(db(), MEMBERS_COLLECTION));
      const list: Member[] = [];
      snap.forEach((doc) => {
        list.push(memberDocToMember(doc.id, doc.data() as Record<string, unknown>));
      });
      list.sort((a, b) => {
        const na = a.membershipNumber ?? 0;
        const nb = b.membershipNumber ?? 0;
        return na - nb;
      });
      setMembers(list);
      setLoadState("ok");
    } catch (e) {
      setLoadState("error");
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!appReady) return;
    void refreshMembers();
  }, [appReady, refreshMembers]);

  const filtered = useMemo(() => {
    return members.filter((m) => memberMatchesQuery(m, query));
  }, [members, query]);

  const selected = useMemo(
    () => members.find((m) => m.id === selectedId) ?? null,
    [members, selectedId],
  );

  useEffect(() => {
    if (selected) {
      setForm(formFromMember(selected));
    } else {
      setForm(emptyForm());
    }
  }, [selected]);

  const onSelectRow = (m: Member) => {
    setSelectedId(m.id);
    setIsCreateMode(false);
    setSaveState("idle");
    setSaveMessage(null);
  };

  const onStartCreate = () => {
    const nextSl = members.reduce((max, m) => Math.max(max, m.sl ?? 0), 0) + 1;
    setSelectedId(null);
    setIsCreateMode(true);
    setForm({
      ...emptyForm(),
      sl: nextSl,
      membershipType: "LM",
      year: new Date().getFullYear(),
    });
    setSaveState("idle");
    setSaveMessage(null);
  };

  const onSave = async () => {
    setSaveMessage(null);
    if (form.membershipNumber === null || form.membershipNumber === undefined) {
      setSaveState("error");
      setSaveMessage("Membership number is required.");
      return;
    }
    if (isCreateMode) {
      setSaveState("saving");
      try {
        const memberRef = doc(db(), MEMBERS_COLLECTION, String(form.membershipNumber));
        const existing = await getDoc(memberRef);
        if (existing.exists()) {
          setSaveState("error");
          setSaveMessage("That membership number already exists.");
          return;
        }

        const payload = payloadFromForm(form);
        const searchParts = buildSearchParts(payload);

        await setDoc(memberRef, {
          ...payload,
          phoneDigits: searchParts.filter((p) => /^\d+$/.test(p)),
          searchText: searchParts.join(" "),
          importedAt: serverTimestamp(),
          sourceExcelPath: "manual-web-entry",
        });
        await writeMemberChangeSnapshot({
          membershipNumber: form.membershipNumber,
          payload,
          searchParts,
          deviceId,
          changeType: "new",
        });

        setSaveState("ok");
        setSaveMessage("New user added and tracked for export.");
        setIsCreateMode(false);
        setSelectedId(String(form.membershipNumber));
        await refreshMembers();
      } catch (e) {
        setSaveState("error");
        setSaveMessage(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    if (!selectedId) {
      setSaveState("error");
      setSaveMessage("Select a member first.");
      return;
    }
    if (String(form.membershipNumber) !== selectedId) {
      setSaveState("error");
      setSaveMessage("Membership number cannot be changed for an existing user.");
      return;
    }

    setSaveState("saving");
    try {
      const payload = payloadFromForm(form);
      const searchParts = buildSearchParts(payload);
      await setDoc(doc(db(), MEMBERS_COLLECTION, selectedId), {
        ...payload,
        phoneDigits: searchParts.filter((p) => /^\d+$/.test(p)),
        searchText: searchParts.join(" "),
        updatedAt: serverTimestamp(),
        updatedByDeviceId: deviceId ?? "unknown",
      });
      await writeMemberChangeSnapshot({
        membershipNumber: form.membershipNumber,
        payload,
        searchParts,
        deviceId,
        changeType: "modified",
      });
      setSaveState("ok");
      setSaveMessage("Member updated and tracked for export.");
      await refreshMembers();
    } catch (e) {
      setSaveState("error");
      setSaveMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const update =
    <K extends keyof MemberForm>(key: K) =>
    (value: MemberForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    };

  if (initError) {
    return (
      <div className="layout">
        <h1>Member lookup</h1>
        <div className="alert error">{initError}</div>
      </div>
    );
  }

  if (!appReady) {
    return (
      <div className="layout">
        <h1>Member lookup</h1>
        <p className="sub">Starting…</p>
      </div>
    );
  }

  return (
    <div className="layout">
      <h1>Member lookup &amp; verify</h1>
      <p className="sub">
        Search by first name, last name, full name, email, or phone. New and edited records are
        saved directly to <span className="mono">members</span> and tracked in{" "}
        <span className="mono">member_changes</span>. Device id:{" "}
        <span className="mono">{deviceId}</span>
      </p>

      <div className="card">
        <div className="row">
          <label className="field" style={{ flex: "2 1 280px" }}>
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Neha, Smith, neha.smith1@example.com, 914612…"
              autoComplete="off"
            />
          </label>
          <button type="button" className="ghost" onClick={() => void refreshMembers()}>
            Refresh data
          </button>
          <button type="button" className="ghost" onClick={onStartCreate}>
            Add new user
          </button>
        </div>
        <p style={{ margin: "0.65rem 0 0", color: "var(--muted)", fontSize: "0.88rem" }}>
          {loadState === "loading" && "Loading members…"}
          {loadState === "ok" && (
            <>
              <span className="badge">{members.length} members in cloud</span>
              {query.trim() && (
                <>
                  {" "}
                  · <span className="badge">{filtered.length} matches</span>
                </>
              )}
            </>
          )}
        </p>
        {loadState === "error" && loadError && (
          <div className="alert error" style={{ marginTop: "0.65rem" }}>
            {loadError}
          </div>
        )}
      </div>

      <div className="card">
        <strong>Matching records</strong>
        <p style={{ margin: "0.35rem 0 0.6rem", color: "var(--muted)", fontSize: "0.88rem" }}>
          If several rows match, click one to load it into the form below.
        </p>
        <div className="results">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Email</th>
                <th>Home</th>
                <th>Membership</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((m) => (
                <tr
                  key={m.id}
                  className={m.id === selectedId ? "selected" : undefined}
                  onClick={() => onSelectRow(m)}
                >
                  <td>{m.sl ?? "—"}</td>
                  <td>
                    {(m.firstName || "").trim()} {(m.lastName || "").trim()}
                  </td>
                  <td className="mono">{m.email || "—"}</td>
                  <td className="mono">{m.homePhone || "—"}</td>
                  <td className="mono">{m.membershipNumber ?? "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && loadState === "ok" && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--muted)" }}>
                    No matches. Try another search or refresh data after import.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <p style={{ margin: "0.5rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            Showing first 200 matches. Refine your search to narrow results.
          </p>
        )}
      </div>

      <div className="card">
        <strong>{isCreateMode ? "Add new user" : "Verify or edit"}</strong>
        {!selected && !isCreateMode && (
          <p style={{ margin: "0.5rem 0 0", color: "var(--muted)" }}>
            Select a row above to load member details.
          </p>
        )}
        {(selected || isCreateMode) && (
          <>
            <div className="grid-form" style={{ marginTop: "0.75rem" }}>
              <label className="field">
                <span>SL#</span>
                <input
                  type="number"
                  value={form.sl ?? ""}
                  onChange={(e) =>
                    update("sl")(e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </label>
              <label className="field">
                <span>Last</span>
                <input value={form.lastName} onChange={(e) => update("lastName")(e.target.value)} />
              </label>
              <label className="field">
                <span>First</span>
                <input
                  value={form.firstName}
                  onChange={(e) => update("firstName")(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Spouse</span>
                <input value={form.spouse} onChange={(e) => update("spouse")(e.target.value)} />
              </label>
              <label className="field">
                <span>Type</span>
                <input
                  value={form.membershipType}
                  onChange={(e) => update("membershipType")(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Membership #</span>
                <input
                  type="number"
                  value={form.membershipNumber ?? ""}
                  onChange={(e) =>
                    update("membershipNumber")(
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Status</span>
                <input value={form.status} onChange={(e) => update("status")(e.target.value)} />
              </label>
              <label className="field">
                <span>Receipt</span>
                <input
                  type="number"
                  value={form.receipt ?? ""}
                  onChange={(e) =>
                    update("receipt")(e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </label>
              <label className="field">
                <span>Year</span>
                <input
                  type="number"
                  value={form.year ?? ""}
                  onChange={(e) =>
                    update("year")(e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </label>
              <label className="field">
                <span>Edited (ISO or text)</span>
                <input value={form.editedAt} onChange={(e) => update("editedAt")(e.target.value)} />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Address</span>
                <input value={form.address} onChange={(e) => update("address")(e.target.value)} />
              </label>
              <label className="field">
                <span>Apt</span>
                <input
                  value={form.apartment}
                  onChange={(e) => update("apartment")(e.target.value)}
                />
              </label>
              <label className="field">
                <span>City</span>
                <input value={form.city} onChange={(e) => update("city")(e.target.value)} />
              </label>
              <label className="field">
                <span>State</span>
                <input value={form.state} onChange={(e) => update("state")(e.target.value)} />
              </label>
              <label className="field">
                <span>ZIP</span>
                <input value={form.zip} onChange={(e) => update("zip")(e.target.value)} />
              </label>
              <label className="field">
                <span>Home phone</span>
                <input
                  value={form.homePhone}
                  onChange={(e) => update("homePhone")(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Business phone</span>
                <input
                  value={form.businessPhone}
                  onChange={(e) => update("businessPhone")(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Cell phone</span>
                <input
                  value={form.cellPhone}
                  onChange={(e) => update("cellPhone")(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input value={form.email} onChange={(e) => update("email")(e.target.value)} />
              </label>
              <label className="field">
                <span>Business</span>
                <input value={form.business} onChange={(e) => update("business")(e.target.value)} />
              </label>
              <label className="field">
                <span>Alternate phone</span>
                <input
                  value={form.alternatePhone}
                  onChange={(e) => update("alternatePhone")(e.target.value)}
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Child detail 1</span>
                <textarea
                  value={form.childDetail1}
                  onChange={(e) => update("childDetail1")(e.target.value)}
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Child detail 2</span>
                <textarea
                  value={form.childDetail2}
                  onChange={(e) => update("childDetail2")(e.target.value)}
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Child detail 3</span>
                <textarea
                  value={form.childDetail3}
                  onChange={(e) => update("childDetail3")(e.target.value)}
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Child detail 4</span>
                <textarea
                  value={form.childDetail4}
                  onChange={(e) => update("childDetail4")(e.target.value)}
                />
              </label>
            </div>
            <div className="actions">
              {isCreateMode && (
                <button type="button" className="ghost" onClick={() => setIsCreateMode(false)}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="primary"
                disabled={saveState === "saving"}
                onClick={() => void onSave()}
              >
                {isCreateMode ? "Create user" : "Save changes"}
              </button>
            </div>
            {saveMessage && (
              <div
                className={saveState === "ok" ? "alert ok" : "alert error"}
                style={{ marginTop: "0.65rem" }}
              >
                {saveMessage}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
