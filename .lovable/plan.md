# Gráfico PMC con proyección en Progreso

## Objetivo

Convertir la curva actual de carga en un gráfico PMC completo que muestre Fitness (CTL), Fatiga (ATL) y Forma (TSB), incluyendo una proyección de 6 semanas basada en los entrenamientos futuros planificados de cada usuario.

## Cambios

- Ampliar los datos de Progreso para calcular, día a día:
  - Histórico real desde la carga de las actividades de Intervals.icu.
  - Proyección futura usando el TSS planificado de los entrenamientos pendientes.
  - CTL y ATL mediante sus medias exponenciales de 42 y 7 días, y TSB como CTL − ATL.
- Marcar cada punto como real o proyectado y devolver la fecha de inicio de la proyección.
- Actualizar el gráfico de Progreso para:
  - Mantener líneas continuas en el histórico y usar líneas discontinuas en la proyección.
  - Mostrar CTL, ATL y TSB con información diaria al pasar por encima.
  - Señalar visualmente “Hoy” y sombrear el periodo proyectado.
  - Mantener una lectura clara en móvil y escritorio.
- Mantener los indicadores actuales de CTL, ATL y TSB basados únicamente en el día actual, no en el final de la proyección.

## Validación

- Comprobar que un usuario sin entrenamientos futuros sigue viendo el PMC y una evolución natural hacia menor fatiga.
- Comprobar que los entrenamientos planificados afectan la proyección en sus fechas y con su TSS correspondiente.
- Verificar el gráfico en escritorio y móvil, además de la compilación.

## Detalles técnicos

- La proyección será de 42 días desde hoy.
- Los entrenamientos futuros usarán `planned_tss`; si falta, se estimará desde sus bloques, umbrales y duración.
- El punto de hoy se compartirá entre las series reales y proyectadas para evitar cortes visuales.
