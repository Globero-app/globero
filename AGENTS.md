# Architecture rules

- Preserve legacy cron callback commands and authentication when wrapping schedules; beacon table changes toggle watchdog execution, and notification windows are evaluated in Madrid time inside PostgreSQL to honor preference and DST changes without HTTP calls outside those windows.

- Generate shareable workout stories client-side as 1080×1920 PNGs from completed workout data; sanitize content before rendering a single canvas for preview and export, use Web Share for browsers and cached files for Capacitor Share so private data is never uploaded or leaked by a separate export path. Optional linked-activity GPS geometry is rendered on that same canvas without map tiles; hiding location also excludes the geometry.

- Keep homemade drink-mix calculations in a pure, tested module and show nutrition tools in separate tab panels so ingredient arithmetic stays independent of menu generation.

- Keep Android launcher artwork in density-specific native resources, with matching adaptive and legacy icons; Android launchers cannot resolve CDN asset pointers.
- Use the shared GPX elevation chart in route details for uploaded and generated routes, computing cumulative kilometres from original GPX points to avoid distance loss from map simplification.