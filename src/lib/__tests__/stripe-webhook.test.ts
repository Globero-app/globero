import { afterEach, describe, expect, it, vi } from "vitest";
import { handleStripeWebhook, syncCustomerSubscription } from "../stripe.server";
import { GLOBERO_MONTHLY_PRICE_ID } from "../stripe-config";

afterEach(() => vi.unstubAllEnvs());
describe("Stripe subscription synchronization", () => {
  it("rejects unsigned callbacks before processing any write", async () => {
    const response = await handleStripeWebhook(new Request("https://coach.globero.app/api/public/stripe/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
  });
  it("does not enable payments before webhook configuration", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const response = await handleStripeWebhook(new Request("https://coach.globero.app/api/public/stripe/webhook", {
      method: "POST", headers: { "stripe-signature": "invalid" }, body: "{}",
    }));
    expect(response.status).toBe(503);
  });
  it("uses authoritative active subscription state and the selected Globero monthly price", async () => {
    expect(GLOBERO_MONTHLY_PRICE_ID).toBe("price_1USwCeIxLxu09LAXiChSmkip");
    const update = vi.fn();
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: "user" } }), update: (value: any) => { update(value); return q; }, then: (resolve: any) => Promise.resolve({ error: null }).then(resolve) };
    const stripe: any = { subscriptions: { list: async () => ({ data: [
      { id: "sub_unrelated", status: "active", created: 300, items: { data: [{ price: { id: "price_other_product" } }] } },
      { id: "sub_canceled", status: "canceled", created: 200, items: { data: [{ price: { id: GLOBERO_MONTHLY_PRICE_ID } }] } },
      { id: "sub_active", status: "active", created: 100, items: { data: [{ price: { id: GLOBERO_MONTHLY_PRICE_ID } }] } },
    ] }) } };
    await syncCustomerSubscription(stripe, { from: () => q }, "cus_fixture");
    expect(update).toHaveBeenCalledWith({ subscription_status: "active", stripe_subscription_id: "sub_active" });
    stripe.subscriptions.list = async () => ({ data: [] });
    await syncCustomerSubscription(stripe, { from: () => q }, "cus_fixture");
    expect(update).toHaveBeenLastCalledWith({ subscription_status: "inactive", stripe_subscription_id: null });
  });
});