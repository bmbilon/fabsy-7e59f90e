# Fabsy calls and voicemail

## Principles and scope

Show Fabsy's Twilio phone history in the existing authenticated Admin app, including missed calls without messages, voicemail indicators, and private playback. Preserve existing admin-only access to call recordings. Do not change call forwarding, send notifications, initiate calls, or infer a human answer from Twilio's completed status.

## Requirements and resolved choices

- Add Calls & voicemail at /admin/calls and a shortcut from /admin/portal.
- Read the existing Fabsy Twilio account and number only. Incoming calls are the default; outgoing calls exclude internal forwarding legs. Browse older pages, filter by time/phone, and view voicemail or missed-call rows on each loaded page.
- Combine provider calls/RecordVerb recordings with durable accepted/missed/voicemail events. Older records with insufficient evidence remain Answer unconfirmed. In-progress, unavailable recordings and lookup failures must never become Missed—no voicemail.
- Stream recordings through an admin-authenticated endpoint; never expose account credentials or unauthenticated permanent audio URLs. Provide a stable authenticated link to the call and reuse already-private archived audio where available.
- Refresh the active list periodically and on returning to the app. Playback survives list refresh.

## Plan, tasks and consistency check

1. Add a bounded Twilio read service and admin-only Edge endpoint using existing server secrets and existing voice tables.
2. Add mobile-friendly call cards, server paging and exact phone/date filters, status filters, per-recording playback and existing transcripts. Keep all UI under AdminWorkspace.
3. Add the main navigation and phone shortcut, preserving existing sign-in and app scope.
4. Test evidence classification, number isolation, paging validation, media ownership, admin authentication, transient failure handling and playback. Deploy endpoint before UI, then verify real history and a recording without placing a call or sending mail.

The existing notification queue is evidence, not a trigger to resend. No new cron or migration is needed. Playback is a read operation; this feature does not modify Twilio routing or recording settings.

## Provider references

- https://www.twilio.com/docs/voice/api/call-resource (completed includes IVR/voicemail, cursor paging)
- https://www.twilio.com/docs/voice/api/recording (RecordVerb and authenticated media)
