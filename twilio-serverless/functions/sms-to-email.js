// functions/sms-to-email.js
// Twilio Functions handler to forward inbound SMS to email via Resend
// Configure environment variables in the Function Service:
//  - RESEND_API_KEY
//  - EMAIL_TO (comma-separated)
//  - EMAIL_FROM (e.g., no-reply@fabsy.ca)

const { Resend } = require('resend');

exports.handler = async function (context, event, callback) {
  try {
    const RESEND_KEY = context.RESEND_API_KEY;
    const EMAIL_TO = (context.EMAIL_TO || 'brett@execom.ca,hello@fabsy.ca')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const EMAIL_FROM = context.EMAIL_FROM || 'no-reply@fabsy.ca';

    const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

    const from = event.From || '';
    const to = event.To || '';
    const body = event.Body || '';
    const numMedia = Number(event.NumMedia || 0) || 0;

    const mediaLinks = [];
    for (let i = 0; i < numMedia; i++) {
      const key = `MediaUrl${i}`;
      if (event[key]) mediaLinks.push(event[key]);
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#111;">
          <h2 style="margin:0 0 10px;">📩 New SMS Received</h2>
          <p style="margin:4px 0;"><strong>To:</strong> ${to}</p>
          <p style="margin:4px 0;"><strong>From:</strong> ${from}</p>
          <p style="margin:12px 0;"><strong>Message:</strong><br>
            <span style="white-space: pre-wrap;">${(body || '').replace(/</g, '&lt;')}</span>
          </p>
          ${mediaLinks.length ? `<div style=\"margin:12px 0;\"><strong>Media:</strong><ul>${mediaLinks.map((u) => `<li><a href=\"${u}\">${u}</a></li>`).join('')}</ul></div>` : ''}
          <hr>
          <p style="font-size:12px;color:#555;">Forwarded automatically by Twilio Function sms-to-email.</p>
        </body>
      </html>
    `;

    if (resend) {
      await resend.emails.send({
        to: EMAIL_TO,
        from: EMAIL_FROM,
        subject: `SMS → Email: ${from} → ${to}`,
        html,
      });
    } else {
      console.log('RESEND_API_KEY not set; skipping email send');
    }

    const twiml = new Twilio.twiml.MessagingResponse();
    return callback(null, twiml);
  } catch (err) {
    console.error('sms-to-email error:', err?.message || err);
    const twiml = new Twilio.twiml.MessagingResponse();
    return callback(null, twiml);
  }
};
