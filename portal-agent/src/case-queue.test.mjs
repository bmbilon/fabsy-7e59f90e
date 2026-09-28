import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:[new URL('./case-queue.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {caseQueue}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const ticket='B21052916C';
const job=(id,status,action='inspect_disclosure',ticket_number=ticket)=>({id,status,action,ticket_number});
const pkg={id:'review',job_id:'retrieval',ticket_number:ticket,status:'approved',review_submission_job_id:'filing'};
test('same ticket retrieval, approved request and queued filing count once with filing as next step',()=>{
 const result=caseQueue({jobs:[job('retrieval','needs_review'),job('filing','queued','submit_review_request')],disclosureReviews:[pkg]},[]);
 assert.equal(result.length,1);assert.equal(result[0].group,'pending');assert.equal(result[0].primary.id,'filing');assert.equal(result[0].tasks.length,3);assert.equal(result[0].tasks.find(t=>t.id==='retrieval').group,'done');
});
test('completed steps do not put a ticket in Completed while its client email needs approval',()=>{
 const result=caseQueue({jobs:[job('retrieval','completed'),job('filing','completed','submit_review_request')],disclosureReviews:[{...pkg,status:'submitted'}]},[{id:'email',ticket_number:'b210 52916-c',status:'pending_approval'}]);
 assert.equal(result.length,1);assert.equal(result[0].ticket,ticket);assert.equal(result[0].group,'attention');assert.equal(result[0].primary.id,'email');assert.equal(result[0].tasks.length,4);
});
test('same contact on different tickets stays separate; missing identifiers never merge',()=>{
 const drafts=[{id:'a',ticket_number:ticket,email:'shared@example.test',status:'pending_approval'},{id:'b',ticket_number:'B44694930C',email:'shared@example.test',status:'pending_approval'},{id:'c',status:'needs_review'},{id:'d',status:'needs_review'}];
 assert.equal(caseQueue({},drafts).length,4);
});
test('uncertain submissions stay visible even beside later completed tasks',()=>{
 const result=caseQueue({jobs:[job('uncertain','uncertain','submit_review_request'),job('complete','completed','submit_review_request')],disclosureReviews:[{...pkg,status:'submitted'}]},[]);
 assert.equal(result.length,1);assert.equal(result[0].group,'attention');assert.equal(result[0].primary.id,'uncertain');
});
test('multiple client messages remain separate tasks beneath a single ticket',()=>{
 const result=caseQueue({},[{id:'a',ticket_number:ticket,status:'pending_approval'},{id:'b',ticket_number:ticket,status:'pending_approval'}]);
 assert.equal(result.length,1);assert.deepEqual(result[0].tasks.map(t=>t.id),['a','b']);
});
