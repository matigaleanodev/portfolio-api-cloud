import { Resend } from 'resend';
import type { ContactConfiguration } from './config.js';
import type { ContactDto } from './contact.dto.js';

export interface ContactEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export type SendEmail = (email: ContactEmail) => Promise<void | { error: unknown }>;

export function createContactSender(
  config: ContactConfiguration,
  sendEmail: SendEmail,
  now = () => new Date(),
) {
  return async (dto: ContactDto): Promise<void> => {
    const timestamp = now().toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const text = `
          Nuevo mensaje de contacto

          Nombre: ${dto.name}
          Email: ${dto.email}
          Fecha: ${timestamp}

          Mensaje:
          ${dto.message}
          `.trim();
    const result = await sendEmail({
      from: config.fromEmail,
      to: config.toEmail,
      subject: 'Nuevo mensaje desde el portfolio',
      text,
    });
    if (result?.error) throw new Error('Contact provider failed');
  };
}

export function createResendProvider(config: ContactConfiguration): SendEmail {
  const resend = new Resend(config.apiKey, {
    baseUrl: 'https://api.resend.com',
    userAgent: 'portfolio-api-cloud',
  });
  return (email) => resend.emails.send(email);
}
