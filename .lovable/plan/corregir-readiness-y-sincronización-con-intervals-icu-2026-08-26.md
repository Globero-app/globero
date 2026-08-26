# Corregir Readiness y sincronización con Intervals.icu

## Cambios
- Aplicar exactamente esta lógica: 1 propone eliminar, 2 reduce la sesión, 3 conserva el entrenamiento sin modificarlo, y 4–5 lo adaptan al alza.
- Recalcular duración y TSS cuando cambien los pasos, guardar el entrenamiento actualizado y sincronizar esa misma versión completa con Intervals.icu.
- Endurecer la actualización de Intervals.icu para que regenere la estructura del entrenamiento cuando cambia la descripción/pasos y comunicar si la sincronización falla.
- Al confirmar un Readiness 1, eliminar primero el evento de Intervals.icu y después el entrenamiento de la aplicación; mantener el diálogo de confirmación.
- Invalidar todas las consultas relacionadas con entrenamientos del día tras adaptar o eliminar.
- Aplicar las mismas reglas al flujo equivalente de Telegram para evitar resultados distintos según el canal.

## Verificación
- Comprobar los cinco valores de Readiness: 1 no borra sin confirmación; 2 reduce; 3 no altera; 4–5 modifican pasos.
- Verificar que actualización y eliminación quedan reflejadas tanto en la base de datos como en Intervals.icu.
- Revisar compilación y flujo visible de la pantalla Readiness.

## Detalles técnicos
- Conservar `scheduled_date` e `intervals_event_id` al generar el plan adaptado.
- Sincronizar usando la fila devuelta por `UPDATE ... SELECT`, no una copia parcial previa.
- Tratar la sincronización externa como parte obligatoria de la operación y devolver su estado a la interfaz.
