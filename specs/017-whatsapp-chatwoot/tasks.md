# Tasks

- [x] T1 Confirm phone-inbox intent, chosen Chatwoot route and provider constraints. (1, 2, 8)
- [x] T2 Implement metadata-only queue, leases, control state, quotas and recovery with restricted SQL privileges. Validated in an isolated PostgreSQL cluster. (2, 3, 4, 5, 7)
- [x] T3 Implement signed event receiver and authenticated worker with authoritative provider checks. (2, 3, 4, 6)
- [x] T4 Preserve AI greeting, text-only input, opt-outs, human requests and failure handoff; add behavioral tests. 79 Deno tests pass, including the original 41 unchanged. (2, 4, 5, 6)
- [x] T5 Connect the user's dedicated Chatwoot WhatsApp inbox and AgentBot after Chrome sign-in, inspecting plan/entitlements first. Paid API access verified; inbox 136731 and AgentBot 10632 active; Brett has phone access. (1, 3, 8)
- [x] T6 Update Contact, Privacy Policy, seven source fingerprints and operational/mobile guide; run scoped checks. Prepared only; publication remains part of T8. (1, 5, 7)
- [x] T7 Review and selectively deploy backend, secrets and recovery configuration; switch only WhatsApp routing after verification. Migration 20260911213000 and both functions deployed; recovery active; SMS and voice unchanged. (3, 4, 8)
- [ ] T8 Verify real phone access, manual reply, AI takeover/resume and delivery; publish website disclosures and record exact release. Phone access and two delivered manual WhatsApp replies verified; a fresh AI test is pending after correcting native webhook parsing. (1, 2, 6, 7, 8)
