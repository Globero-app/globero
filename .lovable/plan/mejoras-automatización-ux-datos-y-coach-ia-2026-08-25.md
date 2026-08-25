# Mejoras: automatización, UX, datos y coach IA

## 1. Automatización (menos pasos manuales)

- Cron cada 15 min que revisa Strava/Intervals en el servidor y, si hay una actividad nueva que encaja con el entreno o competición del día, envía la pregunta de asignación por push/Telegram (hoy solo se pregunta al abrir la app).
- Auto-asignación con alta confianza (mismo día, misma duración ±20%, tipo de bici coincidente): se marca como completado y solo se avisa, con opción de deshacer.
- Un único registro de trabajos programados con bloqueo de ejecución para que no se dupliquen envíos ni asignaciones si dos ejecuciones coinciden.
- Recordatorio automático si el entreno del día sigue pendiente por la tarde.

## 2. UX y navegación

- Dashboard reorganizado como "hoy": readiness, entreno del día con acciones rápidas (completar, ajustar, rodillo/exterior), menú del día y carga actual, todo sin cambiar de pantalla.
- Barra inferior móvil reducida a 5 destinos reales + menú "Más" (hoy hay 9 secciones repartidas).
- Estados vacíos con acción directa ("aún no hay entrenos → generar semana") y skeletons en lugar de pantallas en blanco.
- Acciones destructivas y de cambio de modalidad con confirmación coherente y toast de deshacer.
- Búsqueda/filtros en Actividades y Entrenamientos (por fecha, estado, tipo).

## 3. Datos y análisis

- Pantalla Progreso ampliada: comparación prescrito vs ejecutado por semana (TSS, tiempo, cumplimiento) y tendencia de readiness superpuesta a la carga.
- Distribución de tiempo en zonas por semana y por bloque, para verificar el reparto polarizado real.
- Detalle de actividad con comparación paso a paso frente al entreno planificado.
- Exportación del informe mensual/anual en PDF descargable desde la app.

## 4. Coach IA y Telegram

- Resumen proactivo diario por el canal elegido: qué toca hoy, por qué y qué comer antes/después.
- Aviso cuando la fatiga se dispara (TSB muy negativo o readiness bajo sostenido) proponiendo descarga, con confirmación en un toque.
- Comandos rápidos en Telegram: /hoy, /semana, /menu, /ajustar, /readiness 4.
- Explicación "por qué este entreno" ampliada en la app, con los números que la IA ha usado.

## Orden sugerido

1. Cron de detección y asignación de actividades (mayor impacto inmediato).
2. Dashboard "hoy" y navegación móvil.
3. Prescrito vs ejecutado y zonas en Progreso.
4. Coach proactivo y comandos de Telegram.
5. Exportación PDF del informe.

## Detalles técnicos

- Nueva ruta `src/routes/api/public/hooks/activity-detect.ts` + cron pg_cron cada 15 min, con tabla `job_runs` (lease/bloqueo e idempotencia por `activity_id`).
- Reutiliza `strava-match.helpers.ts` y `notifyUser` para el envío por push/Telegram según `notify_channel`.
- Ampliación de `progress.server.ts` con series prescrito vs ejecutado y tiempo en zonas; nuevos gráficos en `/progreso`.
- Dashboard: reagrupar `src/routes/_authenticated/index.tsx` con las tarjetas existentes (`AdjustTodayCard`, readiness, menú, `TrainingLoadCard`).
- Telegram: mapa de comandos previo a la llamada a la IA en `telegram.server.ts`.
- PDF generado en cliente para evitar dependencias nativas en el runtime del servidor.
