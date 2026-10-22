import Stripe from "stripe";

export function stripeClient() {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Stripe todavía no está configurado");
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 });
}

export async function syncCustomerSubscription(stripe: Stripe, admin: any, customerId: string) {
  const { data: profile, error } = await admin.from("profiles").select("id")
    .eq("stripe_customer_id", customerId).maybeSingle();
  if (error) throw new Error("No se pudo consultar la suscripción");
  if (!profile) return;
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  const priceId = process.env["STRIPE_PRICE_ID"];
  if (!priceId) throw new Error("Falta configurar el precio de la suscripción");
  const matching = subscriptions.data.filter((s) => s.items.data.some((item) => item.price.id === priceId));
  const current = matching.find((s) => s.status === "active") ??
    matching.sort((a, b) => b.created - a.created)[0];
  const { error: updateError } = await admin.from("profiles").update({
    subscription_status: current?.status ?? "inactive",
    stripe_subscription_id: current?.id ?? null,
  }).eq("id", profile.id).eq("stripe_customer_id", customerId);
  if (updateError) throw new Error("No se pudo guardar la suscripción");
}

export async function handleStripeWebhook(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Invalid signature", { status: 400 });
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 1048576) return new Response("Payload too large", { status: 413 });
  const body = await request.text();
  if (body.length > 1048576) return new Response("Payload too large", { status: 413 });
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, secret, 300, Stripe.createSubtleCryptoProvider());
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (!["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    return Response.json({ received: true });
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription;
    const customer = typeof object.customer === "string" ? object.customer : object.customer?.id;
    if (!customer) return new Response("Missing customer", { status: 400 });
    // Never trust checkout completion as payment proof. Read authoritative Stripe state;
    // repeated and out-of-order deliveries converge without granting based on a URL or payload status.
    await syncCustomerSubscription(stripe, supabaseAdmin, customer);
    return Response.json({ received: true });
  } catch {
    return new Response("Subscription synchronization failed", { status: 500 });
  }
}