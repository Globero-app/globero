# Entrenamientos más inteligentes y progresivos

Objetivo: que el generador deje de ser "una IA con texto libre" y pase a trabajar con métricas reales de carga, adherencia y readiness, con progresión semana a semana.

## 1. Motor de carga de entrenamiento (nuevo cálculo previo a la IA)

Antes de llamar a la IA se calcula en el servidor, a partir de Strava (90 días) y de los entrenos completados:

- TSS estimado por actividad (por potencia si hay vatios, si no por FC/duración).
- CTL (forma, media 42 días), ATL (fatiga, 7 días) y TSB (frescura = CTL - ATL).
- Rampa semanal: carga de las últimas 4 semanas y variación %.
- Adherencia: % de entrenos planificados que se completaron en los últimos 28 días.
- RPE medio y desvío RPE vs. intensidad prescrita (si el RPE real es mayor que el esperado, el ciclista va sobrecargado).
- Readiness: media 7 y 14 días y tendencia.

Estos números se inyectan en el prompt como un bloque de "ESTADO ACTUAL DEL CICLISTA" y, sobre todo, se usan para fijar reglas duras.

## 2. Reglas duras de carga (no las decide la IA)

El servidor calcula el TSS objetivo de la semana y se lo impone a la IA:

- Progresión máxima +5-8% de TSS semanal sobre la media de las 3 semanas previas.
- Ciclo 3:1 — cada 4ª semana es de descarga (-35-40% de carga).
- Si TSB < -25 o readiness medio 7d <= 2.5 o adherencia < 60%: semana de recuperación automática.
- Si TSB > +10 y readiness medio >= 4: semana de choque (bloque de calidad extra).
- Reparto polarizado 80/20 sobre el tiempo total de la semana.

## 3. Validación y corrección determinista del plan devuelto

Hoy se confía en lo que devuelve la IA. Se añade un validador que, antes de guardar:

- Ajusta la suma de duraciones a la duración objetivo (±10%).
- Recalcula watts/ppm desde FTP/LTHR con las zonas del perfil (la IA solo elige zona, no números sueltos).
- Verifica calentamiento y vuelta a la calma, y que no haya dos días duros seguidos.
- Calcula el TSS real de cada sesión y lo compara con el objetivo semanal; si se pasa, recorta el bloque de intervalos.

## 4. Aprendizaje continuo

- Al completar un entreno (Strava/Intervals), se guarda la ejecución real: TSS, IF, tiempo en zona y cumplimiento vs. lo prescrito.
- Ese histórico "prescrito vs. ejecutado" alimenta la siguiente generación: si el ciclista no llega a los targets de forma repetida, se bajan; si los supera, se suben.
- Detección de FTP/LTHR desfasados: si hay esfuerzos por encima del umbral actual, se propone actualizar (con aviso, no en silencio).

## 5. Progresión por bloques, no por semanas sueltas

- El plan semanal deja de nacer aislado: se guarda un "bloque de entrenamiento" (4 semanas) con foco (base, construcción, pico) y la generación del domingo continúa ese bloque.
- Con competición asignada, la periodización se ancla a la fecha del evento (base → construcción → pico → tapering) en lugar de decidirse en cada llamada.

## 6. Transparencia para el usuario

- En cada entreno: por qué se ha planificado así (carga actual, readiness, progresión) en una línea.
- En la pantalla de Entrenamientos: gráfico simple de CTL/ATL/TSB y la carga prevista de la semana.

## Detalles técnicos

- Nuevo `src/lib/training-load.server.ts`: cálculo de TSS/CTL/ATL/TSB, adherencia y tendencias de readiness.
- Nuevo `src/lib/workout-validator.server.ts`: normalización de steps, recálculo de targets desde zonas y ajuste de duración/TSS.
- `src/lib/workouts-gen.server.ts`: consume ambos, pasa límites numéricos a la IA y valida la salida.
- Migración: tabla `training_blocks` (bloque de 4 semanas, foco, semana actual) y columnas de ejecución real en `workouts` (`planned_tss`, `actual_tss`, `actual_if`, `compliance`).
- El cron dominical usa el mismo núcleo, así que hereda todas las mejoras.

## Orden sugerido

1. Motor de carga + reglas duras (mayor impacto inmediato).
2. Validador determinista del plan.
3. Registro prescrito vs. ejecutado y ajuste automático.
4. Bloques de 4 semanas y periodización anclada a competición.
5. Visualización de carga y explicación por sesión.
