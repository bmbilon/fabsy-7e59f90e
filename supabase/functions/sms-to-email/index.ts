import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const resend = new Resend(resendApiKey);

const parseTwilioBody = async (req: Request) => {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    const entries: Record<string, string> = {};
    params.forEach((v, k) => (entries[k] = v));
    return entries;
  }
  try {
    return await req.json();
  } catch {
    return {} as Record<string, string>;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data = await parseTwilioBody(req);
    const from = data.From || data.from || "";
    const to = data.To || data.to || "";
    const body = data.Body || data.body || "";
    const numMedia = Number(data.NumMedia || data.numMedia || 0) || 0;

    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const key = `MediaUrl${i}`;
      if (data[key]) mediaUrls.push(data[key]);
    }

    // Destination(s): configurable; fallback to admin emails
    const forwardTo = (Deno.env.get("FORWARD_SMS_EMAIL_TO") || "brett@execom.ca,hello@fabsy.ca")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height:1.6; color:#111;">
          <h2 style="margin:0 0 10px;">📩 New SMS Received</h2>
          <p style="margin:4px 0;"><strong>To:</strong> ${to}</p>
          <p style="margin:4px 0;"><strong>From:</strong> ${from}</p>
          <p style="margin:12px 0;"><strong>Message:</strong><br>
            <span style="white-space: pre-wrap;">${(body || "").replace(/</g, "&lt;")}</span>
          </p>
          ${mediaUrls.length ? `<div style="margin:12px 0;"><strong>Media:</strong><ul>${mediaUrls.map(u => `<li><a href="${u}">${u}</a></li>`).join("")}</ul></div>` : ""}
          <hr>
          <p style="font-size:12px; color:#555;">Forwarded automatically by sms-to-email function.</p>
        </body>
      </html>
    `;

    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured; skipping email send.");
    } else {
      await resend.emails.send({
        from: "Fabsy SMS <hello@fabsy.ca>",
        to: forwardTo,
        subject: `SMS → Email: ${from} → ${to}`,
        html,
      });
    }

    // Respond OK for Twilio webhook
    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error("sms-to-email error:", err?.message || err);
    return new Response("Error", { status: 500, headers: corsHeaders });
  }
});
