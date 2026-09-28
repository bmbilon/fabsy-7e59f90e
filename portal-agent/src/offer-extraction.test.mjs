import test from 'node:test';
import assert from 'node:assert/strict';
import {extractOfferFields} from './offer-extraction.mjs';
const url='https://traffictickets.alberta.ca/dispute-response?uuid=11111111-2222-3333-4444-555555555555';
const text=`Review response
Offer
Ticket number
E04365001P
Original charge and penalty
$405.00
3 demerits
Section ROR,54(1) - F/T Stop/Proceed Red-Intersection
New charge and penalty
$243
3 demerits
Section ROR,54(1) - F/T Stop/Proceed Red-Intersection
Please note: accepting means pleading guilty
Court/Due date November 25, 2026`;
test('same-ticket official capture supplies offer fields without inferring a trial from Court/Due date',()=>{
 const f=extractOfferFields('E04365001P',text,url,'2026-09-27T15:00:00Z');
 assert.equal(f.original_total,405);assert.equal(f.offered_total,243);assert.equal(f.demerits,3);
 assert.equal(f.charge,'Section ROR,54(1) - F/T Stop/Proceed Red-Intersection');
 assert.equal(f.trial_date,undefined);assert.equal(f.schedule_status,undefined);assert.equal(f.due_date,undefined);
 assert.match(f.deadline_source,/captured 2026-09-27/);
});
test('wrong ticket, multiple tickets or foreign page cannot prefill private case fields',()=>{
 for(const [ticket,body,link] of [['E00000000P',text,url],['E04365001P',text+' B44694930C',url],['E04365001P',text,url.replace('alberta.ca','example.test')]])assert.deepEqual(extractOfferFields(ticket,body,link,'now'),{});
});
test('ambiguous amounts remain blank and do not block independent field extraction',()=>{
 const f=extractOfferFields('E04365001P',text.replace('$243','$243\n$99'),url,'now');
 assert.equal(f.offered_total,undefined);assert.equal(f.demerits,3);
});

import {extractScheduleCandidate} from './offer-extraction.mjs';
test('current summary captures November 25 as evidence requiring trial confirmation',()=>{
 const candidate=extractScheduleCandidate('E04365001P','Your ticket summary E04365001P\nCourt/Due date\nNovember 25, 2026','https://traffictickets.alberta.ca/ticket-penalty-and-options','2026-09-27T15:00:00Z');
 assert.equal(candidate.date,'2026-11-25');assert.equal(candidate.label,'Court/Due date');assert.equal(candidate.requires_trial_confirmation,true);
 assert.equal(extractScheduleCandidate('E04365001P','E04365001P Trial date February 30, 2027','https://traffictickets.alberta.ca/ticket-penalty-and-options','now'),null);
});
test('only explicit valid response deadlines populate the due date',()=>{
 assert.equal(extractOfferFields('E04365001P',text+'\nUpdated due date November 30, 2026',url,'now').due_date,'2026-11-30');
 assert.equal(extractOfferFields('E04365001P',text+'\nResponse due date 2027-02-30',url,'now').due_date,undefined);
});
