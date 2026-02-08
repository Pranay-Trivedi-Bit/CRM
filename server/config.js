const path = require('path');

module.exports = {
  port: process.env.PORT || 8080,
  dataDir: path.join(__dirname, '..', 'data'),
  // ============ WhatsApp Business API — Single Koenig Brand Account ============
  // All WhatsApp messages are sent from ONE Koenig Solutions business number.
  // Get credentials from: Meta Business Manager > WhatsApp > API Setup
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'sales_dashboard_verify',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    apiVersion: process.env.WA_API_VERSION || 'v21.0',
    brandName: 'Koenig Solutions',
    get baseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
    }
  },
  linkedinApiUrl: process.env.LINKEDIN_API_URL || 'https://linkedin-ads-dashboard.vercel.app/api/linkedin/leads?accountId=517988166&limit=500',

  // ============ Email / SMTP Configuration ============
  // Supports Microsoft 365, Gmail, SendGrid SMTP, Mailgun, or any SMTP provider.
  //
  // For Microsoft 365 (koenig-solutions.com):
  //   SMTP_HOST=smtp.office365.com   SMTP_PORT=587   SMTP_SECURE=false
  // For Gmail:
  //   SMTP_HOST=smtp.gmail.com       SMTP_PORT=587   SMTP_SECURE=false
  // For SendGrid SMTP:
  //   SMTP_HOST=smtp.sendgrid.net    SMTP_PORT=587   SMTP_USER=apikey   SMTP_PASS=<your-sendgrid-api-key>
  email: {
    smtpHost: process.env.SMTP_HOST || 'smtp.office365.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpSecure: (process.env.SMTP_SECURE || 'false') === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    defaultFrom: process.env.EMAIL_DEFAULT_FROM || 'noreply@koenig-solutions.com',
    defaultFromName: process.env.EMAIL_DEFAULT_FROM_NAME || 'Koenig Solutions',
    replyTo: process.env.EMAIL_REPLY_TO || '',
    enabled: (process.env.EMAIL_ENABLED || 'false') === 'true'
  }
};
