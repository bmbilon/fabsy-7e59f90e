# AnderHue practice inbox

The email-only Worker forwards hello@anderhue.ca to info@onlineparalegals.ca
and brett@execom.ca. Both destinations must be verified before the routing
rule is attached to this Worker. No HTTP endpoint, email storage, or message
content logging is enabled.

On November 19, 2026 the Worker was deployed but not attached: the info address
was unverified and its prior intake alert had bounced because the recipient's
mail server could not be found. The active Cloudflare rule forwards only to
brett@execom.ca while the practice confirms a working primary inbox.

Cloudflare account: f5ec7e7a593ad551d17d700df2cc3bd5
Zone: 50463f1cc70c9c1fded8e96e4b53f219
Rule: 48125e6b9a11442ab2265249c5af121c

Once the primary destination is confirmed and verified, update the Worker
recipients if necessary, run worker.test.mjs in Studio sandbox, deploy with
wrangler deploy --no-bundle, and change the existing rule action to worker:
anderhue-email-forwarder. Do not add a competing rule for the same address.
Verify delivery to both inboxes before marking forwarding complete.
