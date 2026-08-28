export const INTERVALS_CLIENT_ID =
  (import.meta.env["VITE_INTERVALS_CLIENT_ID"] as string | undefined) ?? "802";

export const INTERVALS_REDIRECT_URI = "https://globero.app/auth/intervals/callback";

export const INTERVALS_SCOPES =
  "ACTIVITY:WRITE,CALENDAR:WRITE,SETTINGS:WRITE,WELLNESS:WRITE";

export function intervalsAuthorizeUrl(state?: string) {
  const params = new URLSearchParams({
    client_id: INTERVALS_CLIENT_ID,
    redirect_uri: INTERVALS_REDIRECT_URI,
    scope: INTERVALS_SCOPES,
  });
  if (state) params.set("state", state);
  return `https://intervals.icu/oauth/authorize?${params.toString()}`;
}
