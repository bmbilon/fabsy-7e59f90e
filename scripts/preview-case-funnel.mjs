// Isolated local preview: synthetic records and mocked services only.
import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
const dir = join(tmpdir(), 'fabsy-case-funnel-preview');
await mkdir(dir, { recursive: true });
const names = ['Alex Morgan', 'Jamie Chen', 'Taylor Singh', 'Jordan Avery', 'Riley Brooks', 'Casey Wilson', 'Drew Parker', 'Robin Bell'];
const stages = [null, null, 'paid', 'disclosure_requested', 'crown_offer_received', 'trial_date_set', 'done_withdrawn', 'done_reduced'];
const submissions = names.map((name, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, first_name: name.split(' ')[0], last_name: name.split(' ')[1],
  email: `${name.split(' ')[0].toLowerCase()}@example.test`, phone: '555-010-1000', ticket_number: `DEMO-${1001 + index}`, violation: index % 2 ? 'Speeding' : 'Traffic signal violation',
  fine_amount: '243', status: index >= 6 ? 'completed' : 'awaiting_payment', service_type: 'representation', ticket_type: 'officer_issued',
  consent_form_path: index > 0 ? 'synthetic/consent.pdf' : null, representation_paid_at: index > 1 ? '2026-09-18T12:00:00Z' : null,
  assessment_paid_at: null, referral_refunded_at: index === 7 ? '2026-09-20T12:00:00Z' : null, case_outcome: index >= 6 ? 'withdrawn' : null,
  deleted_at: null, intake_mode: 'standard', created_at: '2026-09-19T12:00:00Z', clients: null,
}));
submissions.push({ ...submissions[2], id: '10000000-0000-4000-8000-000000000020', first_name: 'Cameron', last_name: 'Lee', ticket_number: 'DEMO-1020', email: 'cameron@example.test' });
const statuses = submissions.map((sub, index) => ({ kind: 'submission', ticket_id: sub.id, stage: index === 8 ? 'paid' : stages[index], version: 1 })).filter(row => row.stage);
const intakes = [0,1].map(index => ({
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12,'0')}`, draft_data: { firstName: index ? 'Avery' : 'Morgan', lastName: 'Sample', ticketNumber: `DEMO-${2001+index}` },
  email: 'intake@example.test', phone: '555-010-2000', preferred_locale: 'en', current_step: 2, completed_step: 1,
  status: index ? 'expired' : 'active', expires_at: index ? '2026-09-01T12:00:00Z' : '2030-10-19T12:00:00Z', updated_at: '2026-09-19T12:00:00Z',
  converted_submission_id: null, ticket_document_path: 'synthetic/ticket.pdf', ticket_document_size_bytes: 123400, ticket_uploaded_at: '2026-09-19T12:00:00Z',
  resume_delivery_status: 'sent', resume_delivery_channel: 'email', resume_delivery_sent_at: null, resume_delivery_attempt_count: 1,
  resume_delivery_failure_code: null, staff_follow_up_status: 'open', staff_follow_up_updated_at: null, follow_up_email_sent_at: null, follow_up_phone_called_at: null, deleted_at: null,
}));
const mock = `
const submissions = ${JSON.stringify(submissions)};
const intakes = ${JSON.stringify(intakes)};
const statuses = ${JSON.stringify(statuses)};
const user = { id: 'preview-staff' };
export const supabase = {
 auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: { user } } }) },
 from(table) { const rows = table === 'ticket_submissions' ? submissions : table === 'ticket_intake_drafts' ? intakes : statuses; const q = { select() { return q; }, or() { return q; }, order() { return q; }, range() { return q; }, abortSignal() { return q; }, then(resolve) { resolve({ data: structuredClone(rows), error: null }); } }; return q; },
 async rpc(name, args) {
  if (name === 'get_ticket_upload_alert_statuses') return { data: [] };
  if (name === 'set_admin_ticket_case_status') { const row = statuses.find(row => row.ticket_id === args.p_ticket_id); const updated = { kind: args.p_kind, ticket_id: args.p_ticket_id, stage: args.p_stage, version: (row?.version || 0) + 1 }; if (row) Object.assign(row, updated); else statuses.push(updated); return { data: updated }; }
  return { error: { message: 'This synthetic preview does not perform external actions.' } };
 },
 storage: { from: () => ({ createSignedUrl: async () => ({ error: { message: 'Synthetic preview file.' } }) }) }
};`;
const mocks = {
 '@/integrations/supabase/client': mock,
 '@/hooks/useIdrAuth': "export const getIdrStaffRole = async () => 'admin';",
 '@/components/DisclosureConfirmations': "export const DisclosureAutomationPanel = () => <p>Disclosure automation (synthetic preview)</p>;",
 '@/components/AteCaseReview': "export const AtePilotMetrics = () => <p>ATE reporting (synthetic preview)</p>;",
};
await build({
 stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import Page from './src/pages/AdminCaseManagement'; const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); createRoot(document.getElementById('root')).render(<BrowserRouter><QueryClientProvider client={client}><div style={{background:'#eaf1ff',padding:'8px 24px',fontSize:12,color:'#1e40af'}}>LOCAL PREVIEW · Synthetic cases</div><Page /></QueryClientProvider></BrowserRouter>);`, loader:'tsx', resolveDir:process.cwd() },
 bundle:true, format:'esm', jsx:'automatic', outfile:join(dir,'app.js'),
 plugins:[{ name:'synthetic-services', setup(builder) {
  builder.onResolve({filter:/.*/}, args => Object.hasOwn(mocks,args.path) ? { path:args.path, namespace:'preview' } : undefined);
  builder.onLoad({filter:/.*/,namespace:'preview'}, args => ({ contents:mocks[args.path],loader:'tsx',resolveDir:process.cwd() }));
 }}],
});
execFileSync('node_modules/.bin/tailwindcss', ['-i','src/index.css','-o',join(dir,'app.css')], { stdio:'pipe' });
await writeFile(join(dir,'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fabsy case funnel · local preview</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
if (process.argv.includes('--build-only')) process.exit(0);
createServer(async (req,res) => { const asset = req.url === '/app.js' ? 'app.js' : req.url === '/app.css' ? 'app.css' : 'index.html'; res.setHeader('Content-Type',asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html'); res.end(await readFile(join(dir,asset))); }).listen(5188,'127.0.0.1',()=>console.log('Synthetic case funnel preview: http://127.0.0.1:5188/admin/cases'));
