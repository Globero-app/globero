# Propuestas de mejora para Globero IA

Tres perspectivas. El usuario elige cuáles implementar (se pueden marcar varias).

## A. Diseñador — Experiencia y aspecto

1. **Refactor visual de Entrenamientos** (la pantalla más grande, 1000+ líneas): separar en pestañas "Esta semana / Próximas / Historial", tarjetas más limpias con la estructura de la sesión en vista previa (barras de zonas tipo Intervals.icu) y acciones claras (rodillo, aplazar, eliminar).
2. **Dashboard con mejor jerarquía**: un único "Hero" con el entreno de hoy + readiness + clima, y lo demás (carga, próximos eventos, mantenimiento de bici) como tarjetas secundarias colapsables.
3. **Estados vacíos y skeletons**: pantallas con loaders de esqueleto (no spinners) y estados vacíos con ilustración y acción ("Conecta Intervals.icu", "Crea tu primera competición").
4. **Modo "día de carrera"**: vista especial automática para el día de competición con clima, recordatorio de nutrición y botón de GPX.

## B. Programador — Robustez y técnica

5. **Suite de tests mínima** para la lógica crítica: validador de entrenamientos, cálculo de carga (CTL/ATL/TSB), escritor FIT/ZWO y formateo de pasos para Intervals.icu — es donde más regresiones hemos corregido.
6. **Sistema de notificaciones unificado**: cola con reintentos y registro de envíos (Push/Telegram) con pantalla de historial para diagnosticar "no me llegó el aviso".
7. **Página de estado de sincronización**: última sync de Intervals.icu, actividades detectadas, errores recientes, botón "forzar sync".
8. **Auditoría de errores**: agrupar errores de server functions y mostrarlos en `/backend` con contadores.

## C. Entrenador — Contenido deportivo

9. **Semana tipo adaptable**: si falla/salta una sesión, el plan re-distribuye la carga automáticamente en los días restantes (hoy solo se adapta la sesión individual).
10. **Tests de FTP/FC automáticos programados**: sugerir test cada 6-8 semanas y actualizar umbrales + zonas tras analizar el resultado.
11. **Gráfico de proyección de forma**: "si sigues el plan, tu CTL estimado el día de la carrera será X", visible en la pantalla de competición.
12. **Biblioteca de entrenos base**: catálogo de sesiones clásicas (2x20, sweet spot, VO2 30/30…) que la IA usa como bloques en vez de generar todo desde cero (más consistencia).

## Propuesta de ejecución

Recomendado empezar por: **1 (rediseño Entrenamientos) + 5 (tests) + 9 (redistribución de carga)** — mayor impacto en uso diario con riesgo controlado.

El usuario indica qué números implementar y en qué orden.
