import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandLayout, BrandButton, h1, text, small } from './brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <BrandLayout preview="Tu enlace de acceso a Globero IA">
    <Heading style={h1}>Tu enlace de acceso</Heading>
    <Text style={text}>
      Pulsa el botón para entrar en Globero IA. No necesitas contraseña.
    </Text>
    <BrandButton href={confirmationUrl}>Acceder a Globero IA</BrandButton>
    <Text style={small}>Si no has solicitado este acceso, puedes ignorar este email.</Text>
  </BrandLayout>
)

export default MagicLinkEmail
