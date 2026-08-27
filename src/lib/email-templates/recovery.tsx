import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandLayout, BrandButton, h1, text, small } from './brand'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <BrandLayout preview="Restablece tu contraseña de Globero IA">
    <Heading style={h1}>Restablecer contraseña</Heading>
    <Text style={text}>
      Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en Globero IA. Pulsa el
      botón para elegir una nueva contraseña.
    </Text>
    <BrandButton href={confirmationUrl}>Crear nueva contraseña</BrandButton>
    <Text style={small}>
      Si no has solicitado este cambio, ignora este email; tu contraseña actual seguirá siendo válida.
      El enlace caduca en poco tiempo por seguridad.
    </Text>
  </BrandLayout>
)

export default RecoveryEmail
