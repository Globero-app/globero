# Mejoras de entrenamientos con impacto real para el ciclista

Hoy el plan ya es individual (carga CTL/ATL/TSB, ficha de atleta, bloque de 4 semanas, tiempo, cumplimiento). Estas mejoras atacan lo que todavía falta.

## 1. Ajuste diario, no solo semanal
El plan se decide al generarlo y apenas se mueve. Se añade un repaso automático cada mañana:
- Si el readiness del día es bajo o la fatiga alta, la sesión del día se suaviza (menos series, más Z2) y la carga perdida se reparte al resto de la semana.
- Si llega un día claramente mejor de lo previsto, se puede recuperar la sesión de calidad aplazada.
- Aviso corto por push/Telegram: "Hoy bajamos intensidad, mañana recuperamos el bloque de umbral".

## 2. Entrenos que se reprograman solos
Si un entreno se salta (no aparece actividad ese día), hoy simplemente queda pendiente.
- Se marca como no realizado al día siguiente y se reubica automáticamente en un día libre de la misma semana, si lo hay.
- Si no cabe, se recorta la semana manteniendo la sesión más importante en lugar de acumular deuda.

## 3. Biblioteca de sesiones con progresión real
La IA inventa la estructura cada semana, lo que produce saltos raros.
- Catálogo fijo de sesiones por objetivo (VO₂, umbral, tempo, resistencia, neuromuscular, fuerza-resistencia) con progresión definida (4x4 → 5x4 → 5x5 → 4x6).
- La IA elige qué sesión toca y la personaliza; no inventa los números.
- Resultado: progresión coherente mes a mes y menos variabilidad rara.

## 4. Test de forma automático
- Cada 6-8 semanas se programa sola una sesión de test (20 min o 2x8) dentro del plan.
- Si el histórico ya muestra esfuerzos por encima del FTP actual, se propone subir el umbral antes del test.
- El cambio de FTP se aplica con confirmación y recalcula zonas y objetivos.

## 5. Sesión de la tirada larga con estructura
La tirada larga hoy es "Z2 largo".
- Según el bloque, incorpora bloques de tempo, subidas al final o simulación de competición.
- Si hay ruta creada para ese día, la sesión se adapta al desnivel y duración real del GPX.

## 6. Explicación y control para el usuario
- En cada entreno, una línea de "por qué hoy toca esto" (carga, frescura, objetivo del bloque).
- Botones rápidos en la tarjeta: "hoy no puedo", "tengo menos tiempo", "quiero más caña" → el plan se reajusta sin regenerar toda la semana.
- Resumen semanal con tiempo en cada zona frente al reparto objetivo (polarización real).

## 7. Informes más útiles
- Comparar la sesión con la última del mismo tipo (mejor/peor, misma potencia con menos pulsaciones).
- Detectar deriva cardiaca y señalar fatiga acumulada o buena forma.
- Aviso cuando tres sesiones seguidas del mismo objetivo se quedan cortas: los targets bajan solos.

## Detalles técnicos
- Nuevo `src/lib/daily-adjust.server.ts` llamado desde el cron de detección: relee readiness/TSB y aplica el ajuste del día reutilizando `week-rebalance.server.ts`.
- Nuevo `src/lib/session-library.ts`: plantillas por `energy_system` con niveles de progresión; `workouts-gen.server.ts` pasa la plantilla elegida a la IA y `workout-validator.server.ts` valida contra ella.
- `workouts.status` gana el estado "skipped" y una reubicación automática en el hook diario.
- `athlete-profile.server.ts` guarda la fecha del último test y dispara la programación del siguiente.
- `workout-report.server.ts` añade comparativa con sesión previa del mismo `session_goal` y deriva cardiaca desde los datos de Intervals.icu.
- `weekly-summary.server.ts` añade tiempo en zona real vs objetivo.

## Orden sugerido
1. Ajuste diario + reprogramación de entrenos saltados (lo que más se nota).
2. Biblioteca de sesiones con progresión.
3. Botones de ajuste rápido y explicación por sesión.
4. Test de forma automático y detección de FTP desfasado.
5. Informes comparativos y tiempo en zona.
