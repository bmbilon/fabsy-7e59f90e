export const FABSY_NUMBER = '+18257932279';
const callId = /^CA[0-9a-f]{32}$/i;
const recordingId = /^RE[0-9a-f]{32}$/i;
export class HistoryError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export interface Call {
  sid: string; account_sid: string; parent_call_sid?: string | null;
  from: string; to: string; direction: string; status: string;
  start_time: string | null; end_time: string | null; date_created: string; duration: string | null;
}
export interface Recording {
  sid: string; call_sid: string; account_sid: string; source: string; status: string; duration: string;
}
export interface Evidence { call_sid: string; kind: string; recording_sid?: string | null }
export interface Cursor { token: string; page: number }
export interface Filters { direction: 'incoming' | 'outgoing'; days: number; phone: string; cursor: Cursor | null; callSid: string | null }
export function parseFilters(body: Record<string, unknown>): Filters {
  const direction = body.direction ?? 'incoming';
  const days = Number(body.days ?? 30);
  if (!['incoming', 'outgoing'].includes(String(direction)) || ![0,7,30,90].includes(days)) throw new HistoryError('Choose a valid call filter.');
  let phone = String(body.phone || '').trim().replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(phone)) phone = '+1' + phone;
  else if (/^1\d{10}$/.test(phone)) phone = '+' + phone;
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) throw new HistoryError('Enter the full phone number, including country code.');
  const cursor = body.cursor as Cursor | null;
  if (cursor && (typeof cursor !== 'object' || !Number.isInteger(cursor.page) || cursor.page < 1 || cursor.page > 10000 || typeof cursor.token !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(cursor.token))) throw new HistoryError('Invalid history page.');
  const callSid = body.callSid ? String(body.callSid) : null;
  if (callSid && !callId.test(callSid)) throw new HistoryError('Invalid call reference.');
  return {direction: direction as Filters['direction'], days, phone, cursor: cursor || null, callSid};
}
export function belongs(call: Call, account: string, direction?: Filters['direction']) {
  if (!callId.test(call.sid) || call.account_sid !== account || call.parent_call_sid) return false;
  const incoming = call.direction === 'inbound' && call.to === FABSY_NUMBER;
  const outgoing = call.direction.startsWith('outbound') && call.from === FABSY_NUMBER;
  return direction === 'incoming' ? incoming : direction === 'outgoing' ? outgoing : incoming || outgoing;
}
export function isVoicemail(recording: Recording, call: Call) {
  return recordingId.test(recording.sid) && recording.call_sid === call.sid && recording.account_sid === call.account_sid && recording.source === 'RecordVerb' && call.direction === 'inbound';
}
export function classify(call: Call, evidence: Evidence[], recordings: Recording[] | null, now = Date.now()) {
  const events = evidence.filter(e => e.call_sid === call.sid);
  const voicemail = recordings?.filter(r => isVoicemail(r, call)) || [];
  if (voicemail.some(r => r.status === 'completed' && Number(r.duration) > 0)) return 'voicemail';
  if (voicemail.some(r => ['in-progress','processing'].includes(r.status))) return 'voicemail_processing';
  if (voicemail.some(r => r.status === 'absent') || events.some(e => e.kind === 'voicemail')) return 'voicemail_unavailable';
  if (['queued','ringing','in-progress'].includes(call.status)) return 'in_progress';
  if (events.some(e => e.kind === 'accepted')) return 'answered';
  if (recordings === null) return 'voicemail_unknown';
  if (call.direction.startsWith('outbound')) return call.status === 'completed' ? 'connected' : 'not_connected';
  if (call.end_time && now - Date.parse(call.end_time) < 60000) return 'checking';
  if (events.some(e => e.kind === 'missed') || ['busy','failed','no-answer','canceled'].includes(call.status)) return 'missed_no_voicemail';
  return 'unconfirmed';
}
export function provider(account: string, token: string, request: typeof fetch = fetch) {
  if (!/^AC[0-9a-f]{32}$/i.test(account) || !token) throw new HistoryError('Call history is not configured.', 503);
  const base = `https://api.twilio.com/2010-04-01/Accounts/${account}`;
  const headers = {Authorization: `Basic ${btoa(`${account}:${token}`)}`};
  async function read(path: string) {
    const response = await request(base + path, {headers, redirect:'error', signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new HistoryError(response.status === 404 ? 'This call or recording is no longer available.' : 'Twilio is temporarily unavailable. Try refreshing shortly.', response.status === 404 ? 404 : 503);
    return response;
  }
  return {
    async call(sid: string) {
      if (!callId.test(sid)) throw new HistoryError('Invalid call reference.');
      const call = await (await read(`/Calls/${sid}.json`)).json() as Call;
      if (!belongs(call, account)) throw new HistoryError('Call not found on the Fabsy line.', 404);
      return call;
    },
    async list(filters: Filters) {
      const q = new URLSearchParams({PageSize:'20', [filters.direction === 'incoming' ? 'To' : 'From']: FABSY_NUMBER});
      if (filters.days) q.set('StartTime>', new Date(Date.now()-filters.days*86400000).toISOString().slice(0,10));
      if (filters.phone) q.set(filters.direction === 'incoming' ? 'From' : 'To', filters.phone);
      if (filters.cursor) { q.set('PageToken', filters.cursor.token); q.set('Page', String(filters.cursor.page)); }
      const data = await (await read('/Calls.json?'+q)).json();
      let next: Cursor | null = null;
      if (data.next_page_uri) {
        const url = new URL(data.next_page_uri, 'https://api.twilio.com');
        if (url.origin !== 'https://api.twilio.com' || url.pathname !== new URL(base+'/Calls.json').pathname) throw new HistoryError('Invalid provider pagination.', 503);
        const cursor = {token: url.searchParams.get('PageToken') || '', page:Number(url.searchParams.get('Page'))};
        next = parseFilters({cursor}).cursor;
      }
      return {calls:(data.calls as Call[]).filter(c=>belongs(c, account, filters.direction)), next};
    },
    async recordings(call: Call) {
      // A three-minute voicemail flow creates one recording; detect unexpected extra pages.
      const data = await (await read(`/Recordings.json?CallSid=${call.sid}&PageSize=100`)).json();
      if (!Array.isArray(data.recordings)) throw new HistoryError('Voicemail lookup failed.',503);
      if (data.next_page_uri) throw new HistoryError('Additional recordings need review.', 503);
      return (data.recordings as Recording[]).filter(r=>isVoicemail(r,call));
    },
    async audio(call: Call, sid: string) {
      if (!recordingId.test(sid)) throw new HistoryError('Invalid recording reference.');
      const recording = await (await read(`/Recordings/${sid}.json`)).json() as Recording;
      if (!isVoicemail(recording,call) || recording.status !== 'completed' || Number(recording.duration) <= 0) throw new HistoryError('Voicemail is not available for this call.', 404);
      const response = await read(`/Recordings/${sid}.mp3`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 10*1024*1024) throw new HistoryError('Recording is too large for playback here.', 413);
      return bytes;
    },
  };
}
