import {test} from 'node:test';
import assert from 'node:assert/strict';
import {portalTarget,inspectResult} from './portal-policy.mjs';
const job={action:'inspect_offer',ticket_number:'B44694930C',source_url:'https://traffictickets.alberta.ca/dispute-response?uuid=821c49dd-e676-489a-8c28-d023cbc0d0ab'};
test('only exact official offer links',()=>{
 assert.equal(portalTarget(job),job.source_url);
 for(const source_url of ['https://traffictickets.alberta.ca.evil.test/dispute-response','https://x:y@traffictickets.alberta.ca/dispute-response','http://traffictickets.alberta.ca/',job.source_url+'&action=accept',job.source_url+'#accept',job.source_url+'&uuid=other']) assert.throws(()=>portalTarget({...job,source_url}));
});
test('unsupported actions never become browser instructions',()=>{for(const action of ['accept','reject','submit','prepare_disclosure'])assert.throws(()=>portalTarget({...job,action}));});
test('a challenge or wrong ticket cannot complete a job',()=>{
 for(const [text,status] of [['Access denied',403],['Verify you are human',200],['Other ticket',200]]){
  const result=inspectResult(job,{text,status,url:job.source_url,title:'Portal'});
  assert.equal(result.status,'needs_review');assert.equal(result.result.portal_verified,false);
 }
});
test('matching evidence is saved with review required, without legal action',()=>{
 const result=inspectResult(job,{text:'Ticket B44694930C Offer $261',status:200,url:job.source_url,title:'Offer'});
 assert.equal(result.result.portal_verified,true);assert.equal(result.status,'needs_review');
});
test('client acceptance preparation opens only the official offer and never claims acceptance',()=>{
 const preparation={...job,action:'prepare_offer_acceptance'};
 assert.equal(portalTarget(preparation),job.source_url);
 const result=inspectResult(preparation,{text:'Ticket B44694930C Offer $261',status:200,url:job.source_url,title:'Offer'});
 assert.equal(result.status,'needs_review');
 assert.match(result.reason,/has not accepted/);
 assert.equal(result.result.accepted,undefined);
 assert.throws(()=>portalTarget({...preparation,source_url:job.source_url+'&action=accept'}));
});
test('disclosure retrieval only uses the exact observed ticket search link',()=>{
 const disclosure={...job,action:'inspect_disclosure',source_url:'https://traffictickets.alberta.ca/ticket-number-search?ticketNumber=B44694930C'};
 assert.equal(portalTarget(disclosure),disclosure.source_url);
 assert.throws(()=>portalTarget({...disclosure,source_url:disclosure.source_url.replace('B44694930C','B12345678C')}));
 assert.throws(()=>portalTarget({...disclosure,source_url:disclosure.source_url+'&submit=true'}));
 const result=inspectResult(disclosure,{text:'Your disclosure B44694930C',status:200,url:disclosure.source_url,title:'Ticket'});
 assert.equal(result.status,'needs_review');assert.match(result.reason,/never submits a new/);
});
