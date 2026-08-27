import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandLayout, BrandButton, h1, text, small } from './brand'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <BrandLayout preview="Te han invitado a Globero IA">
    <Heading style={h1}>Te han invitado</Heading>
    <Text style={text}>
      Te han invitado a unirte a Globero IA, la plataforma de entrenamiento y nutrición con IA para
      ciclistas. Acepta la invitación para crear tu cuenta.
    </Text>
    <BrandButton href={confirmationUrl}>Aceptar invitación</BrandButton>
    <Text style={small}>Si no esperabas esta invitación, puedes ignorar este email.</Text>
  </BrandLayout>
)

export default InviteEmail
