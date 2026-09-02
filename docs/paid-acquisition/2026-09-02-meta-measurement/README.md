# Meta measurement deployment — 2026-09-02

Fabsy's Meta Pixel is live on the three approved Rapid Resolution ad URLs after explicit measurement consent. It does not load on generic pages, Photo Radar, assessment, or standalone report flows. Consent withdrawal removes the browser runtime and fences server retries.

The Conversions API worker is enabled with its access token stored as a Supabase secret. The token is intentionally absent from this repository and receipt. A direct production health call returned zero claimed, sent, retried, dead, invalid, cancelled, unresolved, and terminal failures. The scheduled GitHub delivery workflow also passed its dead, unresolved, and terminal-failure guards.

## Provider state

- Dataset: `Fabsy Web Events` (`2917050565322500`), category `Personal hardship`
- Automatic advanced matching: off
- Automatic events without code: off
- Browser events: scoped `PageView` and verified `Purchase`
- Server events: verified `Purchase` only
- Current Meta readback: CAPI connection pending until the first eligible server event; no processed activity yet at the immediate post-deployment readback

## Verification

- Measurement contract: pass, including 139 CAPI assertions
- TypeScript, Deno, ESLint, full build: pass
- PostgreSQL 17 migration application: pass
- Build and Deploy: [run 33669921496](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/33669921496)
- Prerender refresh: [run 33669921512](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/33669921512)
- FAQ parity: [run 33669921576](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/33669921576)
- Enabled CAPI scheduler: [run 33672666885](https://github.com/bmbilon/fabsy-7e59f90e/actions/runs/33672666885)

No synthetic purchase was made. The first real eligible, consented Rapid Resolution purchase remains the final end-to-end provider proof for the browser/server `Purchase` pair and shared event-ID deduplication.
