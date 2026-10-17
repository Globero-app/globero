# Roadmap

- [ ] Lote de optimización IA: menús solo para semana actual/siguiente, instrucciones breves y prompts fijos separados; pruebas y compilación.

- [x] intervals-sync-15min restringido a 06:30–23:30 Europe/Madrid, conservando intervalo y autenticación originales; límites y horario de invierno/verano comprobados.

- [x] Reducir comprobaciones: beacon-watchdog pausado sin balizas vigentes y reactivación por cambios; actividad cada 15 minutos; readiness solo invoca notificaciones en franjas configuradas. Reglas verificadas en PostgreSQL.

- [x] Trazado GPS opcional de la actividad vinculada en las tarjetas compartibles. Mostrar/ocultar, privacidad de ubicación y descarga PNG 1080×1920 verificados con cuenta real; 14 pruebas correctas.

- [x] Privacidad de tarjetas: ocultar trazado GPS, ubicación y métricas; ocultar ubicación excluye también el trazado. PNG privado y restauración verificados con cuenta real.

- [x] Etapa 12: tarjetas story de entrenamientos completados, récords e insignias; compartir y descargar PNG. Descarga 1080×1920 y selección de insignia verificadas con cuenta real; compartir nativo pendiente de dispositivo.

- [x] Etapa 8: calculadora de mezclas caseras y vistas separadas de Menús, Avituallamiento y Mezclas en Nutrición; 9 pruebas correctas. Comprobación con cuenta pendiente de acceso.

- [x] Pantalla "Resumen semanal": km, horas, vatios medios, desnivel y carga (TSS) por semana con comparativa.
- [x] Ficha de ciclista por usuario en Perfil: curva de potencia, techo de carga, umbrales de frescura y preferencias editables.
- [x] Corregir subida GPX y mostrar fuentes de agua cercanas en el mapa y la descarga (radio 200 m).
- [x] Reorganizar «Más» por grupos e integrar «Resumen semanal» como pestaña de Progreso.
- [x] Convertir los grupos del menú en desplegables y ajustar la navegación inferior.

- [ ] i18n: traducir el resto de pantallas (secciones internas de Perfil: notificaciones, conexiones, ficha de atleta; Inicio, Nutrición, Rutas, Calendario, Readiness, Mi Bici, Backend, registro/acceso), avisos Push/Telegram, emails y contenido de la portada por idioma. Hecho: Perfil (datos, ciclista, meteo, nutrición, readiness), Progreso, selector, preferencia guardada, menú, portada, Entrenamientos e IA en el idioma del usuario.
- [x] Botones de conexión Wahoo (OAuth) y Garmin ("Próximamente") en Ajustes
- [x] Enviar entrenamientos a Wahoo y calcular informes/gráficos con sus actividades cuando no haya Intervals.icu
- [x] Corregir actualización directa de entrenamientos y zonas en Wahoo sin Intervals.icu
- [ ] Garmin Connect: código listo; se activa al añadir GARMIN_CLIENT_ID y GARMIN_CLIENT_SECRET (bloqueado: aprobación de Garmin)
- [x] Hammerhead Karoo: OAuth, envío FIT, webhook y actividades (pendiente claves)
