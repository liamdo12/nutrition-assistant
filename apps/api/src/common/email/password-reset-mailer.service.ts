import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { AppConfig } from '../../config/app.config';

interface SendPasswordResetEmailInput {
  readonly toEmail: string;
  readonly toName: string;
  readonly token: string;
  readonly expiresAt: Date;
}

@Injectable()
export class PasswordResetMailerService {
  private readonly logger = new Logger(PasswordResetMailerService.name);
  private smtpTransport: Transporter | null = null;
  private resendClient: Resend | null = null;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
    const provider = this.configService.get('EMAIL_PROVIDER', { infer: true });
    const from = this.configService.get('EMAIL_FROM', { infer: true });
    const resetUrl = this.buildResetUrl(input.token);
    const subject = 'Reset your Nutrition Assistant password';
    const text = this.buildTextBody({
      recipientName: input.toName,
      resetUrl,
      expiresAt: input.expiresAt,
    });
    const html = this.buildHtmlBody({
      recipientName: input.toName,
      resetUrl,
      expiresAt: input.expiresAt,
    });

    if (provider === 'smtp') {
      const transport = this.getSmtpTransport();
      await transport.sendMail({
        from,
        to: input.toEmail,
        subject,
        text,
        html,
      });
      return;
    }

    if (provider === 'resend') {
      const resend = this.getResendClient();
      await resend.emails.send({
        from,
        to: input.toEmail,
        subject,
        text,
        html,
      });
      return;
    }

    const maskedEmail = this.maskEmail(input.toEmail);
    this.logger.warn(
      `EMAIL_PROVIDER=log -> password reset requested for ${maskedEmail} (expires ${input.expiresAt.toISOString()})`,
    );
  }

  private getSmtpTransport(): Transporter {
    if (this.smtpTransport) {
      return this.smtpTransport;
    }

    const host = this.configService.get('SMTP_HOST', { infer: true });
    const port = this.configService.get('SMTP_PORT', { infer: true });
    const user = this.configService.get('SMTP_USER', { infer: true });
    const pass = this.configService.get('SMTP_PASS', { infer: true });
    const secure = this.configService.get('SMTP_SECURE', { infer: true });

    if (!host || !port || !user || !pass) {
      throw new InternalServerErrorException('SMTP configuration is incomplete');
    }

    this.smtpTransport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    return this.smtpTransport;
  }

  private getResendClient(): Resend {
    if (this.resendClient) {
      return this.resendClient;
    }

    const apiKey = this.configService.get('RESEND_API_KEY', { infer: true });
    if (!apiKey) {
      throw new InternalServerErrorException('RESEND_API_KEY is missing');
    }

    this.resendClient = new Resend(apiKey);
    return this.resendClient;
  }

  private buildResetUrl(token: string): string {
    const baseUrl = this.configService.get('APP_BASE_URL', { infer: true }).replace(/\/+$/, '');
    return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private buildTextBody(input: {
    recipientName: string;
    resetUrl: string;
    expiresAt: Date;
  }): string {
    return [
      `Hi ${input.recipientName},`,
      '',
      'You requested to reset your Nutrition Assistant password.',
      `Open this link to reset your password: ${input.resetUrl}`,
      '',
      `This link expires at ${input.expiresAt.toISOString()}.`,
      'If you did not request this, you can ignore this email.',
    ].join('\n');
  }

  private buildHtmlBody(input: {
    recipientName: string;
    resetUrl: string;
    expiresAt: Date;
  }): string {
    return `
      <p>Hi ${this.escapeHtml(input.recipientName)},</p>
      <p>You requested to reset your Nutrition Assistant password.</p>
      <p><a href="${this.escapeHtml(input.resetUrl)}">Reset your password</a></p>
      <p>This link expires at ${this.escapeHtml(input.expiresAt.toISOString())}.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) {
      return '***';
    }

    if (localPart.length <= 2) {
      return `**@${domain}`;
    }

    return `${localPart.slice(0, 1)}***${localPart.slice(-1)}@${domain}`;
  }
}
