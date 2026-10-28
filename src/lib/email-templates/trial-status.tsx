import { Heading, Text } from "@react-email/components";
import { BrandButton, BrandLayout, h1, text } from "./brand";
import type { TemplateEntry } from "./registry";
import { SUBSCRIPTION_EMAIL_URL } from "../trial-email";

interface Props { name?: string; trialEnd?: string; expired?: boolean }

function TrialStatusEmail({ name, trialEnd, expired = false }: Props) {
  const title = expired ? "Tu prueba gratuita ha finalizado" : "Tu cuenta alcanza el día 25 de prueba";
  return <BrandLayout preview={title}>
    <Heading style={h1}>{title}</Heading>
    <Text style={text}>{name ? `Hola, ${name}.` : "Hola."} {expired
      ? "Han finalizado los 30 días de prueba gratuita de tu cuenta en Globero IA."
      : "Quedan 5 días de tu prueba gratuita de 30 días en Globero IA."}</Text>
    {trialEnd && <Text style={text}>Fecha de finalización: {trialEnd}.</Text>}
    <Text style={text}>Puedes seguir consultando tus datos y acceder a Perfil y Ajustes. Sin una suscripción activa, la creación de nuevos entrenamientos y menús no estará disponible después de la prueba.</Text>
    <Text style={text}>Puedes consultar el estado de tu cuenta y gestionar tu suscripción de forma segura mediante Stripe en nuestra web.</Text>
    <BrandButton href={SUBSCRIPTION_EMAIL_URL}>Ver mi suscripción</BrandButton>
  </BrandLayout>;
}

export const day25Template = {
  component: (props: Props) => <TrialStatusEmail {...props} expired={false} />,
  subject: "Tu prueba gratuita termina en 5 días — Globero IA",
  displayName: "Cuenta: día 25 de prueba",
  previewData: { name: "Miguel", trialEnd: "02/11/2026" },
} satisfies TemplateEntry;

export const expiredTemplate = {
  component: (props: Props) => <TrialStatusEmail {...props} expired />,
  subject: "Tu prueba gratuita ha finalizado — Globero IA",
  displayName: "Cuenta: fin de prueba",
  previewData: { name: "Miguel", trialEnd: "02/11/2026" },
} satisfies TemplateEntry;