# Corregir definitivamente OAuth de Intervals.icu

## Diagnóstico confirmado

- La autorización y los permisos mostrados por Intervals.icu son correctos.
- La documentación oficial exige intercambiar el código en menos de 2 minutos mediante `POST https://intervals.icu/api/oauth/token`, enviando `client_id`, `client_secret` y `code` como formulario.
- El botón usa siempre `https://globero.app/auth/intervals/callback`, incluso desde preview.
- Actualmente, el dominio publicado responde `404` tanto en `/auth/intervals/callback` como en `/api/public/intervals/callback`; por tanto, las correcciones recientes solo están en preview y el retorno OAuth está entrando en una versión publicada anterior/inexistente.

## Cambios

1. **Unificar el callback**
   - Procesar directamente el retorno de Intervals.icu en `/auth/intervals/callback`, sin llamada intermedia a una función protegida por la sesión del navegador.
   - Mantener exactamente esa URL para que coincida con la registrada en Intervals.icu.

2. **Intercambiar el código según la documentación oficial**
   - Ejecutar el POST desde backend con `application/x-www-form-urlencoded`.
   - Enviar únicamente `client_id`, `client_secret` y `code`.
   - No enviar cabecera `Authorization` ni exponer el secreto al navegador.

3. **Identificar al usuario sin depender de la sesión del callback**
   - Mantener un `state` firmado y temporal generado antes de salir hacia Intervals.icu.
   - Validar firma y caducidad en el callback antes de guardar datos.
   - Comparar la firma de forma segura y rechazar estados inválidos o vencidos.

4. **Guardar y finalizar la conexión**
   - Guardar `access_token`, `athlete.id`, estado OAuth y datos de expiración disponibles en el perfil identificado por el `state` validado.
   - Redirigir a `/perfil?intervals=success` y mostrar el mensaje de éxito; devolver un error legible si Intervals.icu rechaza el intercambio.
   - Eliminar el flujo protegido anterior para evitar que vuelva a producir `Unauthorized: No authorization header provided`.

5. **Publicar y verificar**
   - Publicar la nueva versión, requisito imprescindible porque Intervals.icu redirige siempre a `globero.app`, no al preview.
   - Verificar que `https://globero.app/auth/intervals/callback` ya no devuelve 404 y completar una conexión real desde el botón hasta el estado “Conectado”.

## Detalles técnicos

- Scopes: `ACTIVITY:WRITE,CALENDAR:WRITE,SETTINGS:WRITE,WELLNESS:WRITE` (`WRITE` ya incluye lectura).
- El callback no dependerá de `requireSupabaseAuth`; su autorización será el `state` firmado, de corta duración y vinculado al usuario.
- No se registrarán ni devolverán el código OAuth, el token ni el secreto.
