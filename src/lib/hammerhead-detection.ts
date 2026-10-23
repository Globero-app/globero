export const ACTIVITY_SOURCE_FILTER = "intervals_api_key.not.is.null,intervals_oauth.is.true,wahoo_access_token.not.is.null,garmin_access_token.not.is.null,hammerhead_access_token.not.is.null";

export function hammerheadSignature(headers: Headers): string | null {
  return headers.get("x-hmac-signature") ?? headers.get("x-hammerhead-signature") ?? headers.get("x-signature");
}