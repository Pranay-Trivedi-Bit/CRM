const fs = require('fs');
const path = require('path');
const config = require('../config');

const templatesDir = path.join(config.dataDir, 'email-templates');

function ensureDir() {
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
}

function generateId() {
  return 'tmpl_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6);
}

function getAll() {
  ensureDir();
  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(templatesDir, f), 'utf8'));
    return {
      id: data.id,
      name: data.name,
      subject: data.subject,
      isPrebuilt: data.isPrebuilt || false,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  });
}

function getById(id) {
  ensureDir();
  const filePath = path.join(templatesDir, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function save(template) {
  ensureDir();
  const now = new Date().toISOString();
  if (!template.id) {
    template.id = generateId();
    template.createdAt = now;
  }
  template.updatedAt = now;
  fs.writeFileSync(path.join(templatesDir, `${template.id}.json`), JSON.stringify(template, null, 2));
  return template;
}

function remove(id) {
  const filePath = path.join(templatesDir, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function seedDefaults() {
  ensureDir();
  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
  if (files.length > 0) return;

  const defaults = [
    {
      name: 'Welcome Email',
      subject: 'Welcome to {{company}}!',
      isPrebuilt: true,
      htmlContent: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#6366f1,#a78bfa);padding:40px 30px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:28px;">Welcome!</h1>
</td></tr>
<tr><td style="padding:30px;">
<p style="color:#333;font-size:16px;line-height:1.6;">Hi {{name}},</p>
<p style="color:#333;font-size:16px;line-height:1.6;">Thank you for joining us. We're excited to have you on board!</p>
<p style="color:#333;font-size:16px;line-height:1.6;">Get started by exploring our platform and discovering what we have to offer.</p>
<table cellpadding="0" cellspacing="0" style="margin:30px 0;"><tr><td style="background:#6366f1;border-radius:6px;padding:12px 30px;">
<a href="{{cta_url}}" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;">Get Started</a>
</td></tr></table>
<p style="color:#666;font-size:14px;">Best regards,<br>The {{company}} Team</p>
</td></tr>
<tr><td style="background:#f8f9fa;padding:20px;text-align:center;">
<p style="color:#999;font-size:12px;margin:0;">You received this email because you signed up at {{company}}.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
    },
    {
      name: 'Product Announcement',
      subject: 'Introducing {{product_name}} - You\'ll Love This!',
      isPrebuilt: true,
      htmlContent: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#f59e0b,#f97316);padding:40px 30px;text-align:center;">
<p style="color:#ffffff;margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:2px;">New Launch</p>
<h1 style="color:#ffffff;margin:0;font-size:32px;">{{product_name}}</h1>
</td></tr>
<tr><td style="padding:30px;">
<p style="color:#333;font-size:16px;line-height:1.6;">Hi {{name}},</p>
<p style="color:#333;font-size:16px;line-height:1.6;">We're thrilled to announce our latest product that will transform the way you work.</p>
<div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0;">
<h3 style="color:#333;margin:0 0 10px;">Key Features:</h3>
<ul style="color:#555;font-size:14px;line-height:1.8;padding-left:20px;">
<li>Feature one description</li>
<li>Feature two description</li>
<li>Feature three description</li>
</ul>
</div>
<table cellpadding="0" cellspacing="0" style="margin:30px 0;"><tr><td style="background:#f59e0b;border-radius:6px;padding:12px 30px;">
<a href="{{cta_url}}" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;">Learn More</a>
</td></tr></table>
</td></tr>
<tr><td style="background:#f8f9fa;padding:20px;text-align:center;">
<p style="color:#999;font-size:12px;margin:0;">{{company}} | <a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
    },
    {
      name: 'Newsletter',
      subject: '{{company}} Newsletter - {{month}} Update',
      isPrebuilt: true,
      htmlContent: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1a1a2e;padding:30px;text-align:center;">
<h1 style="color:#a78bfa;margin:0;font-size:24px;">{{company}} Newsletter</h1>
<p style="color:#c4b5fd;margin:8px 0 0;font-size:14px;">{{month}} Edition</p>
</td></tr>
<tr><td style="padding:30px;">
<p style="color:#333;font-size:16px;line-height:1.6;">Hi {{name}},</p>
<p style="color:#333;font-size:16px;line-height:1.6;">Here's what's new this month:</p>
<div style="border-left:4px solid #a78bfa;padding:15px;margin:20px 0;background:#f8f7ff;">
<h3 style="color:#333;margin:0 0 8px;">Highlight of the Month</h3>
<p style="color:#555;font-size:14px;margin:0;line-height:1.6;">Share your main highlight or announcement here. This section is perfect for your most important update.</p>
</div>
<h3 style="color:#333;margin:25px 0 10px;">Quick Updates</h3>
<ul style="color:#555;font-size:14px;line-height:2;padding-left:20px;">
<li>Update item one</li>
<li>Update item two</li>
<li>Update item three</li>
</ul>
<table cellpadding="0" cellspacing="0" style="margin:30px 0;"><tr><td style="background:#a78bfa;border-radius:6px;padding:12px 30px;">
<a href="{{cta_url}}" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;">Read More</a>
</td></tr></table>
</td></tr>
<tr><td style="background:#f8f9fa;padding:20px;text-align:center;">
<p style="color:#999;font-size:12px;margin:0;">{{company}} | <a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
    }
  ];

  // Auto-acknowledgment template — sent from CSM email
  defaults.push({
    name: 'Auto-Acknowledge (from CSM)',
    subject: 'Thank you for your interest, {{name}}!',
    isPrebuilt: true,
    htmlContent: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#6366f1,#a78bfa);padding:30px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;">Thank You!</h1>
<p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Your dedicated advisor is here to help</p>
</td></tr>
<tr><td style="padding:30px;">
<p style="color:#333;font-size:16px;line-height:1.6;">Hi {{name}},</p>
<p style="color:#333;font-size:16px;line-height:1.6;">Thank you for your interest! I'm <strong>{{csm_name}}</strong>, your dedicated Customer Success Manager at Koenig Solutions. I'll be personally assisting you on your learning journey.</p>
<p style="color:#333;font-size:16px;line-height:1.6;">I'd love to understand your requirements better and help you find the perfect training program. Feel free to reply to this email or schedule a call at your convenience.</p>
<div style="background:#f0f0ff;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #6366f1;">
<h3 style="color:#333;margin:0 0 8px;font-size:14px;">Your CSM Contact Details</h3>
<p style="color:#555;font-size:14px;margin:0;line-height:1.8;">
<strong>Name:</strong> {{csm_name}}<br>
<strong>Email:</strong> {{csm_email}}<br>
</p>
</div>
<p style="color:#333;font-size:16px;line-height:1.6;">Looking forward to connecting with you!</p>
<p style="color:#666;font-size:14px;">Warm regards,<br><strong>{{csm_name}}</strong><br>Customer Success Manager<br>Koenig Solutions</p>
</td></tr>
<tr><td style="background:#f8f9fa;padding:20px;text-align:center;">
<p style="color:#999;font-size:12px;margin:0;">Koenig Solutions | Empowering Careers Through Technology Training</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
  });

  defaults.forEach(t => save(t));
}

module.exports = { getAll, getById, save, remove, seedDefaults };
