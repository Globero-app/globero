# Informe automático del entrenamiento tras valorar el RPE

Cuando el usuario valora una actividad (RPE + sensaciones), la IA genera un informe breve comparando lo planificado con lo realmente ejecutado, y avisa por Push o Telegram según el canal configurado.

## Qué verás

1. Valoras la actividad (RPE/sensaciones) como hasta ahora.
2. En segundo plano se genera un informe corto con:
   - Cumplimiento (duración real vs planificada, intensidad/IF, TSS real vs previsto, RPE real vs esperado).
   - Detalles clave: distancia, desnivel, FC media, potencia media, reparto por zonas si hay datos.
   - Conclusión del coach en el contexto de tu fase de entrenamiento (bloque actual, CTL/ATL/TSB y readiness del día).
3. Aviso automático:
   - Canal Push: notificación "Informe del entrenamiento listo" que abre Entrenamientos.
   - Canal Telegram: mensaje con el informe completo, sin necesidad de entrar en la app.
   - Canal "ambos": aviso push + informe en Telegram.
4. En la pantalla Entrenamientos, la tarjeta del entrenamiento completado muestra un botón "Ver informe" con el texto generado y la fecha.

El tono y formato serán como el ejemplo aportado: breve, claro, con cumplimiento, desviaciones, detalles y conclusión.

## Trabajo técnico

- **Nuevo `src/lib/workout-report.server.ts`**
  - `buildWorkoutReport(supabase, userId, workoutId)`: reúne el workout (plan, `planned_tss`, `duration_minutes`), la actividad enlazada en `intervals_activities` (duración, distancia, desnivel, FC/potencia media, `icu_training_load`, `icu_intensity`), el RPE/feel de `daily_activities`, la carga (`buildTrainingLoad`), el bloque activo de `training_blocks` y el readiness del día.
  - Llama a la IA (mismo gateway y patrón que `coach.server.ts`) con un prompt que fija la estructura y la brevedad, y devuelve el texto.
  - `generateAndNotifyWorkoutReport(...)`: guarda el informe y envía el aviso.
- **Almacenamiento**: dentro de `workouts.plan` como `plan.report = { text, created_at }` (jsonb ya existente, sin migración).
- **Disparo**: en `saveActivityFeedback` (`src/lib/activity-feedback.functions.ts`), tras guardar RPE/feel, se localiza el workout cuyo `plan.strava_activity_id` coincide con la actividad y se genera el informe; si no hay workout enlazado, no se genera. Errores de IA se registran sin romper el guardado del feedback.
- **Aviso**: se usa `notifyUser` de `web-push.server.ts`, que ya enruta según `profiles.notify_channel`. Se añade la variante necesaria para que, en Telegram, el cuerpo sea el informe completo (`telegramSend`) y en push solo el aviso corto con `url: "/entrenamientos"`.
- **UI**: en `src/routes/_authenticated/entrenamientos.tsx`, en las tarjetas completadas con `plan.report`, botón "Ver informe" que abre un diálogo con el texto.
- Modelo IA: `google/gemini-3-flash-preview` (el ya usado en el proyecto), con límite de longitud en el prompt.
