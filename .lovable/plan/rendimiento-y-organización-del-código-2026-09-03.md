# Rendimiento y organización del código

## ¿Dividir en Backend y Frontend separados?

No conviene. Hoy todo es una sola app (TanStack Start): el "backend" ya está separado por archivos (`*.server.ts`, `*.functions.ts`, rutas `api/public/*`) y comparte tipos con el frontend. Partirlo en dos proyectos implicaría duplicar tipos, autenticación y despliegues: más lento de cambiar y más tokens por tarea, no menos.

Lo que sí reduce coste y tiempo por cambio es **modularizar dentro del mismo proyecto**: archivos pequeños y con una única responsabilidad, para que al pedir un cambio solo haya que leer/editar 100-200 líneas en vez de 1.000.

## 1. Trocear los archivos grandes (menos tokens por cambio)

- `entrenamientos.tsx` (995 líneas) → dividir en: lista de entrenos, panel de generación/preferencias, tarjeta de entreno y diálogos. La ruta queda como ensamblador (~120 líneas).
- `telegram.server.ts` (626) → separar en: parsing de intención, ejecución de acciones (modificar/eliminar/reprogramar) y envío de mensajes.
- `ftp-test.tsx` (557), `backend.tsx` (465), `perfil.tsx` (459), `competiciones.$id.tsx` (459), `workouts.functions.ts` (480) → misma idea: extraer secciones/pestañas a componentes propios.

Beneficio directo: cada petición futura toca 1-2 archivos pequeños.

## 2. Rendimiento en el navegador

- Carga diferida de lo pesado: mapa (Leaflet), gráficas (Recharts), exportadores GPX/FIT/ZWO y generación de PDF solo cuando se usan.
- Configurar caché de datos (`staleTime` por consulta) para evitar refetch continuo al cambiar de pantalla; hoy el router usa `defaultPreloadStaleTime: 0`.
- Precarga de rutas al pasar el ratón/tap en el menú.
- Revisar listas largas (actividades, entrenos) para paginar en servidor en vez de traer todo.

## 3. Rendimiento en servidor y base de datos

- Seleccionar solo columnas necesarias en las consultas (`select('...')` en lugar de `*`), sobre todo en actividades y entrenos.
- Índices en los filtros usados por los crons y pantallas: `workouts(user_id, scheduled_date)`, `daily_activities(user_id, start_date)`, `notification_log(user_id, created_at)`, `ai_usage_log(user_id, created_at)`.
- Agregados de uso de IA (pestaña Backend) calculados con SQL agregado en vez de traer filas.
- Crons: unificar consultas por usuario en una sola pasada y saltar usuarios sin actividad reciente.
- Limpieza automática de logs con más de 30-60 días.

## 4. Medición

Añadir tiempos de las funciones de servidor más usadas al log existente para saber qué optimizar después con datos reales.

## Orden propuesto

1. Índices + selects acotados + limpieza de logs (impacto inmediato, riesgo bajo).
2. Caché de consultas y carga diferida de librerías pesadas.
3. Troceado de `entrenamientos.tsx` y `telegram.server.ts`.
4. Resto de archivos grandes.

Sin cambios visibles de funcionalidad: misma app, más rápida y más barata de mantener.
