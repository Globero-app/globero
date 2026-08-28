export const INTERVALS_CLIENT_ID =
  (import.meta.env["VITE_INTERVALS_CLIENT_ID"] as string | undefined) ?? "802";

export const INTERVALS_REDIRECT_URI = "https://globero.app/auth/intervals/callback";

export const INTERVALS_SCOPES = "ACTIVITY:READ,ACTIVITY:WRITE,ATHLETE:READ,ATHLETE:WRITE";

export function intervalsAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: INTERVALS_CLIENT_ID,
    redirect_uri: INTERVALS_REDIRECT_URI,
    response_type: "code",
    scope: INTERVALS_SCOPES,
  });
  return `https://intervals.icu/oauth/authorize?${params.toString()}`;
}
