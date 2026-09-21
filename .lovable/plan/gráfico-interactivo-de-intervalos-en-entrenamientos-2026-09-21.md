# Gráfico interactivo de intervalos en entrenamientos

## Implementación
- Sustituir la barra simple de zonas por un gráfico temporal interactivo dentro de cada tarjeta.
- Permitir alternar entre potencia y frecuencia cardíaca cuando el entrenamiento tenga objetivos para ambas métricas.
- Representar cada bloque con su duración, rango objetivo y color de zona; al tocar o pasar el cursor se mostrarán nombre, tiempo, objetivo y zona.
- Mantener una vista compacta en la tarjeta y reutilizar el mismo gráfico ampliado en el detalle del entrenamiento.
- Conservar la lista actual de bloques y las acciones existentes sin modificar la lógica de generación.

## Detalles técnicos
- Crear un componente específico para construir la serie escalonada desde `plan.steps` y las referencias FTP/LTHR/FC máxima.
- Usar los cálculos de zonas existentes para que colores, porcentajes y umbrales coincidan con Perfil.
- Adaptar el gráfico a móvil y escritorio, con estados vacíos cuando una métrica no esté disponible.
- Verificar compilación y renderizado de las tarjetas.
