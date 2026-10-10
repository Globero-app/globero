# Architecture rules

- Keep Android launcher artwork in density-specific native resources, with matching adaptive and legacy icons; Android launchers cannot resolve CDN asset pointers.
- Use the shared GPX elevation chart in route details for uploaded and generated routes, computing cumulative kilometres from original GPX points to avoid distance loss from map simplification.