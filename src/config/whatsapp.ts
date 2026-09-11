export const FABSY_WHATSAPP_NUMBER = "18257932279";

export const WHATSAPP_ENABLED = import.meta.env?.VITE_WHATSAPP_ENABLED === "true";

const DEFAULT_WHATSAPP_MESSAGE =
  "Hi Fabsy — I have a question about an Alberta traffic ticket.";

export const buildFabsyWhatsAppUrl = (message = DEFAULT_WHATSAPP_MESSAGE) =>
  `https://wa.me/${FABSY_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

export const FABSY_WHATSAPP_URL = buildFabsyWhatsAppUrl();
