/**
 * Support / sales contact (used on marketing footer and register page).
 * Update WHATSAPP_E164 when changing the business WhatsApp number.
 */
export const SUPPORT_WHATSAPP_E164 = "60109873757";

export const SUPPORT_WHATSAPP_DISPLAY = "010-9873757";

export function supportWhatsAppUrl(prefillMessage?: string): string {
  const base = `https://wa.me/${SUPPORT_WHATSAPP_E164}`;
  if (!prefillMessage?.trim()) return base;
  return `${base}?text=${encodeURIComponent(prefillMessage.trim())}`;
}

export const SUPPORT_PHONE_TEL = `+${SUPPORT_WHATSAPP_E164}`;

export const SUPPORT_EMAIL = "lwopsflow@gmail.com";
