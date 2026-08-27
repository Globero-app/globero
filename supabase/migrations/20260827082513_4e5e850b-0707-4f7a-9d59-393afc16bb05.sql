CREATE TABLE public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('landing','privacy')),
  block_key text NOT NULL,
  block_type text NOT NULL DEFAULT 'text',
  title text,
  subtitle text,
  body text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section, block_key)
);

GRANT SELECT ON public.site_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO authenticated;
GRANT ALL ON public.site_content TO service_role;

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_content_public_read" ON public.site_content
  FOR SELECT TO anon, authenticated USING (active = true);

CREATE POLICY "site_content_admin_all" ON public.site_content
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER site_content_updated_at BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.site_content (section, block_key, block_type, title, subtitle, body, icon, sort_order) VALUES
('landing','hero','hero','Globero IA','Plataforma de IA para ciclistas','Entrenamientos personalizados, nutrición semanal, readiness diario y análisis de tus actividades. Todo conectado con Intervals.icu.','Bike',0),
('landing','cta','cta','Acceder',NULL,'Entra a tu panel y empieza a entrenar mejor.',NULL,1),
('landing','feature_1','feature','Entrenamientos con IA',NULL,'Planes generados según tu FTP, FC máxima, tus días disponibles y tu carga de entrenamiento (CTL/ATL/TSB).','Dumbbell',10),
('landing','feature_2','feature','Readiness diario',NULL,'Cada mañana indicas cómo te encuentras y la IA adapta el entreno del día automáticamente.','HeartPulse',11),
('landing','feature_3','feature','Nutrición semanal',NULL,'Menús adaptados a tus entrenos, preferencias e intolerancias, con enfoque especial antes de competición.','UtensilsCrossed',12),
('landing','feature_4','feature','Sincronización Intervals.icu',NULL,'Tus entrenos se envían a Intervals.icu y tus actividades vuelven con análisis, curva de potencia y cumplimiento.','Activity',13),
('landing','footer','text','Globero IA',NULL,'Plataforma de IA para ciclistas.',NULL,90),
('privacy','intro','text','Política de Privacidad',NULL,'Esta política describe cómo Globero IA trata los datos personales de las personas usuarias de la aplicación.',NULL,0),
('privacy','responsable','text','Responsable del tratamiento',NULL,'Globero IA es responsable del tratamiento de los datos facilitados por la persona usuaria a través de la aplicación.',NULL,1),
('privacy','datos','text','Datos que tratamos',NULL,'Datos de cuenta (nombre y apellidos, email), datos deportivos (peso, altura, FTP, frecuencia cardíaca, zonas, actividades, entrenamientos, readiness) y datos técnicos necesarios para el funcionamiento del servicio (notificaciones push, integraciones con Intervals.icu y Telegram).',NULL,2),
('privacy','finalidad','text','Finalidad',NULL,'Los datos se utilizan para crear y ajustar planes de entrenamiento y nutrición, analizar las actividades y enviar avisos relacionados con el servicio.',NULL,3),
('privacy','terceros','text','Terceros',NULL,'Se comparten datos únicamente con los servicios necesarios para el funcionamiento: proveedor de base de datos y autenticación, Intervals.icu y, si la persona usuaria lo activa, Telegram.',NULL,4),
('privacy','derechos','text','Derechos',NULL,'Puedes solicitar el acceso, la rectificación, la supresión y la portabilidad de tus datos, así como la limitación u oposición al tratamiento, escribiendo al contacto indicado en la aplicación.',NULL,5),
('privacy','conservacion','text','Conservación',NULL,'Los datos se conservan mientras la cuenta esté activa. Al eliminar la cuenta se eliminan los datos asociados.',NULL,6);