# Migración completa a Intervals.icu (eliminar Strava)

Intervals.icu pasa a ser la única fuente de datos de la app. Strava desaparece del Perfil, de los procesos automáticos y de las pantallas.

## Qué cambia para ti

- En Perfil solo habrá una integración: Intervals.icu (Athlete ID + API Key). Desaparece la tarjeta de Strava y sus campos Client ID/Secret.
- Las actividades que aparecen en Inicio, Actividades, Calendario, Progreso y Competiciones vendrán de Intervals.icu.
- El FTP y la FC máx/umbral se estimarán con los datos de Intervals.icu (usa su eFTP y su histórico), igual que hasta ahora con el botón "Auto".
- La curva de potencia y la carga (CTL/ATL/TSB) se calcularán con el TSS real que ya calcula Intervals.icu, más preciso que la estimación actual desde Strava.
- La detección de entreno completado será única: cada 15 minutos se leen las actividades de Intervals.icu, se emparejan con el entreno del día y se pide confirmación o se marca completado automáticamente.
- Se pierde una función: renombrar la actividad en Strava con el nombre del entreno planificado. Pasará a renombrarse en Intervals.icu.

Importante: para que esto funcione, tu cuenta de Intervals.icu debe seguir recibiendo las actividades desde Strava/Garmin/Wahoo (esa conexión se hace dentro de Intervals.icu, no en esta app).

## Trabajo técnico

1. **Nueva fuente de actividades**
   - Crear tabla `intervals_activities` (id texto, user_id, name, type, start_date, moving_time, distance, elevation, avg_hr, avg_watts, icu_training_load, icu_intensity, raw jsonb) con GRANT + RLS por `auth.uid()`.
   - `src/lib/intervals-pull.server.ts`: función `syncIntervalsActivities` que hace upsert del histórico (hasta 365 días en la primera sincronización, 14 días en las periódicas).

2. **Sustituir lecturas de `strava_activities`** en: `training-load.server.ts`, `progress.server.ts`, `power-peaks.server.ts`, `workouts-gen.server.ts`, `ai.functions.ts`, `calendar.functions.ts`, `routes/_authenticated/index.tsx`, `actividades.index.tsx`, `actividades.$id.tsx`, `competiciones.$id.tsx`, `ftp-test.tsx`.
   - La carga usará `icu_training_load` real cuando exista, con la estimación actual como respaldo.

3. **Curva de potencia**: `power-peaks.server.ts` leerá los streams de potencia desde `/activity/{id}/streams` de Intervals.icu; `power_peaks.activity_id` pasa a texto y la relación con `strava_activities` se sustituye por `intervals_activities`.

4. **Estimación FTP / FC máx / LTHR**: nuevas funciones en `intervals.functions.ts` (`intervalsEstimateFtp`, `intervalsEstimateHr`) que reemplazan las de `strava.functions.ts`, usando `icu_ftp`/eFTP y el máximo de FC del histórico.

5. **Detección y emparejado**: unificar en `activity-detect.server.ts` sobre Intervals.icu (auto-asignar con ±20% de duración y modalidad coherente, si no notificación de confirmación). Renombrado del entreno vía `intervalsUpdateActivity`. `strava-match.functions.ts` y `StravaMatchPrompt.tsx` se renombran a la variante Intervals.

6. **Limpieza**
   - Eliminar `strava.server.ts`, `strava.functions.ts`, `strava-match.*`, el bloque de Strava en Perfil, el callback OAuth y las referencias en onboarding/notificaciones.
   - Migración: eliminar columnas `strava_*` de `profiles` y la tabla `strava_activities` (tras el volcado inicial desde Intervals).
   - Mantener los crons existentes cambiando su origen de datos; no se crean crons nuevos.

7. **Verificación**: build limpio, sincronización inicial contra Intervals, y revisión de Inicio, Actividades, Progreso y Entrenamientos con datos reales.
