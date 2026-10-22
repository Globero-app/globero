import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("profiles")
      .select("trial_ends_at,subscription_status,admin_grant_active,stripe_customer_id,deactivated_at")
      .eq("id", context.userId).maybeSingle();
    if (error || !data) throw new Error("No se pudo comprobar la suscripción");
    return { ...data, has_customer: !!data.stripe_customer_id, stripe_customer_id: undefined };
  });

export const createSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { stripeClient } = await import("./stripe.server");
    const stripe = stripeClient();
    const priceId = process.env["STRIPE_PRICE_ID"];
    if (!priceId) throw new Error("Falta configurar el precio de la suscripción");
    const { data: profile, error } = await context.supabase.from("profiles")
      .select("email,stripe_customer_id,admin_grant_active,deactivated_at")
      .eq("id", context.userId).maybeSingle();
    if (error || !profile || profile.deactivated_at) throw new Error("Cuenta no disponible");
    if (profile.admin_grant_active) throw new Error("Ya tienes acceso gratuito concedido por el administrador");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let customer = profile.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create({ email: profile.email, metadata: { user_id: context.userId } },
        { idempotencyKey: `globero-customer-${context.userId}` });
      const { data: saved, error: saveError } = await supabaseAdmin.from("profiles")
        .update({ stripe_customer_id: created.id }).eq("id", context.userId).is("stripe_customer_id", null)
        .select("stripe_customer_id").maybeSingle();
      if (saveError) throw new Error("No se pudo preparar la suscripción");
      if (saved?.stripe_customer_id) customer = saved.stripe_customer_id;
      else {
        const { data: existing } = await supabaseAdmin.from("profiles").select("stripe_customer_id")
          .eq("id", context.userId).maybeSingle();
        customer = existing?.stripe_customer_id ?? null;
      }
    }
    if (!customer) throw new Error("No se pudo preparar el cliente de Stripe");
    const subs = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
    if (subs.data.some((s) => !["canceled", "incomplete_expired"].includes(s.status))) {
      throw new Error("Ya tienes una suscripción. Gestiona su estado desde el portal de Stripe.");
    }
    const session = await stripe.checkout.sessions.create({
      customer, mode: "subscription", client_reference_id: context.userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { user_id: context.userId } },
      success_url: "https://coach.globero.app/suscripcion?checkout=success",
      cancel_url: "https://coach.globero.app/suscripcion?checkout=cancel",
    }, { idempotencyKey: `globero-checkout-${context.userId}-${Math.floor(Date.now() / 600000)}` });
    if (!session.url) throw new Error("No se pudo abrir el pago");
    return { url: session.url };
  });

export const createSubscriptionPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("profiles").select("stripe_customer_id")
      .eq("id", context.userId).maybeSingle();
    if (error || !data?.stripe_customer_id) throw new Error("Todavía no tienes una suscripción en Stripe");
    const { stripeClient } = await import("./stripe.server");
    const session = await stripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id, return_url: "https://coach.globero.app/suscripcion",
    });
    return { url: session.url };
  });

export const refreshMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("profiles").select("stripe_customer_id")
      .eq("id", context.userId).maybeSingle();
    if (data?.stripe_customer_id) {
      const { stripeClient, syncCustomerSubscription } = await import("./stripe.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await syncCustomerSubscription(stripeClient(), supabaseAdmin, data.stripe_customer_id);
    }
    return { ok: true };
  });