# Architecture rules

- Normalize Hammerhead activity duration from milliseconds and prefer riding start over upload timestamps before load calculation and deduplication; defensively normalize activity durations above 86400 through a shared helper in TSS estimators to prevent inflated PMC; share source-filter and signature-header rules between tested helpers and incoming handlers.

- Store generation entitlements in protected profile fields; enforce a shared server guard before AI generation and database triggers on new workouts/nutrition writes, without gating application login. Stripe uses authenticated server functions for checkout/portal and a signature-verified public webhook reading authoritative subscription state; share the selected catalog price constant between checkout and synchronization to prevent entitlement mismatches; only verified administrators can change free grants.
- Render the trial expiry notice in AppShell using the shared tested subscription helper and owner-readable profile fields; keep reminders separate from generation enforcement.
- Reuse SubscriptionPanel in the Profile subscription tab and the standalone subscription route so checkout, portal and status controls cannot diverge; never gate account/settings navigation on generation entitlements.
- Share client creation checks and notices through CreationAccess in AppShell; deep-link subscription management through the validated Profile tab search parameter, preserving existing-data access and active beacon safety controls.

- Reject activity matches using per-target discarded activity IDs in both manual and scheduled matchers; legacy global rejection flags never block unrelated future activities.

- Group Rutas, Garage and Baliza navigation under the authenticated `/salidas` card hub; link to their existing URLs without moving their screens or changing their operations to preserve existing flows.

- Keep fixed AI generation roles, tables and format rules in a stable leading system message, with cyclist/week context in user messages; this preserves a reusable cache prefix without changing providers or models.

- Preserve legacy cron callback commands and authentication when wrapping schedules; beacon table changes toggle watchdog execution, and notification windows are evaluated in Madrid time inside PostgreSQL to honor preference and DST changes without HTTP calls outside those windows.

- Generate shareable workout stories client-side as 1080×1920 PNGs from completed workout data; sanitize content before rendering a single canvas for preview and export, use Web Share for browsers and cached files for Capacitor Share so private data is never uploaded or leaked by a separate export path. Optional linked-activity GPS geometry is rendered on that same canvas without map tiles; hiding location also excludes the geometry.

- Keep homemade drink-mix calculations in a pure, tested module; the nutrition card menu selects existing subviews through the validated `view` search parameter on `/menus`, preserving public URLs and isolating menu queries from calculators.

- Retry transient AI gateway failures (429/503) with bounded exponential backoff in the single call helper, honoring Retry-After and propagating the error once attempts are exhausted; terminal statuses never retry.

- Keep Android launcher artwork in density-specific native resources, with matching adaptive and legacy icons; Android launchers cannot resolve CDN asset pointers.
- Use the shared GPX elevation chart in route details for uploaded and generated routes, computing cumulative kilometres from original GPX points to avoid distance loss from map simplification.