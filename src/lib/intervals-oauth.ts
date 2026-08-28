export const INTERVALS_CLIENT_ID =
  (import.meta.env["VITE_INTERVALS_CLIENT_ID"] as string | undefined) ?? "802";

export const INTERVALS_REDIRECT_URI = "https://globero.app/auth/intervals/callback";

export const INTERVALS_SCOPES =
  "ACTIVITY:READ,ACTIVITY:WRITE,CALENDAR:READ,CALENDAR:WRITE,SETTINGS:READ,SETTINGS:WRITE,WELLNESS:READ,WELLNESS:WRITE";

export function intervalsAuthorizeUrl() {
  // Sin "scope": Intervals.icu ya asigna los scopes registrados del cliente;
  // enviarlos aquí provoca el error "Duplicate scope".
  const params = new URLSearchParams({
    client_id: INTERVALS_CLIENT_ID,
    redirect_uri: INTERVALS_REDIRECT_URI,
    response_type: "code",
  });
  return `https://intervals.icu/oauth/authorize?${params.toString()}`;
}
