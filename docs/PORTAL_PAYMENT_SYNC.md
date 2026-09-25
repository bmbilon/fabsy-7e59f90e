# Admin navigation and verified payment updates

## Requirements and boundaries

Staff can move between the cloud portal queue and all Fabsy Admin pages from the installed app. Keep the existing staff authentication and legal-action approval requirements. A verified Stripe payment updates the matching case without waiting for an Admin refresh. An unmatched payment remains visible for matching; it cannot be assigned by guesswork. Never regress Crown/trial/closed stages to Paid, or invent a payment from the browser success URL.

## Implementation plan

1. Add a Portal queue link to the common Admin header/sidebar and a clear Main dashboard link in the queue. Use full navigation for the separate Worker page. Expand only the app manifest navigation scope to /admin/; the service worker continues to handle notifications without caching private content.
2. Keep the deployed signature-verified Stripe webhook. Add database triggers that advance confirmed representation payments from unset/Partial to Paid and emit a staff-only revision signal after payment/case changes. The websocket carries only a revision and time, not payment/client records.
3. Subscribe the Admin workspace and portal queue to that signal, debounce refetches, refresh on reconnect/return to foreground, and retain fallback polling. Display recent paid orders in the portal, including unmatched orders.
4. Test payment evidence requirements, duplicate deliveries, advanced-stage preservation, staff-only permissions, and the shared refresh mechanism. Deploy database/broker before UI; verify actual navigation and live update transport without charging a customer.

## Clarifications resolved

“Immediately” means after Stripe confirms a successful payment and its signed webhook commits the update. Pending/failed checkouts never become Paid. Stripe/network latency remains outside Fabsy's control. Payment synchronization does not authorize a plea, a disclosure filing, or client mail.
