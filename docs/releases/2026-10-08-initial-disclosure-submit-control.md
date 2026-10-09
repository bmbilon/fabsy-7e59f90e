# Initial disclosure portal control correction — October 8, 2026

## Problem and resulting behavior

For ticket E02605341B, the administrator's government-session acceptance was recorded at 2026-10-09 01:16:09 UTC. The initial disclosure adapter selected and filled the case's verified lookup method, then timed out on `/search-verification` before committing or submitting. Saved live controls showed an enabled `INPUT type=submit`; the adapter readiness predicate searched only `main button`. The lookup page also used a radio name that the original fixture had invented.

The adapter now waits for one visible, enabled, exactly labelled **Find ticket** button or submit input. Fresh verification pages are recognized by their exact known radio labels, independently of their HTML name. Disabled, duplicate or mismatched controls still hold. Payment, signed consent, exact defendant/fine, session acceptance, committing and exact-ticket receipt checks retain their existing behavior.

## Validation and release

- 75 Worker/phone tests passed, including actual submit-input markup for fresh/resumed lookup and holds before any final click.
- Worker and phone TypeScript checks passed; build and Wrangler dry run passed.
- Previous live Worker: `6c33f592-4d2b-4f09-ba5b-b3caf7e1fd5f`.
- Repaired Worker: `6b4ee597-c16b-4814-a785-806811e61432`, deployed 2026-10-09 approximately 01:26 UTC. Existing route, cron, queue bindings and secrets retained. No frontend Pages or Supabase function deployment was needed.
- The deployed runner source was previously absent from tracked main. Its existing baseline was committed separately from the two-file fix so the correction is reviewable.

The original browser/terms window expired during repair. The existing job was resumed once through authenticated Fabsy Admin after the fix; a fresh actual government session must receive its own administrator terms tap. No acceptance was fabricated, and no disclosure filing is claimed without the exact-ticket government receipt.
