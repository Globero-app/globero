# Corregir el aviso falso de "Rampa de carga alta"

## Qué comprueba hoy

El aviso se dispara cuando la "rampa" supera el 25%. La rampa compara la carga de la semana actual con la media de las 3 semanas anteriores, pero el cálculo solo tiene en cuenta las semanas **en las que hubo alguna actividad**: las semanas sin entrenar simplemente no existen en la serie.

Consecuencias comprobadas con tus datos (semanas con actividad: 6 jul, 13 jul, 20 jul, 3 ago, 24 ago, 31 ago; esta semana, ninguna):

- Si no entrenas esta semana, la "semana actual" que usa el cálculo es en realidad una semana antigua, así que la comparación no corresponde a las fechas reales.
- Al saltarse las semanas vacías, las "3 semanas previas" pueden ser de hace un mes o más.
- Además, a principios de semana la comparación es injusta: dos días de carga se comparan contra semanas completas.

Por eso llega un aviso diario que no refleja la realidad.

## Cambios propuestos

1. Serie semanal por calendario: construir las últimas 6 semanas reales, rellenando con 0 las semanas sin actividad, para que "semana actual" y "3 semanas previas" sean siempre las fechas correctas.
2. Rampa solo con contexto suficiente:
   - No calcular rampa si la media de las 3 semanas previas es muy baja (por debajo de ~100 TSS), donde cualquier variación produce porcentajes enormes.
   - No calcular rampa si la carga de la semana actual es insignificante (prácticamente sin entrenar).
3. Evaluar la rampa solo cuando la semana está avanzada (a partir del viernes), o comparándola con la semana completa anterior ya cerrada, en lugar de una semana a medias.
4. Evitar el envío diario repetido: no volver a notificar la misma alerta (mismo tipo) si ya se envió en los últimos 7 días; se seguirá guardando en el historial de alertas, pero sin push/Telegram repetido.

## Detalles técnicos

- `src/lib/training-load.server.ts`: reconstruir `weekly` con semanas continuas (zero-fill) desde el lunes de hace 5 semanas hasta el lunes actual; `currentWeek` toma el valor de la semana actual real; `last3` son las 3 semanas de calendario anteriores. Añadir umbrales mínimos antes de devolver `ramp_pct` (si no, `null`).
- `src/lib/coach.server.ts`: en `evaluateAlerts`, añadir la condición de día de la semana para `ramp_high`; en `runCoachAlerts`, consultar `coach_alerts`/`notification_log` de los últimos 7 días y filtrar los tipos ya notificados antes de llamar a `notifyUser`.
- Añadir tests en `src/lib/__tests__/training-load.test.ts`: semana sin entrenar → `ramp_pct` null o negativo; base baja → null.
