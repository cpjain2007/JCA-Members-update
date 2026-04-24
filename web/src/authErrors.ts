/** Turn Firebase auth error codes into actionable text for the UI. */
export function formatFirebaseAuthError(
  e: unknown,
  hint: "phone" | "email" | "default" = "default",
): string {
  const code =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code: string }).code)
      : "";

  if (code === "auth/operation-not-allowed") {
    if (hint === "phone") {
      return [
        "Phone (SMS) sign-in is not turned on in your Firebase project.",
        "Fix: Firebase Console → Authentication → Sign-in method → open “Phone” → Enable → Save.",
        "On the free (Spark) plan, add your number under “Phone numbers for testing”, or upgrade to Blaze for real SMS. Or use the email sign-in link instead.",
      ].join(" ");
    }
    if (hint === "email") {
      return [
        "Email link sign-in is not turned on.",
        "Fix: Firebase Console → Authentication → Sign-in method → Email/Password → Enable, and turn on “Email link (passwordless sign-in)” → Save.",
      ].join(" ");
    }
    return "This sign-in method is disabled in Firebase. Enable it under Authentication → Sign-in method.";
  }

  if (code === "auth/too-many-requests") {
    return "Too many attempts. Wait a few minutes and try again, or use the other sign-in option.";
  }

  if (code === "auth/invalid-app-credential" || code === "auth/missing-or-invalid-nonce") {
    return "reCAPTCHA or app verify failed. Refresh the page and try again, or use email sign-in.";
  }

  return e instanceof Error ? e.message : String(e);
}
