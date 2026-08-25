# Integraciones y ecosistema: qué es posible hoy

## Respuesta corta

- **Garmin y Wahoo: NO se pueden hacer ahora.** Ambas exigen credenciales que solo ellos entregan:
  - Garmin Connect Developer Program (Health/Activity API): solicitud de acceso, revisión manual y firma de acuerdo. Sin `consumer key/secret` no hay integración posible.
  - Wahoo Cloud API: alta de app en su portal de desarrolladores y aprobación para obtener `client_id/client_secret`.
  Si consigues esas credenciales, se añaden como secretos y se implementa igual que Strava. Mientras tanto, Garmin y Wahoo ya llegan indirectamente: sus actividades se sincronizan a Strava e Intervals.icu, que sí están conectados.
- **Zwift (ZWO): ya está implementado** — la exportación `.zwo` existe y se usa en la pantalla de Entrenamientos.
- **Sincronización bidireccional con Intervals.icu: sí, se puede hacer ya.**
- **Import/export de planes: sí, se puede hacer ya.** El export ICS del calendario ya existe.

## Lo que se implementará

### 1. Sincronización bidireccional con Intervals.icu

Hoy la app solo empuja eventos hacia Intervals. Se añade la lectura inversa:

- Cron cada 15 min que, por cada usuario conectado, lee los eventos del calendario de Intervals de los próximos/últimos días.
- Si un evento vinculado a un entrenamiento de la app ha **cambiado de fecha** en Intervals, se actualiza `plan.scheduled_date` en la app.
- Si el evento ha sido **borrado** en Intervals, se marca el entrenamiento como cancelado (o se limpia el `intervals_event_id` según preferencia).
- Si la actividad ejecutada se asocia al evento planificado, se marca el entrenamiento como **completado** con TSS/IF real y adherencia, reutilizando la lógica ya existente de emparejamiento.
- Protección anti-bucle: se guarda una marca de última sincronización para no reescribir en Intervals lo que acaba de llegar de Intervals.

### 2. Exportar el plan semanal

En la pantalla de Entrenamientos, botón **Exportar**:
- **CSV**: fecha, título, tipo, duración, TSS previsto, resumen.
- **ICS**: ya existe para el calendario; se reutiliza filtrando solo entrenamientos.

### 3. Importar un plan externo

En Entrenamientos, botón **Importar plan**:
- Acepta **CSV** (mismo formato que el export) y **ZWO** (un archivo = un entrenamiento).
- Vista previa antes de confirmar: se muestran las sesiones detectadas y la fecha asignada.
- Al confirmar, se crean como entrenamientos de la app y se suben a Intervals.icu si hay conexión.

## Detalles técnicos

- Nuevo `src/lib/intervals-pull.server.ts`: `intervalsListEvents(creds, oldest, newest)` y `reconcileIntervalsEvents(supabase, userId)`.
- Nueva ruta cron `src/routes/api/public/hooks/intervals-sync.ts` (auth por header `apikey`, igual que los hooks existentes), programada cada 15 min con pg_cron.
- Campo nuevo en `plan` (jsonb, sin migración de esquema): `intervals_synced_at` para el control anti-bucle.
- Nuevo `src/lib/plan-io.ts`: `buildPlanCsv(workouts)`, `parsePlanCsv(text)`, `parseZwo(xml)`.
- Nuevas server functions en `src/lib/workouts.functions.ts`: `importWorkoutPlan` (valida con Zod, máximo 90 sesiones) y reutilización de `syncWorkoutEvent` para subirlas a Intervals.
- UI: menú desplegable "Importar / Exportar" en `src/routes/_authenticated/entrenamientos.tsx` con diálogo de vista previa.
- Garmin/Wahoo: no se toca nada hasta disponer de credenciales aprobadas.

## Orden

1. Sincronización bidireccional con Intervals.icu.
2. Exportar plan (CSV/ICS).
3. Importar plan (CSV/ZWO).
