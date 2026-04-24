import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  type ConfirmationResult,
  RecaptchaVerifier,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

const EMAIL_STORAGE_KEY = "jca_signin_email";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Build the URL that the email-link should redirect back to.
 * We keep the full current origin + path so the link works in dev, staging, and prod.
 */
function signInRedirectUrl(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

/**
 * Send a one-time sign-in link to the user's email.
 * Caller should show: "Check your inbox" until the user returns from the link.
 */
export async function requestSignInLink(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email || !email.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  await sendSignInLinkToEmail(auth(), email, {
    url: signInRedirectUrl(),
    handleCodeInApp: true,
  });
  try {
    window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
  } catch {
    /* ignore */
  }
}

/**
 * If the page was opened from an email link, finish the sign-in flow.
 * Returns the signed-in User, or null if the URL is not an email-link.
 * If the email isn't in localStorage (cross-device flow) and `promptForEmail`
 * is provided, we call it to let the caller collect the email from the user.
 */
export async function completeSignInFromUrl(
  promptForEmail: () => string | null,
): Promise<User | null> {
  const a = auth();
  const href = window.location.href;
  if (!isSignInWithEmailLink(a, href)) return null;

  let email: string | null = null;
  try {
    email = window.localStorage.getItem(EMAIL_STORAGE_KEY);
  } catch {
    email = null;
  }
  if (!email) {
    email = promptForEmail();
    if (!email) {
      throw new Error(
        "Couldn't confirm the email for this sign-in link. Open the link on the same device you requested it from, or re-enter your email.",
      );
    }
  }

  const cred = await signInWithEmailLink(a, email, href);
  try {
    window.localStorage.removeItem(EMAIL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  // Scrub the email-link query params from the URL so refreshes don't re-trigger it.
  const clean = window.location.pathname + window.location.hash;
  window.history.replaceState({}, document.title, clean || "/");
  return cred.user;
}

export function watchAuthState(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth(), cb);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth());
}

export function pendingSignInEmail(): string | null {
  try {
    return window.localStorage.getItem(EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingSignInEmail(): void {
  try {
    window.localStorage.removeItem(EMAIL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

let recaptchaInstance: RecaptchaVerifier | null = null;

export function createOrResetRecaptcha(containerId: string): RecaptchaVerifier {
  recaptchaInstance?.clear();
  recaptchaInstance = new RecaptchaVerifier(auth(), containerId, { size: "invisible" });
  return recaptchaInstance;
}

export function clearRecaptcha(): void {
  try {
    recaptchaInstance?.clear();
  } catch {
    /* ignore */
  }
  recaptchaInstance = null;
}

/** Phone SMS OTP. Requires Phone auth enabled in Firebase; production SMS often needs Blaze. */
export async function sendPhoneOtp(phoneE164: string, verifier: RecaptchaVerifier): Promise<ConfirmationResult> {
  if (!phoneE164.startsWith("+")) {
    throw new Error("Phone number must be in E.164 format (e.g. +12025550123).");
  }
  return signInWithPhoneNumber(auth(), phoneE164, verifier);
}

export async function confirmPhoneOtp(result: ConfirmationResult, code: string) {
  const c = code.replace(/\D/g, "");
  if (c.length < 4) {
    throw new Error("Enter the verification code from the SMS.");
  }
  return result.confirm(c);
}
