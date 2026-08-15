import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { verificationTemplate } from './templates/verification.template';
import { dailyReportTemplate } from './templates/daily-report.template';

const ADMIN_EMAILS = ['youssefd.business@gmail.com', 'faisal.m.alenzai@gmail.com'];

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'thanarah.com',
      port: 465,
      secure: true, // SSL
      auth: {
        user: 'ai@thanarah.com',
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false, // allow self-signed certs on shared hosting
      },
    });
  }

  /** Send email verification link to a new user */
  async sendVerificationEmail(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const appUrl = process.env.APP_URL || 'https://thanarah.com';
    const verifyLink = `${appUrl}/auth/verify-email?token=${token}`;
    const html = verificationTemplate(firstName, verifyLink);

    try {
      await this.transporter.sendMail({
        from: '"ثنارة AI" <ai@thanarah.com>',
        to,
        subject: 'تحقق من بريدك الإلكتروني — ثنارة AI',
        html,
      });
      this.logger.log(`✅ Verification email sent to ${to}`);
    } catch (err) {
      this.logger.error(`❌ Failed to send verification email to ${to}: ${err.message}`);
      // Non-fatal: user can request resend
    }
  }

  /** Send daily stats report to all admins */
  async sendDailyReport(data: {
    date: string;
    stats: {
      requestsToday: number;
      inputTokensToday: number;
      outputTokensToday: number;
      failedToday: number;
    };
    newUsers: Array<{ name: string; email: string; createdAt: Date }>;
    suspiciousUsers: Array<{ name: string; email: string; reason: string }>;
    heavyUsers: Array<{ name: string; email: string; tokens: number; requests: number }>;
  }): Promise<void> {
    const html = dailyReportTemplate(data);

    for (const admin of ADMIN_EMAILS) {
      try {
        await this.transporter.sendMail({
          from: '"ثنارة AI — تقرير يومي" <ai@thanarah.com>',
          to: admin,
          subject: `📊 التقرير اليومي — ${data.date}`,
          html,
        });
        this.logger.log(`✅ Daily report sent to ${admin}`);
      } catch (err) {
        this.logger.error(`❌ Failed to send daily report to ${admin}: ${err.message}`);
      }
    }
  }

  /** Generic send for future use */
  async send(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: '"ثنارة AI" <ai@thanarah.com>',
      to,
      subject,
      html,
    });
  }
}
