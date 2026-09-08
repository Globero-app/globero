# Entrenamientos más profesionales y 100% individualizados

Objetivo: que cada ciclista reciba un plan que responda a SU historia, SU respuesta al entreno y SUS preferencias, en lugar de un plan semanal genérico modulado solo por carga.

## 1. Perfil de entrenamiento propio de cada usuario

Nueva ficha por usuario (tabla `athlete_profile`) que la app mantiene sola:

- Disponibilidad real por día de la semana (minutos máximos lunes a domingo), en vez de una única duración para todas las sesiones.
- Preferencias: hora habitual de entreno, tolerancia a rodillo, terreno disponible (llano/montaña), cadencia natural.
- Perfil de rendimiento medido: mejores potencias de 5 s, 1 min, 5 min y 20 min de la curva de potencia, ratio W/kg y ratio anaeróbico/aeróbico → de ahí se deduce automáticamente si es sprinter, rodador o escalador, en lugar de que el usuario lo elija a mano.
- Respuesta individual al entreno: cuánto sube su forma por cada punto de carga, y cuántos días tarda en recuperar tras una sesión dura (se calcula con su histórico de readiness y RPE).

## 2. Progresión individual, no reglas fijas para todos

Hoy la progresión usa límites iguales para cualquier usuario. Se pasa a:

- Techo de carga semanal personal, calculado con las mejores semanas que el ciclista ya ha completado con buen cumplimiento (no un +5-8% teórico).
- Ratio de descarga propio: si su readiness cae siempre en la 3ª semana, su ciclo pasa a 2:1; si aguanta, 4:1.
- Duración de cada sesión ajustada al día concreto según su disponibilidad, en vez de la misma duración para todas.
- Semana de recuperación disparada por SUS umbrales personales de TSB y readiness (percentiles de su propio histórico), no por valores fijos.

## 3. Calidad técnica de las sesiones

- Objetivo fisiológico explícito por sesión (VO₂máx, umbral, tempo, resistencia, neuromuscular, fuerza-resistencia) y no solo "mixto".
- Estructura de intervalos coherente: relación trabajo/recuperación correcta por objetivo, series y repeticiones con progresión mes a mes (p. ej. 4×4 → 5×4 → 5×5).
- Distribución polarizada comprobada sobre el tiempo real en zona de toda la semana, con corrección automática si se pasa de intensidad.
- Regla de espaciado: nunca dos sesiones de alta intensidad seguidas, mínimo 48 h entre sesiones del mismo sistema energético.
- Tirada larga con estructura propia (bloques de tempo o subidas al final si el bloque es de construcción).

## 4. Aprendizaje continuo por ciclista

- Tras cada sesión completada se guarda el desvío entre lo prescrito y lo ejecutado, y el RPE frente al esperado.
- Si repetidamente no llega a los objetivos, se bajan sus targets automáticamente; si los supera, se suben, por tipo de sesión (puede fallar en VO₂ y cumplir en Z2).
- Detección de FTP/LTHR desfasados a partir de sus esfuerzos reales, con aviso para actualizar.
- Sesiones que suele saltarse (día u hora concretos) pierden peso en la planificación futura.

## 5. Transparencia para el ciclista

- Cada entreno muestra en una línea por qué se ha planificado así (carga, frescura, objetivo del bloque, cumplimiento reciente).
- En Entrenamientos, resumen de la semana: objetivo fisiológico, carga prevista y reparto por zonas.

## Detalles técnicos

- Migración: tabla `athlete_profile` (disponibilidad por día, preferencias, perfil de rendimiento derivado, umbrales personales) con RLS por `auth.uid()` y GRANTs; columnas nuevas en `workouts` para el objetivo fisiológico y el desvío por sistema energético.
- Nuevo `src/lib/athlete-profile.server.ts`: deriva tipo de ciclista y umbrales personales desde `power_peaks`, `readiness_entries` e `intervals_activities`.
- `src/lib/training-load.server.ts`: techo de carga y umbrales por percentiles del propio usuario en vez de constantes.
- `src/lib/workout-validator.server.ts`: validación de estructura de intervalos, espaciado por sistema energético, duración por día disponible y reparto polarizado real.
- `src/lib/workouts-gen.server.ts`: pasa el nuevo bloque de perfil individual al prompt y aplica los límites numéricos calculados; el cron dominical hereda todo.

## Orden sugerido

1. Perfil individual derivado (tipo real + disponibilidad por día).
2. Progresión y descarga con umbrales personales.
3. Objetivo fisiológico y validación de estructura de intervalos.
4. Aprendizaje por tipo de sesión y detección de FTP desfasado.
5. Resumen semanal y explicación por sesión.
