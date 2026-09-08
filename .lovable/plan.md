# Ficha individual del ciclista visible y editable en Perfil

Hoy la ficha individual ya se calcula sola (tipo real según la curva de potencia, techo de carga semanal, umbrales de frescura y readiness, días de recuperación) pero el ciclista no la ve ni puede ajustar sus preferencias. Este cambio la saca a la pantalla de Perfil, por usuario y sin afectar a nadie más.

## Qué verá el ciclista

Nuevo apartado "Mi ficha de entrenamiento" en Perfil, con dos partes:

**1. Lo que la app calcula sola (solo lectura)**
- Tipo de ciclista detectado por su curva de potencia (sprinter, rodador, escalador, contrarrelojista) junto al que él declaró.
- Sus mejores potencias de 5 s, 1 min, 5 min y 20 min, con los W/kg de 20 min.
- Techo de carga semanal que ya ha completado con buen cumplimiento.
- Umbrales personales de frescura y de readiness bajo.
- Días que tarda en recuperar tras una sesión dura y cada cuántas semanas le toca descarga.
- Cumplimiento medio por tipo de sesión, cuando hay datos suficientes.
- Fecha del último recálculo y botón "Recalcular ahora".
- Si aún no hay datos suficientes, cada dato muestra "aún sin datos" en lugar de un número inventado.

**2. Lo que el ciclista ajusta (editable y guardado)**
- Minutos disponibles para cada día de la semana (lunes a domingo); en blanco significa usar la duración objetivo general.
- Hora habitual de entreno.
- Tolerancia al rodillo: baja, media o alta.
- Terreno disponible: llano, montaña o mixto.
- Cadencia natural.

Al guardar, esas preferencias se aplican a los siguientes entrenamientos generados (duración de cada sesión según el día, uso de rodillo y terreno), sin regenerar los ya creados.

## Aislamiento entre usuarios

Cada ficha pertenece a un único usuario: leer, guardar y recalcular solo afecta a su propia fila y requiere estar identificado. No hay ninguna vista ni acción que toque las fichas de otros ciclistas.

## Detalles técnicos

- Nuevo `src/lib/athlete-profile.functions.ts` con tres server functions con `requireSupabaseAuth`:
  - `getAthleteProfile` — lee la fila de `athlete_profile` del usuario.
  - `saveAthletePreferences` — valida con Zod (`availability_minutes` 0-360 por día, `preferred_hour` 0-23, `indoor_tolerance` baja/media/alta, `terrain` llano/montaña/mixto, `natural_cadence` 50-120) y hace upsert por `user_id`; nunca escribe los campos derivados.
  - `recomputeAthleteProfile` — llama a `refreshAthleteProfile` (import dinámico dentro del handler) con `context.supabase` y `context.userId`.
- Nuevo `src/components/perfil/AthleteProfileSection.tsx`: React Query con `queryKey ['athlete-profile', user?.id]`, formulario de preferencias y panel de lectura; patrón auth-safe ya usado en el proyecto (esperar sesión, `enabled` por `user?.id`, sin reintentos sin sesión).
- `src/routes/_authenticated/perfil.tsx`: se añade la nueva `<Section>` tras "Perfil ciclista"; el resto del archivo no cambia.
- Sin migración: `athlete_profile` ya existe con RLS por `auth.uid()` y GRANTs.
- `refreshAthleteProfile` ya conserva las preferencias existentes al recalcular, así que guardar y recalcular no se pisan.
