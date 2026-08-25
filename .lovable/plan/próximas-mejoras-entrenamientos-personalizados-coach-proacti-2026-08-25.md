# Próximas mejoras: entrenamientos personalizados, coach proactivo, salud e integraciones

## Objetivo

Elevar la app de "planificador semanal" a "coach digital completo": que entienda el perfil real del ciclista, anticipe su forma, cuide su recuperación y se integre con el ecosistema que ya usa (relojes, potenciómetros, plataformas virtuales).

## 1. Entrenamientos más personalizados

### 1.1 Perfil de ciclista tipológico
- Añadir al perfil: tipo de ciclista (sprinter, rodador, escalador, contrarrelojista) y puntos fuertes/débiles.
- La IA usará este perfil para sesgar la distribución de carga: más VO2max y sprints para sprinters, más Z3/Z4 sostenido para rodadores, más Z2 y repeticiones largas para escaladores.
- Guardar histórico de potencia/FC en subidas y tests para refinar el perfil automáticamente.

### 1.2 Ajuste por meteorología y viento
- Al generar el entreno del día, leer la previsión meteorológica (ya se usa en competiciones) y proponer:
  - hora de salida alternativa si hay viento > 25 km/h,
  - cambio a rodillo si llueve o hace frío extremo,
  - ruta larga en días de viento de cola.
- Guardar en el plan la condición meteorológica usada para la recomendación.

### 1.3 Planes de recuperación post-competición
- Tras una competición, detectar automáticamente la carga de la carrera (TSS real si hay Strava) y generar una semana de recuperación progresiva:
  - días 1-2: descanso o rodaje muy suave,
  - días 3-4: Z2 corta,
  - fin de semana: reintroducción progresiva de calidad.
- Permitir al usuario marcar una competición como "objetivo A" para que el tapering sea más agresivo.

### 1.4 Tests de referencia programados
- FTP/FC cada 4-6 semanas, pero también tests cortos (5 min, 1 min, 30 s) para perfilar sprinters.
- La IA propone cuándo hacerlos según TSB y bloque de entrenamiento.

## 2. Coach IA proactivo avanzado

### 2.1 Resumen semanal automatizado (domingos por la mañana)
- Antes de generar la semana, enviar un breve informe por Telegram/push con:
  - carga de la semana pasada vs. objetivo,
  - tendencia de readiness,
  - cambios que la IA va a aplicar (más carga, descanso, ajuste por fatiga).
- El usuario puede aprobar o pedir ajustes con un botón/toque.

### 2.2 Predicción de forma para eventos
- Con el bloque actual y la competición objetivo, calcular una proyección de CTL/TSB para la fecha de la carrera.
- Si la proyección muestra sobrecarga o forma baja, avisar con recomendaciones concretas.

### 2.3 Explicaciones en lenguaje natural
- Cada entreno debe incluir una frase del coach: "Hoy toca Z2 largo porque TSB es +8, estás fresco y la semana es de construcción".
- En el dashboard "Hoy", mostrar la justificación como tarjeta destacada.

### 2.4 Ajustes automáticos con confirmación
- Si readiness baja 2 días seguidos o TSB < -30, proponer recortar el entreno del día o cambiarlo por recuperación.
- El usuario confirma con un toque; si no responde en 30 min, se aplica automáticamente.

## 3. UX y salud

### 3.1 Modo sin conexión completo
- Cachear con Workbox/Service Worker los entrenos, menús y progreso para que funcionen sin red.
- Permitir marcar un entreno como completado offline y sincronizar al recuperar conexión.

### 3.2 Seguimiento de peso, sueño y fatiga muscular
- Nueva tabla `health_metrics` con peso, horas de sueño, HRV opcional y notas de fatiga.
- La IA usa estos datos para ajustar carga; por ejemplo, peso bajando + fatiga alta = semana de recuperación.

### 3.3 Accesos directos y widgets móvil
- Añadir accesos directos a "Hoy", "Readiness" y "Entrenos" desde la pantalla de inicio del móvil.
- Widget pequeño con el entreno del día y el readiness.

### 3.4 Entrada de voz para readiness y notas
- Permitir dictar el readiness o una nota post-entreno; transcribir con Lovable AI Gateway y guardar.

## 4. Integraciones y ecosistema

### 4.1 Garmin Connect y Wahoo (App User Connectors)
- Conectar Oura para sueño/HRV (ya hay documentación de connector).
- Evaluar Garmin Connect para sincronizar actividades y métricas de salud sin depender solo de Strava.
- Almacenar la clave de conexión cifrada en `app_user_connections`.

### 4.2 Zwift y plataformas virtuales
- Exportar entrenos en formato ZWO para importar directamente a Zwift, TrainerRoad o Rouvy.
- Detectar si el entreno es rodillo y ofrecer descargar el archivo `.zwo`.

### 4.3 Importar/exportar planes
- Exportar el plan semanal a CSV/ICS para calendarios externos.
- Importar un plan de TrainingPeaks o un archivo FIT/ZWO como base para una semana.

### 4.4 Sincronización bidireccional mejorada
- Que los cambios en Intervals.icu (completar o mover un entreno) se reflejen en la app, no solo al revés.
- Polling cada 15 min vía cron ya existente.

## Detalles técnicos

- Nuevas tablas: `cyclist_profile` (tipo, fortalezas), `health_metrics` (peso, sueño, fatiga), `app_user_connections` (para Oura/Garmin), `event_projections` (proyecciones CTL/TSB para competiciones).
- Nuevos server helpers: `src/lib/cyclist-profile.server.ts`, `src/lib/health.server.ts`, `src/lib/weather-adjuster.server.ts`, `src/lib/zwo-writer.ts` (ya existe, ampliar), `src/lib/weekly-briefing.server.ts`.
- Nuevas rutas/cron: `/api/public/hooks/weekly-briefing` (domingo 8h), ampliación del cron de Intervals para sincronización bidireccional.
- AI Gateway: usar `ai_gateway--create` o el helper existente para transcripción de voz y explicaciones del coach.
- App User Connectors: usar `connector_app_user--list_connectors` para Oura/Garmin; almacenar claves cifradas.

## Orden sugerido

1. Perfil tipológico + ajuste meteorológico (impacto inmediato en calidad de entrenos).
2. Resumen semanal del coach y explicaciones por sesión (más valor percibido).
3. Seguimiento de salud (peso/sueño/fatiga) y ajuste por readiness/fatiga (mejor recuperación).
4. Exportación ZWO y sincronización bidireccional con Intervals (mejor ecosistema).
5. Oura/Garmin y widgets móvil (capa premium de integración).
