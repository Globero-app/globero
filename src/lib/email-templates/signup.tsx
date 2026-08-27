import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandLayout, BrandButton, h1, text, small } from './brand'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ recipient, confirmationUrl }: SignupEmailProps) => (
  <BrandLayout preview="Confirma tu email para activar tu cuenta en Globero IA">
    <Heading style={h1}>Confirma tu email</Heading>
    <Text style={text}>
      ¡Gracias por darte de alta en Globero IA! Confirma la dirección <strong>{recipient}</strong> para
      activar tu cuenta y empezar a entrenar con tu coach de IA.
    </Text>
    <BrandButton href={confirmationUrl}>Confirmar mi email</BrandButton>
    <Text style={small}>
      Si no has creado ninguna cuenta, puedes ignorar este mensaje.
    </Text>
  </BrandLayout>
)

export default SignupEmail
