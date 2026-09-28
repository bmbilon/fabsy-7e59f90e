import {handler} from './index.ts';
import {digest} from '../../../ads-engine/core.ts';
const equal=(actual:unknown,expected:unknown)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`Unexpected fixture result ${JSON.stringify(actual)}`);};
Deno.test('saved draft qualification requires the actual private receipt and current evidence',async()=>{
 const nativeFetch=globalThis.fetch;
 const savedEnv=Object.fromEntries(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].map(k=>[k,Deno.env.get(k)]));
 Deno.env.set('SUPABASE_URL','https://ads-fixture.invalid');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fixture-only-key');
 const id='11111111-1111-4111-8111-111111111111',token='a'.repeat(64),path='fixture/private-ticket.png',email='fixture@example.invalid';
 const tokenHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 let contactHash=await digest([email,'']),documentHash=await digest(path),readable=true,verified=true;
 const writes:Record<string,unknown>[]=[];
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof Request?input.url:input.toString());
  if(url.origin!=='https://ads-fixture.invalid')throw new Error('Network forbidden outside the synthetic backend');
  const table=url.pathname.split('/').at(-1);
  if((init?.method||'GET')!=='GET'){writes.push(JSON.parse(String(init?.body||'{}')));return new Response(null,{status:201});}
  const row=table==='ticket_intake_drafts'?{id,access_token_hash:tokenHash,email,phone:'',draft_data:{ticketType:'photo_radar'},ticket_document_path:path,ticket_uploaded_at:new Date().toISOString(),pending_ticket_document_path:null,expires_at:new Date(Date.now()+60000).toISOString()}:table==='ads_draft_attribution'?{fields:{utm_source:'google'},contact_verified_at:verified?new Date().toISOString():null,readable_at:readable?new Date().toISOString():null,contact_hash:contactHash,readable_document_hash:documentHash}:null;
  return Response.json(row);
 };
 const request=(values:Record<string,unknown>={})=>handler(new Request('https://fixture.invalid/ads-measurement',{method:'POST',body:JSON.stringify({draftId:id,accessToken:token,...values})}));
 try{
  const first=await request();equal(first.status,200);equal((await first.json()).qualifiedEventId,`qualified:${id}`);
  writes.length=0;const wrong=await request({accessToken:'b'.repeat(64)});equal(wrong.status,403);equal(writes.length,0);
  verified=false;const unverified=await request({contactVerified:true,readable:true});equal((await unverified.json()).qualifiedEventId,null);
  verified=true;contactHash='f'.repeat(64);equal((await(await request()).json()).qualifiedEventId,null);
  contactHash=await digest([email,'']);documentHash='f'.repeat(64);equal((await(await request()).json()).qualifiedEventId,null);
  documentHash=await digest(path);readable=false;equal((await(await request()).json()).qualifiedEventId,null);
  if(JSON.stringify(writes).includes(email)||JSON.stringify(writes).includes(path))throw new Error('Funnel events must exclude contact and document data');
 }finally{globalThis.fetch=nativeFetch;for(const[k,v]of Object.entries(savedEnv)){if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v);}}
});
