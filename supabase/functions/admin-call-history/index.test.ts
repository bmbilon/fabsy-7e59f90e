import { assertEquals, assertRejects } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { belongs, classify, FABSY_NUMBER, HistoryError, parseFilters, provider, type Call, type Recording } from './service.ts';
import { createHandler } from './index.ts';
const account='AC'+'a'.repeat(32), callSid='CA'+'b'.repeat(32), recSid='RE'+'c'.repeat(32);
const call:Call={sid:callSid,account_sid:account,parent_call_sid:null,from:'+14036690000',to:FABSY_NUMBER,direction:'inbound',status:'completed',start_time:'2026-09-25T12:00:00Z',end_time:'2026-09-25T12:01:00Z',date_created:'2026-09-25T12:00:00Z',duration:'60'};
const recording:Recording={sid:recSid,call_sid:callSid,account_sid:account,source:'RecordVerb',status:'completed',duration:'19'};
const event=(kind:string)=>[{call_sid:callSid,kind}];
Deno.test('classifies real missed, answered and voicemail events without guessing old calls',()=>{
  assertEquals(classify(call,event('missed'),[],Date.parse('2026-09-25T12:05:00Z')),'missed_no_voicemail');
  assertEquals(classify(call,event('accepted'),[],Date.parse('2026-09-25T12:05:00Z')),'answered');
  assertEquals(classify(call,[],[recording],Date.parse('2026-09-25T12:05:00Z')),'voicemail');
  assertEquals(classify(call,[],[],Date.parse('2026-09-25T12:05:00Z')),'unconfirmed');
  assertEquals(classify(call,event('missed'),null,Date.parse('2026-09-25T12:05:00Z')),'voicemail_unknown');
  assertEquals(classify(call,event('missed'),[],Date.parse('2026-09-25T12:01:20Z')),'checking');
  assertEquals(classify(call,event('voicemail'),[],Date.parse('2026-09-25T12:05:00Z')),'voicemail_unavailable');
});
Deno.test('isolates the Fabsy line, account and parent call legs',()=>{
  assertEquals(belongs(call,account,'incoming'),true);
  assertEquals(belongs({...call,to:'+18250000000'},account),false);
  assertEquals(belongs({...call,parent_call_sid:'CA'+'d'.repeat(32)},account),false);
  assertEquals(belongs({...call,account_sid:'AC'+'e'.repeat(32)},account),false);
  assertEquals(belongs(call,account,'outgoing'),false);
});
Deno.test('validates phone, date, cursor and call ID before provider requests',()=>{
  assertEquals(parseFilters({phone:'403-669-0000'}).phone,'+14036690000');
  for(const input of [{days:365},{cursor:{page:1,token:'../other'}},{phone:'hello'},{callSid:'../../other'}]){
    let failed=false;try{parseFilters(input);}catch(error){failed=error instanceof HistoryError;}assertEquals(failed,true);
  }
});
Deno.test('provider checks recording ownership and never follows audio redirects',async()=>{
  const requests:string[]=[];
  const voice=provider(account,'fixture-token',async(input,init)=>{
    requests.push(String(input));
    assertEquals(init?.redirect,'error');
    if(String(input).includes('/Recordings/'+recSid+'.json')) return Response.json({...recording,call_sid:'CA'+'e'.repeat(32)});
    return Response.json({});
  });
  await assertRejects(()=>voice.audio(call,recSid),HistoryError);
  assertEquals(requests.length,1);
});
Deno.test('admin endpoint rejects no sign-in and non-admin before reading voice data',async()=>{
  const voice={call:()=>{throw Error('provider accessed');},list:()=>{throw Error('provider accessed');}} as unknown as ReturnType<typeof provider>;
  const db={auth:{getUser:async()=>({data:{user:{id:'staff'}},error:null})},from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})})};
  const handler=createHandler(db,voice);
  const request=(headers:Record<string,string>)=>new Request('https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/admin-call-history',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action:'list'})});
  assertEquals((await handler(request({}))).status,401);
  assertEquals((await handler(request({Authorization:'Bearer fixture'}))).status,403);
  assertEquals((await handler(request({Authorization:'Bearer fixture',Origin:'https://evil.example'}))).status,403);
});
