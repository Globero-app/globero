# Aviso meteorológico diario junto al entreno del día

## Qué pasa hoy

La meteorología solo se consulta **una vez por semana**, cuando la IA genera los entrenamientos (domingo). Después no se vuelve a mirar el tiempo: el aviso de cada mañana con la sesión del día no incluye ninguna comprobación meteorológica, por eso ayer/hoy no llegó ningún aviso pese a la alerta por inundaciones.

Además, la búsqueda de la población se hace solo por nombre y sin país. Tu perfil tiene "Sentmenat" y el campo país está vacío, así que la búsqueda puede caer en una localidad distinta con nombre parecido. Y solo se miran datos de previsión (lluvia, viento, temperatura); no se consultan los avisos oficiales, que es lo que marca una alerta por inundaciones.

## Qué haré

1. **Comprobación meteorológica cada mañana**, dentro del mismo envío que ya te manda la sesión del día: primero la sesión, e inmediatamente después el aviso del tiempo si procede (app y/o Telegram, según tu perfil).
2. **Avisos oficiales**: además de la previsión, se consultarán los avisos oficiales vigentes para tu zona (nivel amarillo/naranja/rojo por lluvia, viento, tormenta, calor/frío). Si hay aviso naranja o rojo, se recomienda directamente rodillo o suspender la salida.
3. **Localización correcta**: la búsqueda de la población usará el país del perfil, y guardaré las coordenadas encontradas junto al nombre resuelto para que puedas ver qué localidad se ha detectado. En Perfil se mostrará "Detectado: Sentmenat, España" y, si no encaja, podrás corregirlo.
4. **Sin duplicados**: un solo aviso al día por usuario, y no se envía nada si las condiciones son buenas.
5. **Rellenar el país** de los perfiles existentes que estén vacíos, para no repetir el fallo de localización.

## Detalle técnico

- Nuevo `src/lib/weather-alerts.server.ts`: resuelve ciudad+país a lat/lon (Open-Meteo Geocoding con `country_code`), consulta previsión del día y avisos oficiales de MeteoAlarm (feed CAP por país/región) y devuelve `{ level, headline, indoor, message }`.
- Cachear en `profiles` las coordenadas resueltas (`location_lat`, `location_lon`, `location_resolved`) mediante migración; evita geocodificar cada día.
- Enganche en el hook diario existente (`src/routes/api/public/hooks/readiness-push.ts` / `src/lib/coach.server.ts`), enviando el aviso meteorológico como segundo mensaje tras el resumen del día, con dedupe diario vía `notification_log`.
- Reutilizar `adviseForWorkout` para los umbrales del usuario (viento, lluvia, temperatura) y combinarlo con el nivel del aviso oficial (naranja/rojo prevalece).
- `src/components/perfil/...` en la sección Meteorología: mostrar la localidad detectada y el estado actual de avisos.
