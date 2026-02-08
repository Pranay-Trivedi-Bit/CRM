require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from project root
app.use(express.static(path.join(__dirname, '..')));

// API Routes
app.use('/api/leads', require('./routes/leads-proxy'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/whatsapp', require('./routes/whatsapp-config'));
app.use('/api/flows', require('./routes/flows'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/email-templates', require('./routes/email-templates'));
app.use('/api/contact-lists', require('./routes/contact-lists'));
app.use('/api/email-tracking', require('./routes/email-tracking'));
app.use('/api/email', require('./routes/email-send'));
app.use('/api/contacts/import', require('./routes/contacts-import'));

// Fallback to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(config.port, async () => {
  console.log('='.repeat(60));
  console.log('  Sales Dashboard + WhatsApp Bot + Email Marketing Server');
  console.log('='.repeat(60));
  console.log(`  Dashboard:     http://localhost:${config.port}`);
  console.log(`  API proxy:     http://localhost:${config.port}/api/leads`);
  console.log(`  Webhook:       http://localhost:${config.port}/api/webhook`);
  console.log(`  Flows API:     http://localhost:${config.port}/api/flows`);
  console.log(`  Campaigns:     http://localhost:${config.port}/api/campaigns`);
  console.log(`  Templates:     http://localhost:${config.port}/api/email-templates`);
  console.log(`  Email Send:    http://localhost:${config.port}/api/email/send`);

  // Check WhatsApp config
  const wa = config.whatsapp;
  if (wa.accessToken && wa.phoneNumberId) {
    console.log(`  WhatsApp:      CONFIGURED (Brand: ${wa.brandName}, Phone: ...${wa.phoneNumberId.slice(-4)})`);
  } else if (wa.accessToken) {
    console.log('  WhatsApp:      PARTIAL (Access token set, but Phone Number ID missing)');
  } else {
    console.log('  WhatsApp:      NOT CONFIGURED (add WHATSAPP_ACCESS_TOKEN to .env)');
  }

  // Verify SMTP connection at startup
  try {
    const emailSender = require('./services/email-sender');
    await emailSender.verifyConnection();
  } catch (err) {
    console.error('  Email:         Error during verification —', err.message);
  }

  console.log('='.repeat(60));
});
