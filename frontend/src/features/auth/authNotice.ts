const AUTH_NOTICE_KEY = "genbioca_auth_notice";

/**
 * A one-shot message handed to the login screen across a sign-out redirect.
 *
 * Clearing the identity is what performs the redirect (the protected shell
 * navigates to `/login` on its own), so router location state does not survive
 * the transition. This carries the message instead. It holds UI copy only —
 * never credentials, tokens or account identifiers.
 */
export const setAuthNotice = (message: string) => {
  try {
    sessionStorage.setItem(AUTH_NOTICE_KEY, message);
  } catch {
    // Storage unavailable (private mode); the redirect still happens.
  }
};

/** Reads the pending notice and clears it, so it shows exactly once. */
export const takeAuthNotice = (): string => {
  try {
    const stored = sessionStorage.getItem(AUTH_NOTICE_KEY);
    if (stored) sessionStorage.removeItem(AUTH_NOTICE_KEY);
    return stored ?? "";
  } catch {
    return "";
  }
};
