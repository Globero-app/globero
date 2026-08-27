import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandLayout, BrandButton, h1, text, small } from './brand'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({ oldEmail, newEmail, confirmationUrl }: EmailChangeEmailProps) => (
  <BrandLayout preview="Confirma el cambio de email en Globero IA">
    <Heading style={h1}>Confirma tu nuevo email</Heading>
    <Text style={text}>
      Has solicitado cambiar el email de tu cuenta de Globero IA de <strong>{oldEmail}</strong> a{' '}
      <strong>{newEmail}</strong>. Confirma el cambio con el botón siguiente.
    </Text>
    <BrandButton href={confirmationUrl}>Confirmar cambio</BrandButton>
    <Text style={small}>Si no has pedido este cambio, ignora este email y revisa tu contraseña.</Text>
  </BrandLayout>
)

export default EmailChangeEmail
