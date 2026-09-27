import catalog from './plea-reference.json' with {type:'json'};
export const REFERENCE = catalog;
export const normalizeTicket = (value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
export const sha256 = async (value:string|Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value==='string'?new TextEncoder().encode(value):value as BufferSource))].map(b=>b.toString(16).padStart(2,'0')).join('');
export interface Observation {key:string;value:string;page:number;quote:string}
export interface Scan {name:string;sha256:string;page_count:number;all_pages_read:boolean;ticket_numbers:string[];observations:Observation[];checks:Array<{key:string;status:string;page:number|null;quote:string;detail:string}>;extraction?:{provider:string;model:string;prompt_sha256:string};operator_corrections?:Array<{field:string;before:unknown;after:unknown;quote:string;reason:string;verified_at:string;verified_by:string;source_sha256:string}>}
export const CHECKS=['plate_match','site_permission','zone_hours','construction_workers','five_minute_rule','mailing_service','ownership','operator_calibration'];
export function validateScan(raw:unknown,name:string,hash:string):Scan {
 const v=raw as Scan;
 if(!v || !Number.isInteger(v.page_count)||v.page_count<1||v.page_count>200||typeof v.all_pages_read!=='boolean'||!Array.isArray(v.observations)||!Array.isArray(v.ticket_numbers)||!Array.isArray(v.checks))throw new Error('INVALID_EXTRACTION');
 if(v.observations.length>60||v.checks.length>30||v.ticket_numbers.some(t=>typeof t!=='string'))throw new Error('INVALID_EXTRACTION');
 for(const o of v.observations){if(!['ticket','defendant','section','speed','limit','fine','offence_date','owner_liability','construction_uplift','plate_fingerprint'].includes(o.key)||typeof o.value!=='string'||o.value.length>400||!Number.isInteger(o.page)||o.page<1||o.page>v.page_count||typeof o.quote!=='string'||!o.quote.trim()||o.quote.length>1200)throw new Error('INVALID_CITATION');}
 for(const c of v.checks){if(!CHECKS.includes(c.key)||!['supported','concern','missing','not_applicable'].includes(c.status)||typeof c.detail!=='string'||c.detail.length>1200||typeof c.quote!=='string'||(c.status!=='missing'&&c.status!=='not_applicable'&&(!Number.isInteger(c.page)||c.page!<1||c.page!>v.page_count||!c.quote.trim())))throw new Error('INVALID_CHECK');}
 return {...v,name,sha256:hash};
}
const sectionTokens=(text:string)=>[...text.toUpperCase().replaceAll(' ','').matchAll(/(?<!\d)(\d+(?:\.\d+)?(?:\([^)]*\))*)/g)].map(m=>m[1].toLowerCase());
const statutes=(text:string)=>{const upper=text.toUpperCase(),v=upper.replace(/\s/g,'');return ['TSA','RROR','VER'].filter(a=>new RegExp(`\\b${a}(?=\\s|\\d|[.:])`).test(upper)||(a==='TSA'?v.includes('TRAFFICSAFETYACT'):a==='RROR'?v.includes('RULESOFTHEROADREGULATION'):v.includes('VEHICLEEQUIPMENTREGULATION')));};
export interface ResolutionComparable {
 id:string;ticket_number:string;owner_liability:boolean;construction_zone:boolean;section:string;
 speed:number;speed_limit:number;original_total:number;offered_total:number;
 original_demerits:number;offered_demerits:number;evidence_sha256:string;verified_at:string;
}
export interface ReviewRequestInstruction {
 ticket_number:string;original_total:number;reduction_amount:number;total_basis:'including_surcharge';
 requested_by:string;instruction:string;recorded_at:string;previous_draft_sha256?:string;
}
export function buildDisclosureReview(ticket:string,defendant:string,scans:Scan[],manifestCount:number,comparable?:ResolutionComparable,explicitComparable=false,requestInstruction?:ReviewRequestInstruction){
 const normalized=normalizeTicket(ticket);
 const observations=scans.flatMap(s=>s.observations.map(o=>({...o,file:s.name,sha256:s.sha256})));
 const values=(key:string)=>[...new Set(observations.filter(o=>o.key===key).map(o=>{const v=o.value.trim();return ['speed','limit','fine'].includes(key)&&/^\d+(?:\.\d{1,2})?$/.test(v)?String(Number(v)):v;}))];
 const holds:string[]=[];
 if(scans.length!==manifestCount+1||scans.some(s=>!s.all_pages_read))holds.push('Every disclosure file and all pages of the source ticket must be readable.');
 if(scans.some(s=>s.ticket_numbers.some(t=>normalizeTicket(t)!==normalized)))holds.push('A document names another ticket; verify the package.');
 for(const key of ['speed','limit','fine','owner_liability','offence_date'])if(values(key).length>1)holds.push(`Conflicting ${key.replaceAll('_',' ')} evidence.`);
 const source=scans.find(s=>s.name==='Source ticket');
 if(!source?.ticket_numbers.some(t=>normalizeTicket(t)===normalized))holds.push('The source ticket number was not verified.');
 const defendants=source?.observations.filter(o=>o.key==='defendant').map(o=>o.value.trim())||[];
 if(!defendants.some(n=>n.toUpperCase().replace(/[^A-Z0-9]/g,'')===defendant.toUpperCase().replace(/[^A-Z0-9]/g,'')))holds.push('Legal defendant must match the source ticket.');
 if(defendants.some(n=>n.toUpperCase().replace(/[^A-Z0-9]/g,'')!==defendant.toUpperCase().replace(/[^A-Z0-9]/g,''))||scans.some(s=>s.name!=='Source ticket'&&s.observations.some(o=>o.key==='defendant'&&o.value.toUpperCase().replace(/[^A-Z0-9]/g,'')!==defendant.toUpperCase().replace(/[^A-Z0-9]/g,''))))holds.push('A document identifies a different defendant; verify the name and its labelled role.');
 const owner=values('owner_liability')[0]==='true';
 if(!['true','false'].includes(values('owner_liability')[0]))holds.push('Confirm whether this is registered-owner liability or a driver charge.');
 if(values('plate_fingerprint').length>1)holds.push('The plate evidence differs between documents. Verify the original images and source ticket.');
 const speedText=values('speed')[0],limitText=values('limit')[0];
 const speed=speedText&&/^\d{1,3}$/.test(speedText)?Number(speedText):null;
 const limit=limitText&&/^\d{1,3}$/.test(limitText)?Number(limitText):null;
 const sectionEvidence=values('section');
 const sections=sectionEvidence.filter(s=>statutes(s).includes('TSA')).flatMap(sectionTokens);
 const excess=speed!==null&&limit!==null?speed-limit:null;
 const isSpeed=sections.some(s=>s.startsWith('115(2)(p'));
 const candidates=catalog.rules.filter(r=>isSpeed&&r.row<=8
  ?excess!==null&&excess>0&&(r.row===5?excess<=15:r.row===6?excess>15&&excess<=30:r.row===7?excess>30&&excess<=50:excess>50)
  :r.row>8&&sectionEvidence.some(e=>statutes(e).some(a=>statutes(r.current_section||'').includes(a))&&sectionTokens(r.current_section||'').some(s=>sectionTokens(e).includes(s))));
 if(!candidates.length)holds.push('No exact supported offence/band exists in this reference; manual review required.');
 if(isSpeed&&excess===null)holds.push('Exact measured speed and posted limit are required for a speeding-band match.');
 const checklist=CHECKS.map(key=>({key,findings:scans.flatMap(s=>s.checks.filter(c=>c.key===key).map(c=>({...c,file:s.name,sha256:s.sha256}))),status:scans.some(s=>s.checks.some(c=>c.key===key&&c.status==='concern'))?'concern':scans.some(s=>s.checks.some(c=>c.key===key&&c.status==='supported'))?'supported':'missing'}));
 const plate=checklist.find(c=>c.key==='plate_match')!;
 plate.status=values('plate_fingerprint').length>1?'concern':source?.observations.some(o=>o.key==='plate_fingerprint')&&scans.some(s=>s.name!=='Source ticket'&&s.observations.some(o=>o.key==='plate_fingerprint'))?'supported':'missing';
 const rule=candidates.length===1?candidates[0]:null;
 if(candidates.length>1)holds.push('Multiple offence rows match; select the correct offence before drafting.');
 const band=(n:number)=>n<=15?1:n<=30?2:n<=50?3:4;
 const fineText=values('fine')[0];
 const originalFine=fineText&&/^\d+(?:\.\d{1,2})?$/.test(fineText)?Number(fineText):null;
 // A staff instruction is separate from historical offer evidence. Persist it
 // with the package so regenerating a draft cannot revert a requested reduction.
 const instructedReduction=requestInstruction?.reduction_amount;
 const validInstruction=requestInstruction&&normalizeTicket(String(requestInstruction.ticket_number))===normalized
  &&originalFine!==null&&requestInstruction.original_total===originalFine
  &&typeof instructedReduction==='number'&&Number.isFinite(instructedReduction)&&instructedReduction>0&&instructedReduction<originalFine
  &&Math.abs(instructedReduction*100-Math.round(instructedReduction*100))<0.000001
  &&requestInstruction.total_basis==='including_surcharge'&&Boolean(requestInstruction.requested_by?.trim())
  &&Boolean(requestInstruction.instruction?.trim())&&!Number.isNaN(Date.parse(requestInstruction.recorded_at));
 if(requestInstruction&&!validInstruction)holds.push('The requested reduction must match this ticket and verified total fine, with an audited staff instruction.');
 const sameConstructionCharge=owner&&sections.includes('160(1)')&&sections.includes('115(2)(p.2)')&&values('construction_uplift')[0]==='true';
 const comparableSections=comparable?sectionTokens(comparable.section.toLowerCase().replace('tsa','TSA')):[];
 const applicableComparable=comparable&&sameConstructionCharge&&comparable.owner_liability&&comparable.construction_zone&&statutes(comparable.section).includes('TSA')&&comparable.original_demerits===0&&comparable.offered_demerits===0
  &&comparableSections.includes('160(1)')&&comparableSections.includes('115(2)(p.2)')
  &&normalizeTicket(comparable.ticket_number)!==normalized&&excess!==null&&excess>0
  &&comparable.speed>comparable.speed_limit&&comparable.speed_limit===limit
  &&(explicitComparable||band(comparable.speed-comparable.speed_limit)===band(excess))
  &&originalFine!==null&&Number.isFinite(Number(comparable.offered_total))&&Number(comparable.offered_total)>0
  &&Number(comparable.offered_total)<Number(comparable.original_total)&&Number(comparable.offered_total)<originalFine
 &&/^[a-f0-9]{64}$/.test(comparable.evidence_sha256)&&!Number.isNaN(Date.parse(comparable.verified_at))?comparable:null;
 const requestedTotal=validInstruction?Number((originalFine!-instructedReduction!).toFixed(2)):applicableComparable?Number(applicableComparable.offered_total):null;
 const requestedSaving=requestedTotal!==null?Number((originalFine!-requestedTotal).toFixed(2)):null;
 // This is a review request, never a guilty plea, client election or assertion of
 // an unproven defence. Known point savings for driver offences never transfer to owners.
 const cite=(...keys:string[])=>observations.filter(o=>keys.includes(o.key)).map(o=>`${o.file}, page ${o.page}`).filter((v,i,a)=>a.indexOf(v)===i).join('; ');
 let draft:string|null=null;
 if(!holds.length&&rule){
  const facts=isSpeed?`The disclosure records a measured speed of ${speed} km/h and a limit of ${limit} km/h (${cite('speed','limit')}).`: `The source material identifies ${rule.original_offence} under ${rule.current_section} (${cite('section')}).`;
  const target=validInstruction
   ?`Please consider a $${instructedReduction!.toFixed(2)} reduction in the total fine, from $${originalFine!.toFixed(2)} to $${requestedTotal!.toFixed(2)}, inclusive of surcharge, on the existing ${owner?'registered-owner ':''}charge. ${sameConstructionCharge?'While acknowledging the seriousness of construction-zone enforcement, we request a discretionary reduction reflecting the alleged excess speed of '+excess+' km/h and the opportunity to resolve the matter before trial. ':''}Any proposed resolution remains subject to our client's approval.`
   :applicableComparable
   ?`Please consider reducing the total fine to $${Number(applicableComparable.offered_total).toFixed(2)} or lower, inclusive of surcharge, on the existing registered-owner charge. While acknowledging the seriousness of construction-zone enforcement, we request a discretionary reduction reflecting the alleged excess speed of ${excess} km/h and the opportunity to resolve the matter before trial, subject to our client's approval of any proposed resolution.`
   :owner||rule.row===5||rule.target_section==='Same section'
   ?'Please consider a reduction of the fine on the existing charge.'
   :`Please assess whether ${rule.primary_plea_target} (${rule.target_section}) is supported by the disclosed facts, and whether an appropriate fine reduction can be offered. This request does not represent an admission to an alternative offence.`;
  const questions:Record<string,string>={plate_match:'Please clarify the vehicle identification evidence.',site_permission:'Please clarify the deployment authorization.',zone_hours:'Please clarify the applicable zone timing.',construction_workers:'Please clarify the evidence of worker presence and construction-zone requirements.',five_minute_rule:'Please review the recorded deployment and event timing.',mailing_service:'Please clarify the service and mailing evidence.',ownership:'Please clarify the registered-owner evidence.',operator_calibration:'Please clarify the recorded device testing and calibration evidence.'};
  const concerns=checklist.filter(c=>c.status==='concern').map(c=>{const refs=c.findings.filter(f=>f.status==='concern'&&f.page).map(f=>`${f.file}, page ${f.page}: “${f.quote}”`).join('; ');return `${questions[c.key]} The disclosed record states: ${refs}`;}).join('\n\n');
  draft=`Ticket ${normalized} — Request for prosecutor review\n\nFabsy acts for ${defendant}. Please review the disclosed evidence and consider an appropriate resolution.\n\n${facts}${concerns?'\n\n'+concerns:''}\n\n${target}\n\nPlease provide the exact proposed charge, total fine including surcharge, applicable penalty and response deadline for client consideration. This is a request for review, not acceptance of an offer or an entry of a plea.\n\nThank you,\nThe Fabsy Team`;
 }
 return {complete:!scans.some(s=>!s.all_pages_read)&&scans.length===manifestCount+1,blocked:holds.length>0,holds,
  ticket_number:normalized,defendant,owner_liability:owner,excess_kmh:excess,observations,checklist,
  operator_corrections:scans.flatMap(s=>(s.operator_corrections||[]).map(c=>({...c,file:s.name}))),
  reference:{filename:catalog.source_filename,version:catalog.version,sha256:catalog.sha256},
  operator_request:requestInstruction||null,
  proposal:requestedTotal!==null?{original_total:originalFine,requested_total:requestedTotal,requested_saving:requestedSaving,total_basis:'including_surcharge',source:validInstruction?'explicit_staff_instruction':'internal_comparable',status:'request_not_crown_offer'}:null,
  comparable:applicableComparable?{...applicableComparable,selection:explicitComparable?'operator_selected':'same_charge_and_speed_band',current_total:originalFine,requested_total:requestedTotal,requested_saving:requestedSaving,status:'prior_offer_not_current_offer',visibility:'internal_only',note:'Internal reference only: never name another client, ticket or offer in the government request. Verified prior offer, not proof of acceptance or payment. The proposed reduction remains discretionary; speed and fine differences remain visible to staff.'}:null,
  comparable_hold:comparable&&!applicableComparable?'The selected comparable does not match verified charge, owner, construction-zone and fine evidence. No amount was carried over.':null,
  candidates:candidates.map(r=>({...r,applicable_original_points:owner?0:r.points,applicable_target_points:owner?0:r.target_points,applicable_point_reduction:owner?0:r.point_reduction,
   numeric_fine_saving:typeof r.standard_fine_penalty==='number'&&typeof r.target_fine_penalty==='number'?r.standard_fine_penalty-r.target_fine_penalty:null,
   status:'conditional_staff_review',fine_note:sameConstructionCharge?'The reference matches the speed band; its ordinary speeding fine ranges do not establish the construction-zone fine. The request retains the registered-owner construction charge. No removal of the construction uplift, driver charge or demerit benefit is inferred. Verify offence-date law; the proposed amount remains discretionary.':'Reference totals/ranges are not an offer. Validate the law and surcharge at the offence date; negotiated amounts remain unknown.'})),
  generated_at:new Date().toISOString(),draft_text:draft};
}
