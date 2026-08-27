# Web pública, alta de usuarios y recuperación de contraseña

## 1. Nueva web pública en "/"

Hoy la dirección raíz muestra directamente el panel privado. Pasará a mostrar una web de presentación de Globero con:

- Cabecera con el logo, nombre y botón "Acceder" (lleva al login).
- Sección principal (titular, subtítulo, texto y botón).
- Bloques de contenido (características / cómo funciona / texto libre), cada uno con título, texto e icono opcional.
- Pie con enlace a la Política de Privacidad.

El panel privado del ciclista pasa de "/" a "/app". Tras iniciar sesión el usuario va a /app; el resto de secciones (perfil, entrenamientos, etc.) no cambian de dirección. Los enlaces internos del menú y el logo apuntarán a /app.

## 2. Contenido editable desde Backend

Se crea una nueva pestaña "Web pública" dentro de /backend (solo administradores) para editar:

- Titular, subtítulo y texto del bloque principal.
- Texto del botón de acceso.
- Lista de bloques: añadir, editar, reordenar y eliminar.
- Texto del pie.
- Contenido completo de la Política de Privacidad (editor de texto por secciones).

Todo se guarda en base de datos, así que los cambios se ven al instante sin tocar código.

## 3. Página de Política de Privacidad

Ruta pública "/privacidad" con el contenido guardado en base de datos, enlazada desde el pie de la web pública, del login y del alta.

## 4. Alta de usuarios

En el login se añade "¿No tienes cuenta? Date de alta" → ruta "/registro" con: Nombre y Apellido, Email, Contraseña (y repetir contraseña), aceptación de la política de privacidad y botón "Dar de alta".

Al pulsar:
- Se crea la cuenta con el nombre completo guardado en el perfil.
- El usuario recibe un email de confirmación con un enlace.
- Al pulsar el enlace queda activado y puede acceder.
- Mensaje en pantalla: "Revisa tu correo para confirmar el alta".

Los emails saldrán con el remitente por defecto de la plataforma (sin dominio propio). Si más adelante quieres emails con tu marca, se puede configurar un dominio tuyo.

## 5. Recuperar contraseña

En el login se añade "¿Olvidaste tu contraseña?" → ruta "/recuperar": solo email y botón Enviar.

- Si el email existe: se envía el enlace de recuperación y se informa en pantalla.
- Si no existe: se muestra "Este email no pertenece a ningún usuario activo".
- El enlace lleva a "/reset-password", donde se introduce la nueva contraseña y se guarda.

## Detalles técnicos

- Rutas nuevas: `src/routes/index.tsx` (landing pública, SSR), `src/routes/privacidad.tsx`, `src/routes/registro.tsx`, `src/routes/recuperar.tsx`, `src/routes/reset-password.tsx`.
- `src/routes/_authenticated/index.tsx` se renombra a `src/routes/_authenticated/app.tsx` (evita el conflicto de dos rutas en "/"); se actualizan `AppShell` (NAV "/" → "/app", enlaces del logo), `auth.tsx` (redirect a /app), y cualquier `navigate({ to: "/" })` interno.
- Migración: tabla `site_content` (clave, tipo, título, cuerpo, orden, activo) + `privacy_content`, o una única tabla `site_content` con `section` para landing/privacidad. GRANT SELECT a `anon` y `authenticated`; escritura solo con `has_role(auth.uid(),'admin')`. RLS activada.
- Lectura pública mediante server function con cliente publishable (sin admin) para SSR y SEO.
- Alta: `supabase.auth.signUp` con `emailRedirectTo: window.location.origin + "/app"` y `options.data.full_name`; el trigger `handle_new_user` ya rellena `profiles.full_name` y el rol `user`. Se mantiene la confirmación por email desactivando auto-confirm.
- Recuperación: server function pública que comprueba la existencia del email en `profiles` (respuesta booleana, sin exponer datos) y, si existe, `resetPasswordForEmail` con `redirectTo: origin + "/reset-password"`. Rate-limit básico por email.
- `head()` propio con título, descripción y OG en cada ruta pública nueva.
- Validación de formularios con zod (nombre, email, contraseña mínima).

## Nota de seguridad

Confirmar si un email existe permite enumerar cuentas. Como lo has pedido explícitamente, se implementará así, pero con mensaje genérico en errores de envío y limitación de intentos.
