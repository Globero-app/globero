# Corregir OAuth 2.0 de Intervals.icu

## Diagnóstico confirmado

- La configuración mostrada usa el `client_id` 802 y la URL `https://globero.app/auth/intervals/callback`, coherentes con el código actual.
- La autorización solicita scopes válidos: `ACTIVITY:WRITE,CALENDAR:WRITE,SETTINGS:WRITE,WELLNESS:WRITE`.
- El intercambio implementado coincide con la especificación oficial: `POST https://intervals.icu/api/oauth/token` con formulario `client_id`, `client_secret` y `code`, sin cabecera Authorization.
- El bloqueo observable está en producción: actualmente `https://globero.app/auth/intervals/callback` responde **404**, mientras el callback nuevo funciona en la versión local. Intervals.icu está regresando a una versión publicada que todavía no contiene el callback corregido.

## Implementación

1. Mantener la URL exacta registrada en Intervals.icu y el intercambio oficial, sin añadir Basic Auth, `grant_type`, `redirect_uri` ni scopes duplicados al POST del token.
2. Endurecer el callback para registrar de forma segura la fase y el código HTTP del fallo, sin registrar códigos, tokens ni secretos, y devolver al perfil un motivo distinguible (`state`, `configuration`, `token_exchange`, `profile_update`).
3. Asegurar que la respuesta oficial sin `refresh_token` se guarde correctamente y que el token Bearer quede asociado al usuario validado mediante el `state` firmado.
4. Publicar la versión corregida en `globero.app`; este paso es imprescindible porque esa es la URL registrada en Intervals.icu.
5. Verificar después de publicar que el callback ya no devuelve 404 y repetir una autorización completa con un código nuevo, que debe intercambiarse dentro de los 2 minutos exigidos por Intervals.icu.

## Comprobación externa

- Confirmar en Intervals.icu que la aplicación ya está aprobada y no figura como `Pending`; la documentación oficial indica que OAuth no funciona mientras esté pendiente. El estado “oculta para otros usuarios” de la captura no impide probarla con el propietario, pero “Pending” sí.
