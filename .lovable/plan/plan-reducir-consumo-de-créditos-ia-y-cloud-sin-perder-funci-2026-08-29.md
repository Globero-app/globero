# Plan: Reducir consumo de créditos IA y Cloud sin perder funcionalidades

Objetivo: bajar el gasto mensual de **AI Gateway** y **Cloud** manteniendo todas las funciones actuales (generación de entrenos, nutrición, coach, Telegram, informes, sync Intervals.icu).

## Estado actual (verificado)

- Todas las llamadas IA usan `google/gemini-3-flash-preview` (src/lib/ai.functions.ts, readiness, workouts-gen, nutrition-gen, workouts.functions).
- Crons activos: sync/detección Intervals cada 15 min, generación semanal domingos, briefing diario, readiness horario.
- Logs nuevos (`notification_log`, `sync_log`, `error_log`) crecen sin límite → consumo de base de datos.

## 1. AI Gateway — menos tokens por llamada

1. **Modelo por tarea**: clasificación simple (intención Telegram, matching de actividades, detección de feedback) pasa a `gemini-3.1-flash-lite` (más barato). Generación de entrenos/nutrición/informes se queda en Flash actual.
2. **Prompts más cortos**: recortar contexto enviado (perfil + solo 4 semanas de carga en vez de historial completo), pedir JSON estricto sin texto extra.
3. **Sin IA donde no hace falta (reglas deterministas)**:
   - Readiness 1-5: aplicar ajuste de volumen/intensidad con reglas (ya definidas) y solo llamar a la IA para redactar el texto.
   - Conversión a rodillo y "volver a exterior": cálculo directo sin IA.
4. **Caché de briefing diario**: no regenerar si perfil/entreno del día no han cambiado (guardar hash del input).
5. **Informe post-entreno**: solo generar si la actividad tiene datos de potencia/FC suficientes; si no, resumen determinista.

## 2. Cloud — menos invocaciones y datos

6. **Polling Intervals.icu de 15 min → 30 min**, y **skip si el usuario no tiene actividad reciente** ni entrenos próximos (consulta barata primero).
7. **Briefing/readiness: una sola ejecución por usuario/día** (guardar `last_brief_date` y evitar reenvíos duplicados).
8. **Limpieza automática de logs**: borrado semanal (cron) de `notification_log`, `sync_log`, `error_log` con más de 30 días.
9. **Índices** en columnas consultadas por los crons (`workouts.user_id+scheduled_date`, `activities.user_id+start_date`) para abaratar queries.
10. **Sincronización incremental**: pedir a Intervals solo actividades nuevas (`oldest` = última fecha sincronizada) en vez de rangos amplios.

## 3. Medición

11. Añadir en **Estado** un contador simple de llamadas IA del mes (tabla `ai_usage_log`: fecha, función, modelo) para ver dónde se gasta y confirmar el ahorro.

## Cambios técnicos

- `src/lib/ai.functions.ts`: selector de modelo por tipo de tarea + helper de caché.
- `src/lib/readiness.server.ts`, `workouts-gen.server.ts`, `nutrition-gen.server.ts`, `coach.server.ts`, `telegram.server.ts`: prompts recortados, modelo lite en clasificación, reglas deterministas.
- `src/routes/api/public/hooks/intervals-sync.ts` y `activity-detect.ts`: intervalo 30 min + skip inteligente + sync incremental.
- Migración: índices + cron de limpieza de logs + tabla `ai_usage_log`.

Sin cambios visibles de funcionalidad; el usuario solo notará menor consumo.
