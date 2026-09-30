import * as React from 'react'

import {
  Body,
  Button as REButton,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export const BRAND = {
  name: 'Globero IA',
  url: 'https://coach.globero.app',
  logo: 'https://coach.globero.app/icon-512.png',
  primary: '#e11d48',
  accent: '#0f172a',
}

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  margin: '0',
  padding: '0',
}
const container = { padding: '32px 24px', maxWidth: '560px', margin: '0 auto' }
const header = { textAlign: 'center' as const, marginBottom: '24px' }
const logo = { margin: '0 auto 12px', borderRadius: '14px' }
const brandName = {
  fontSize: '13px',
  letterSpacing: '3px',
  textTransform: 'uppercase' as const,
  color: BRAND.accent,
  fontWeight: 700 as const,
  margin: '0',
}
const card = {
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '28px 24px',
  backgroundColor: '#ffffff',
}
export const h1 = {
  fontSize: '24px',
  fontWeight: 700 as const,
  color: BRAND.accent,
  margin: '0 0 16px',
}
export const text = {
  fontSize: '15px',
  color: '#475569',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
export const small = {
  fontSize: '12px',
  color: '#94a3b8',
  lineHeight: '1.6',
  margin: '16px 0 0',
}
export const link = { color: BRAND.primary, textDecoration: 'underline' }
const buttonStyle = {
  backgroundColor: BRAND.primary,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700 as const,
  borderRadius: '10px',
  padding: '13px 26px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = {
  fontSize: '11px',
  color: '#94a3b8',
  textAlign: 'center' as const,
  margin: '24px 0 0',
  lineHeight: '1.6',
}

export const BrandButton = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <REButton style={buttonStyle} href={href}>
    {children}
  </REButton>
)

export const BrandLayout = ({
  preview,
  children,
}: {
  preview: string
  children: React.ReactNode
}) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src={BRAND.logo} width="56" height="56" alt={BRAND.name} style={logo} />
          <Text style={brandName}>{BRAND.name}</Text>
        </Section>
        <Section style={card}>{children}</Section>
        <Text style={footer}>
          <Link href={BRAND.url} style={link}>
            globero.app
          </Link>
          {' · '}Plataforma de IA para ciclistas
        </Text>
      </Container>
    </Body>
  </Html>
)
