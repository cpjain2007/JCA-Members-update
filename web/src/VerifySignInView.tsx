import type { ConfirmationResult } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  clearRecaptcha,
  createOrResetRecaptcha,
  requestSignInLink,
  sendPhoneOtp,
  confirmPhoneOtp,
} from "./auth";
import { formatFirebaseAuthError } from "./authErrors";
import {
  displayPhoneLast4,
  maskEmailLast4AndDomain,
  pickPhoneForOtp,
} from "./phoneAuth";
import type { Member } from "./types";

type Props = {
  intent: "edit" | "add";
  member: Member | null;
  authError: string | null;
  clearAuthError: () => void;
  onBack?: () => void;
  backLabel?: string;
};

export function VerifySignInView(props: Props) {
  const { intent, member, authError, clearAuthError, onBack, backLabel } = props;

  const emailOnFile =
    member?.email?.trim() && member.email.includes("@") ? member.email.trim() : null;
  const phoneOnFile = member ? pickPhoneForOtp(member) : null;
  const showOnFile = intent === "edit" && (emailOnFile || phoneOnFile);

  const [channel, setChannel] = useState<"pick" | "manual">(
    intent === "add" || !showOnFile ? "manual" : "pick",
  );
  const [manualEmail, setManualEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">(
    authError ? "error" : "idle",
  );
  const [phoneState, setPhoneState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [banner, setBanner] = useState<string | null>(authError);
  const [phoneConfirm, setPhoneConfirm] = useState<ConfirmationResult | null>(null);
  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (showOnFile) {
      setChannel("pick");
    } else {
      setChannel("manual");
    }
  }, [showOnFile, member?.id]);

  useEffect(
    () => () => {
      clearRecaptcha();
    },
    [],
  );

  const onSendEmailLink = async (toEmail: string) => {
    if (emailState === "sending") return;
    clearAuthError();
    setBanner(null);
    setEmailState("sending");
    try {
      await requestSignInLink(toEmail);
      setEmailState("sent");
      setBanner(
        `We sent a sign-in link to ${toEmail.toLowerCase()}. Open the link in this browser to continue.`,
      );
    } catch (e) {
      setEmailState("error");
      setBanner(formatFirebaseAuthError(e, "email"));
    }
  };

  const onSendPhoneOtp = async () => {
    if (!phoneOnFile) return;
    if (phoneState === "sending") return;
    clearAuthError();
    setBanner(null);
    setPhoneState("sending");
    try {
      const v = createOrResetRecaptcha("recaptcha-container");
      const result = await sendPhoneOtp(phoneOnFile.e164, v);
      setPhoneConfirm(result);
      setPhoneState("sent");
      setBanner("Enter the verification code we sent to your phone.");
    } catch (e) {
      clearRecaptcha();
      setPhoneState("error");
      setBanner(formatFirebaseAuthError(e, "phone"));
    }
  };

  const onConfirmOtp = async () => {
    if (!phoneConfirm) return;
    setPhoneState("sending");
    setBanner(null);
    try {
      await confirmPhoneOtp(phoneConfirm, otp);
    } catch (e) {
      setPhoneState("error");
      setBanner(formatFirebaseAuthError(e, "phone"));
    } finally {
      setPhoneState("sent");
    }
  };

  const title = intent === "add" ? "Verify to add a member" : "Verify to view and edit";
  const sub = showOnFile
    ? "Use the email or phone we already have for this person."
    : "Enter the email you use for this directory. We’ll send a one-time sign-in link.";

  return (
    <div className="search-page">
      <div className="hero">
        {onBack && (
          <div style={{ textAlign: "left", marginBottom: "1rem" }}>
            <button type="button" className="back-btn" onClick={onBack}>
              {backLabel ?? "← Back"}
            </button>
          </div>
        )}
        <span className="brand-mark huge">JCA</span>
        <h1 className="hero-title">{title}</h1>
        <p className="hero-sub">{sub}</p>

        {authError && <div className="alert error" style={{ marginBottom: "0.75rem" }}>{authError}</div>}

        {channel === "pick" && showOnFile && (
          <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
            {emailOnFile && (
              <div style={{ marginBottom: "0.9rem" }}>
                <p className="mono small" style={{ margin: "0 0 0.25rem" }}>
                  {maskEmailLast4AndDomain(emailOnFile)}
                </p>
                <button
                  type="button"
                  className="primary"
                  style={{ width: "100%" }}
                  disabled={emailState === "sending"}
                  onClick={() => void onSendEmailLink(emailOnFile)}
                >
                  {emailState === "sending" ? "Sending…" : "Send sign-in link to this email"}
                </button>
              </div>
            )}
            {phoneOnFile && (
              <div>
                <p className="mono small" style={{ margin: "0 0 0.25rem" }}>
                  {displayPhoneLast4(phoneOnFile.display)}
                </p>
                <div id="recaptcha-container" />
                <button
                  type="button"
                  className="primary"
                  style={{ width: "100%", marginTop: 6 }}
                  disabled={phoneState === "sending" || !!phoneConfirm}
                  onClick={() => void onSendPhoneOtp()}
                >
                  {phoneState === "sending" && !phoneConfirm ? "Sending…" : "Send SMS code"}
                </button>
                <p className="muted tiny" style={{ marginTop: "0.45rem" }}>
                  SMS uses Firebase Phone Auth. Production SMS usually requires a Firebase Blaze plan; add
                  your number as a test number in the Firebase Console for free testing.
                </p>
                {phoneConfirm && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
                      value={otp}
                      maxLength={8}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      className="otp-input"
                    />
                    <button
                      type="button"
                      className="primary"
                      style={{ width: "100%", marginTop: 8 }}
                      disabled={phoneState === "sending" || otp.replace(/\D/g, "").length < 4}
                      onClick={() => void onConfirmOtp()}
                    >
                      {phoneState === "sending" ? "Verifying…" : "Verify & continue"}
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className="ghost"
              style={{ marginTop: "0.9rem" }}
              onClick={() => {
                setChannel("manual");
                setBanner(null);
              }}
            >
              Use a different email
            </button>
          </div>
        )}

        {(channel === "manual" || !showOnFile) && (
          <>
            <form
              className="search-bar"
              onSubmit={(e) => {
                e.preventDefault();
                void onSendEmailLink(manualEmail);
              }}
              style={{ marginTop: channel === "pick" && showOnFile ? 16 : 0 }}
            >
              <svg viewBox="0 0 24 24" className="search-icon" aria-hidden>
                <path
                  d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4.24-8 5-8-5V6l8 5 8-5z"
                  fill="currentColor"
                />
              </svg>
              <input
                type="email"
                inputMode="email"
                enterKeyHint="send"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder="Your email"
                aria-label="Email for sign-in link"
              />
              {manualEmail && (
                <button
                  type="button"
                  className="clear-btn"
                  aria-label="Clear"
                  onClick={() => setManualEmail("")}
                >
                  ×
                </button>
              )}
            </form>
            <div className="search-actions">
              <button
                type="button"
                className="primary"
                disabled={!manualEmail.trim() || emailState === "sending"}
                onClick={() => void onSendEmailLink(manualEmail)}
              >
                {emailState === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </div>
            {intent === "add" && (
              <p className="muted small" style={{ marginTop: "0.75rem" }}>
                After you open the link, you must be allowed to add records (e.g. admin use).
              </p>
            )}
          </>
        )}

        {banner && (
          <div className="search-foot" style={{ marginTop: 12 }}>
            <span className={emailState === "error" || phoneState === "error" ? "alert error inline" : "alert ok inline"}>
              {banner}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
