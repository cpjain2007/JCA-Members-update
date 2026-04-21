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

type View = "search" | "results" | "form";

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

function initials(firstName: string | null, lastName: string | null): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  const a = f ? f[0] : "";
  const b = l ? l[0] : "";
  return (a + b || "?").toUpperCase();
}

function displayName(m: Member): string {
  const parts = [m.firstName, m.lastName].filter(Boolean).map((s) => String(s).trim());
  return parts.join(" ") || "(unnamed member)";
}

function primaryPhone(m: Member): string {
  return m.cellPhone || m.homePhone || m.businessPhone || m.alternatePhone || "";
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

  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("");
  const [showAllResults, setShowAllResults] = useState(false);

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
      snap.forEach((d) => {
        list.push(memberDocToMember(d.id, d.data() as Record<string, unknown>));
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
    const q = query.trim();
    if (!q) return [] as Member[];
    return members.filter((m) => memberMatchesQuery(m, q));
  }, [members, query]);

  const selected = useMemo(
    () => members.find((m) => m.id === selectedId) ?? null,
    [members, selectedId],
  );

  useEffect(() => {
    if (selected) {
      setForm(formFromMember(selected));
    } else if (!isCreateMode) {
      setForm(emptyForm());
    }
  }, [selected, isCreateMode]);

  const goSearch = () => {
    setView("search");
    setQuery("");
    setSelectedId(null);
    setIsCreateMode(false);
    setShowAllResults(false);
    setSaveState("idle");
    setSaveMessage(null);
  };

  const goResults = () => {
    setView("results");
    setSelectedId(null);
    setIsCreateMode(false);
    setSaveState("idle");
    setSaveMessage(null);
  };

  const onSubmitSearch = () => {
    if (!query.trim()) return;
    setShowAllResults(false);
    setView("results");
  };

  const onSelectMember = (m: Member) => {
    setSelectedId(m.id);
    setIsCreateMode(false);
    setSaveState("idle");
    setSaveMessage(null);
    setView("form");
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
    setView("form");
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
        setSaveMessage("New member added and tracked for export.");
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
      setSaveMessage("Membership number cannot be changed for an existing member.");
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
      setSaveMessage("Changes saved and tracked for export.");
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
      <div className="app-shell">
        <div className="top-bar">
          <div className="brand">
            <span className="brand-mark">JCA</span>
            <span>Members</span>
          </div>
        </div>
        <div className="content">
          <div className="alert error">{initError}</div>
        </div>
      </div>
    );
  }

  if (!appReady) {
    return (
      <div className="app-shell">
        <div className="content">
          <div className="splash">
            <span className="brand-mark large">JCA</span>
            <p className="muted">Starting…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <button className="brand as-button" type="button" onClick={goSearch}>
          <span className="brand-mark">JCA</span>
          <span>Members</span>
        </button>
        <div className="top-actions">
          {loadState === "ok" && (
            <span className="badge">{members.length.toLocaleString()} members</span>
          )}
          <button type="button" className="ghost" onClick={() => void refreshMembers()}>
            {loadState === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <main className="content">
        {view === "search" && (
          <SearchView
            query={query}
            setQuery={setQuery}
            onSubmit={onSubmitSearch}
            onAdd={onStartCreate}
            loadState={loadState}
            loadError={loadError}
            memberCount={members.length}
          />
        )}

        {view === "results" && (
          <ResultsView
            query={query}
            setQuery={setQuery}
            onSubmit={onSubmitSearch}
            filtered={filtered}
            showAll={showAllResults}
            onShowAll={() => setShowAllResults(true)}
            onSelect={onSelectMember}
            onAdd={onStartCreate}
            onBack={goSearch}
          />
        )}

        {view === "form" && (
          <FormView
            isCreateMode={isCreateMode}
            selected={selected}
            form={form}
            update={update}
            onSave={onSave}
            onBack={query.trim() ? goResults : goSearch}
            saveState={saveState}
            saveMessage={saveMessage}
          />
        )}
      </main>

      <footer className="foot">
        <span className="mono tiny">device · {deviceId?.slice(0, 8) ?? "…"}</span>
      </footer>
    </div>
  );
}

function SearchView(props: {
  query: string;
  setQuery: (s: string) => void;
  onSubmit: () => void;
  onAdd: () => void;
  loadState: "idle" | "loading" | "ok" | "error";
  loadError: string | null;
  memberCount: number;
}) {
  const { query, setQuery, onSubmit, onAdd, loadState, loadError, memberCount } = props;
  return (
    <div className="search-page">
      <div className="hero">
        <span className="brand-mark huge">JCA</span>
        <h1 className="hero-title">Members Directory</h1>
        <p className="hero-sub">
          Search by name, email, or phone to verify and update member details.
        </p>
        <form
          className="search-bar"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <svg viewBox="0 0 24 24" className="search-icon" aria-hidden>
            <path
              d="M21 20.3l-5.2-5.2a7 7 0 1 0-1.4 1.4L19.6 21l1.4-.7zM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0z"
              fill="currentColor"
            />
          </svg>
          <input
            autoFocus
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, email, or phone…"
            aria-label="Search members"
          />
          {query && (
            <button
              type="button"
              className="clear-btn"
              aria-label="Clear"
              onClick={() => setQuery("")}
            >
              ×
            </button>
          )}
        </form>
        <div className="search-actions">
          <button type="button" className="primary" onClick={onSubmit} disabled={!query.trim()}>
            Search
          </button>
          <button type="button" className="ghost" onClick={onAdd}>
            + Add new member
          </button>
        </div>
        <div className="search-foot">
          {loadState === "loading" && <span className="muted">Loading directory…</span>}
          {loadState === "ok" && (
            <span className="muted">
              {memberCount.toLocaleString()} members ready to search
            </span>
          )}
          {loadState === "error" && loadError && (
            <span className="alert error inline">{loadError}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsView(props: {
  query: string;
  setQuery: (s: string) => void;
  onSubmit: () => void;
  filtered: Member[];
  showAll: boolean;
  onShowAll: () => void;
  onSelect: (m: Member) => void;
  onAdd: () => void;
  onBack: () => void;
}) {
  const { query, setQuery, onSubmit, filtered, showAll, onShowAll, onSelect, onAdd, onBack } =
    props;
  const visible = showAll ? filtered.slice(0, 100) : filtered.slice(0, 5);
  return (
    <div className="results-page">
      <div className="results-search">
        <form
          className="search-bar compact"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <svg viewBox="0 0 24 24" className="search-icon" aria-hidden>
            <path
              d="M21 20.3l-5.2-5.2a7 7 0 1 0-1.4 1.4L19.6 21l1.4-.7zM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0z"
              fill="currentColor"
            />
          </svg>
          <input
            autoFocus
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or phone"
          />
          {query && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => setQuery("")}
              aria-label="Clear"
            >
              ×
            </button>
          )}
        </form>
        <button type="button" className="ghost" onClick={onBack}>
          New search
        </button>
      </div>

      <div className="results-summary">
        <span>
          <strong>{filtered.length.toLocaleString()}</strong>{" "}
          {filtered.length === 1 ? "match" : "matches"} for "<em>{query}</em>"
        </span>
        <button type="button" className="ghost" onClick={onAdd}>
          + Add new member
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <h3>No members found</h3>
          <p className="muted">
            Try a different spelling, partial name, email, or last 4 digits of a phone number.
          </p>
          <button type="button" className="primary" onClick={onAdd}>
            Add a new member
          </button>
        </div>
      ) : (
        <>
          <ul className="card-list">
            {visible.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="member-card"
                  onClick={() => onSelect(m)}
                >
                  <span className="avatar">{initials(m.firstName, m.lastName)}</span>
                  <span className="body">
                    <span className="name">{displayName(m)}</span>
                    <span className="meta">
                      {m.email && <span className="meta-item">{m.email}</span>}
                      {primaryPhone(m) && (
                        <span className="meta-item">{primaryPhone(m)}</span>
                      )}
                      {(m.city || m.state) && (
                        <span className="meta-item">
                          {[m.city, m.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="tag">#{m.membershipNumber ?? "—"}</span>
                </button>
              </li>
            ))}
          </ul>
          {!showAll && filtered.length > 5 && (
            <div className="show-more">
              <button type="button" className="ghost" onClick={onShowAll}>
                Show {Math.min(filtered.length, 100) - 5} more
              </button>
            </div>
          )}
          {showAll && filtered.length > 100 && (
            <p className="muted small">
              Showing first 100 matches. Refine your search to narrow further.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FormView(props: {
  isCreateMode: boolean;
  selected: Member | null;
  form: MemberForm;
  update: <K extends keyof MemberForm>(key: K) => (value: MemberForm[K]) => void;
  onSave: () => void;
  onBack: () => void;
  saveState: "idle" | "saving" | "ok" | "error";
  saveMessage: string | null;
}) {
  const { isCreateMode, selected, form, update, onBack, saveState, saveMessage } = props;
  const title = isCreateMode
    ? "Add new member"
    : selected
      ? displayName(selected)
      : "Member";
  const subtitle = isCreateMode
    ? "Fill in the member details below"
    : selected
      ? `Membership #${selected.membershipNumber ?? "—"}`
      : "";

  return (
    <div className="form-page">
      <div className="form-header">
        <button type="button" className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="form-title">
          <span className="avatar large">
            {isCreateMode ? "+" : initials(form.firstName, form.lastName)}
          </span>
          <div>
            <h2>{title}</h2>
            <p className="muted">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="section-title">Identity</h3>
        <div className="grid-form">
          <Field label="First name">
            <input
              autoComplete="given-name"
              autoCapitalize="words"
              value={form.firstName}
              onChange={(e) => update("firstName")(e.target.value)}
            />
          </Field>
          <Field label="Last name">
            <input
              autoComplete="family-name"
              autoCapitalize="words"
              value={form.lastName}
              onChange={(e) => update("lastName")(e.target.value)}
            />
          </Field>
          <Field label="Spouse">
            <input
              autoCapitalize="words"
              value={form.spouse}
              onChange={(e) => update("spouse")(e.target.value)}
            />
          </Field>
          <Field label="Membership #">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.membershipNumber ?? ""}
              disabled={!isCreateMode}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                update("membershipNumber")(v === "" ? null : Number(v));
              }}
            />
          </Field>
          <Field label="Type">
            <input
              autoCapitalize="characters"
              value={form.membershipType}
              onChange={(e) => update("membershipType")(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <input
              value={form.status}
              onChange={(e) => update("status")(e.target.value)}
            />
          </Field>
          <Field label="SL #">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.sl ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                update("sl")(v === "" ? null : Number(v));
              }}
            />
          </Field>
          <Field label="Receipt">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.receipt ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                update("receipt")(v === "" ? null : Number(v));
              }}
            />
          </Field>
          <Field label="Year">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.year ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                update("year")(v === "" ? null : Number(v));
              }}
            />
          </Field>
          <Field label="Edited (ISO or text)">
            <input
              value={form.editedAt}
              onChange={(e) => update("editedAt")(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <h3 className="section-title">Address</h3>
        <div className="grid-form">
          <Field label="Street" wide>
            <input
              autoComplete="street-address"
              autoCapitalize="words"
              value={form.address}
              onChange={(e) => update("address")(e.target.value)}
            />
          </Field>
          <Field label="Apt / Unit">
            <input
              autoCapitalize="characters"
              value={form.apartment}
              onChange={(e) => update("apartment")(e.target.value)}
            />
          </Field>
          <Field label="City">
            <input
              autoComplete="address-level2"
              autoCapitalize="words"
              value={form.city}
              onChange={(e) => update("city")(e.target.value)}
            />
          </Field>
          <Field label="State">
            <input
              autoComplete="address-level1"
              autoCapitalize="characters"
              maxLength={2}
              value={form.state}
              onChange={(e) => update("state")(e.target.value)}
            />
          </Field>
          <Field label="ZIP">
            <input
              autoComplete="postal-code"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.zip}
              onChange={(e) => update("zip")(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <h3 className="section-title">Contact</h3>
        <div className="grid-form">
          <Field label="Email" wide>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.email}
              onChange={(e) => update("email")(e.target.value)}
            />
          </Field>
          <Field label="Cell phone">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.cellPhone}
              onChange={(e) => update("cellPhone")(e.target.value)}
            />
          </Field>
          <Field label="Home phone">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={form.homePhone}
              onChange={(e) => update("homePhone")(e.target.value)}
            />
          </Field>
          <Field label="Business phone">
            <input
              type="tel"
              inputMode="tel"
              value={form.businessPhone}
              onChange={(e) => update("businessPhone")(e.target.value)}
            />
          </Field>
          <Field label="Alternate phone">
            <input
              type="tel"
              inputMode="tel"
              value={form.alternatePhone}
              onChange={(e) => update("alternatePhone")(e.target.value)}
            />
          </Field>
          <Field label="Business" wide>
            <input
              autoCapitalize="words"
              value={form.business}
              onChange={(e) => update("business")(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <h3 className="section-title">Family / Notes</h3>
        <div className="grid-form">
          <Field label="Child detail 1" wide>
            <textarea
              value={form.childDetail1}
              onChange={(e) => update("childDetail1")(e.target.value)}
            />
          </Field>
          <Field label="Child detail 2" wide>
            <textarea
              value={form.childDetail2}
              onChange={(e) => update("childDetail2")(e.target.value)}
            />
          </Field>
          <Field label="Child detail 3" wide>
            <textarea
              value={form.childDetail3}
              onChange={(e) => update("childDetail3")(e.target.value)}
            />
          </Field>
          <Field label="Child detail 4" wide>
            <textarea
              value={form.childDetail4}
              onChange={(e) => update("childDetail4")(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="save-bar">
        <button type="button" className="ghost" onClick={onBack}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={saveState === "saving"}
          onClick={() => void props.onSave()}
        >
          {saveState === "saving"
            ? "Saving…"
            : isCreateMode
              ? "Create member"
              : "Save changes"}
        </button>
      </div>

      {saveMessage && (
        <div className={saveState === "ok" ? "alert ok" : "alert error"}>{saveMessage}</div>
      )}
    </div>
  );
}

function Field(props: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`field${props.wide ? " wide" : ""}`}>
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}
