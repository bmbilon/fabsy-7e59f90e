export const FABSY_PRIMARY_NOTIFICATION_EMAIL = "hello@fabsy.ca";
export const FABSY_BACKUP_NOTIFICATION_EMAIL = "brett@execom.ca";

/**
 * Internal notices always address Fabsy first. Execom receives a blind backup
 * copy so it remains a redundancy path rather than the system of record.
 */
export const FABSY_INTERNAL_NOTIFICATION_DELIVERY = Object.freeze({
  to: Object.freeze([FABSY_PRIMARY_NOTIFICATION_EMAIL]),
  bcc: Object.freeze([FABSY_BACKUP_NOTIFICATION_EMAIL]),
});

export function internalNotificationDelivery() {
  return {
    to: [...FABSY_INTERNAL_NOTIFICATION_DELIVERY.to],
    bcc: [...FABSY_INTERNAL_NOTIFICATION_DELIVERY.bcc],
  };
}
