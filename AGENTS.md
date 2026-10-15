# Architecture rules

- Keep homemade drink-mix calculations in a pure, tested module and show nutrition tools in separate tab panels so ingredient arithmetic stays independent of menu generation.

- Keep Android launcher artwork in density-specific native resources, with matching adaptive and legacy icons; Android launchers cannot resolve CDN asset pointers.
- Use the shared GPX elevation chart in route details for uploaded and generated routes, computing cumulative kilometres from original GPX points to avoid distance loss from map simplification.