import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandLayout, BRAND, h1, text, small } from './brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <BrandLayout preview="Tu código de verificación de Globero IA">
    <Heading style={h1}>Tu código de verificación</Heading>
    <Text style={text}>Introduce este código para confirmar la operación:</Text>
    <Text style={code}>{token}</Text>
    <Text style={small}>
      El código caduca en unos minutos. Si no has solicitado esta verificación, ignora este email.
    </Text>
  </BrandLayout>
)

const code = {
  fontSize: '30px',
  fontWeight: 700 as const,
  letterSpacing: '8px',
  color: BRAND.primary,
  margin: '0 0 12px',
}

export default ReauthenticationEmail
