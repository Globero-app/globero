import * as React from 'react'
import { Heading, Link, Text } from '@react-email/components'
import { BrandLayout, BrandButton, h1, text, small } from './brand'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ recipient, confirmationUrl }: SignupEmailProps) => (
  <BrandLayout preview="Bienvenido a Globero IA: confirma tu email para activar tu cuenta">
    <Heading style={h1}>Bienvenido a Globero IA</Heading>
    <Text style={text}>
      ¡Gracias por darte de alta en Globero IA! Confirma la dirección <strong>{recipient}</strong> para
      activar tu cuenta y empezar a entrenar con tu coach de IA.
    </Text>
    <BrandButton href={confirmationUrl}>Confirmar mi email</BrandButton>
    <Text style={text}>Tu cuenta incluye 30 días de prueba gratuita desde el registro, sin tarjeta. Nuestra web corporativa es <Link href="https://globero.app">globero.app</Link> y puedes acceder a tu cuenta en <Link href="https://coach.globero.app">coach.globero.app</Link>.</Text>
    <Text style={small}>
      Si no has creado ninguna cuenta, puedes ignorar este mensaje.
    </Text>
  </BrandLayout>
)

export default SignupEmail
