import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {sha256} from './disclosure-review.ts';
export async function saveDisclosureEvidence(db:SupabaseClient,input:any){
 const job=await db.from('portal_agent_jobs').select('*').eq('id',input.id).eq('lease_token',input.lease).eq('status','running').gt('lease_expires_at',new Date().toISOString()).single();
 if(job.error||job.data.action!=='inspect_disclosure'||!job.data.submission_id)throw new Error('LEASE_LOST');
 const j=job.data;
 if(typeof input.name!=='string'||!/^[^/\\\x00-\x1f]{1,180}$/.test(input.name)||!['image/jpeg','image/png','application/pdf'].includes(input.mime)||typeof input.data!=='string'||input.data.length>13981016)throw new Error('INVALID_DOCUMENT');
 const source=`/ticket-disclosures/${j.ticket_number}/${encodeURIComponent(input.name)}`;
 if(input.source_path!==source)throw new Error('SOURCE_TICKET_MISMATCH');
 const bytes=Uint8Array.from(atob(input.data),c=>c.charCodeAt(0));
 if(!bytes.length||bytes.length>10485760)throw new Error('INVALID_DOCUMENT');
 const magic=input.mime==='application/pdf'?bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70:input.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 if(!magic)throw new Error('INVALID_DOCUMENT_TYPE');
 const hash=await sha256(bytes);if(input.sha256!==hash)throw new Error('DOCUMENT_HASH_MISMATCH');
 const path=`${j.ticket_number}/${hash}/${input.name}`;
 const saved=await db.storage.from('disclosure-evidence').upload(path,bytes,{contentType:input.mime,upsert:false});
 if(saved.error&&String((saved.error as {statusCode?:unknown}).statusCode)!=='409')throw new Error('EVIDENCE_SAVE_FAILED');
 const doc=await db.from('disclosure_documents').upsert({job_id:j.id,submission_id:j.submission_id,ticket_number:j.ticket_number,name:input.name,mime:input.mime,sha256:hash,bytes:bytes.length,storage_path:path,source_path:source},{onConflict:'job_id,name,sha256',ignoreDuplicates:true});
 if(doc.error)throw new Error('EVIDENCE_SAVE_FAILED');
 return {name:input.name,sha256:hash};
}
