# Roadmap

- [x] Aviso claro y diálogo al bloquear nuevas creaciones, incluidas rutas y balizas; enlace directo a Perfil → Suscripción y Ajustes accesible. 11 pruebas correctas y compilación automática correcta.
- [ ] Verificar el aviso y la pestaña Suscripción con sesión real: no hay sesión disponible de la cuenta solicitante; requiere iniciar sesión en la vista previa.

- [x] Perfil: pestaña Suscripción reutiliza activación, portal de gestión/cancelación y consulta de estado. Bloqueo tras 30 días comprobado en generadores, menús de competición, sustituciones e importación; 21 pruebas correctas. Triggers activos verificados; Perfil/Ajustes no dependen de la suscripción.
- [ ] Verificación de pestaña Perfil y gestión Stripe con cuenta real: requiere sesión en la vista previa; prueba real de pago/publicación sigue pendiente en Fase 2.

- [x] Aviso preventivo desde el día 25 de prueba: aviso en la app con días restantes y acceso a Suscripción; excluye suscripción activa y concesión gratuita. 7 pruebas correctas y compilación automática correcta.
- [ ] Verificación del aviso con cuenta real: bloqueada porque no hay sesión disponible de la cuenta solicitante; requiere iniciar sesión en la vista previa.

- [x] David: corregidas 8 duraciones Hammerhead y eliminadas 9 copias confirmadas de Strava; vínculo e informe conservados. Guarda TSS y 21 pruebas correctas; pantalla autenticada muestra CTL 24, ATL 10 y TSB 14.

- [x] Hammerhead: cron incluye usuarios exclusivos y acepta X-Hmac-Signature; inicio real y milisegundos corregidos. Salida del 22/10 de David vinculada y entrenamiento completado, verificado en pantalla; 8 pruebas correctas.

- [x] Prioridad Wahoo: wahoo_508494826 vinculada al entrenamiento del 2026-10-21 de Miguel, completado con informe guardado; descartes por ID en app y cron, pruebas correctas.

- [ ] Fase 2 de suscripciones: campos y protección, prueba de 30 días, concesión administrativa, checkout/portal, webhook y guardia central implementados; precio mensual existente de Globero seleccionado. URL Stripe activa verificada; clave de firma guardada y evento firmado de diagnóstico sin cuenta aceptado en preview (200); 8 pruebas correctas. Bloqueado: publicar para desplegar la clave (producción aún devuelve 503), comprobar entrega real de Stripe y suscripción de extremo a extremo; pago real pendiente.

- [x] Salidas: tres tarjetas para Rutas, Garage y Baliza con acceso agrupado; enlaces verificados con cuenta real, sin desbordamiento móvil ni errores de página. Compilación automática correcta.

- [x] Nutrición: tres tarjetas con subvistas existentes y retorno a la pantalla principal; 9 pruebas correctas y compilación automática correcta. Verificación visual con cuenta pendiente de inicio de sesión en la vista previa.

- [x] Reintentos de IA: 429/503 reintentados con esperas 1s/2s/4s (respeta Retry-After) y error propagado al agotarlos; 4 pruebas nuevas y llamada real correcta.


- [x] Lote de optimización IA: menús solo para semana actual/siguiente, instrucciones breves y prompts fijos separados; 33 pruebas correctas, respuesta nutricional real de 7 días sin guardar planes y compilación automática correcta.

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
