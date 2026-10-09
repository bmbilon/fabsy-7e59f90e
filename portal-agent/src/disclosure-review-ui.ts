type Api=(action:string,values?:Record<string,unknown>)=>Promise<any>;
export function renderDisclosureReviews(data:any,api:Api,refresh:()=>Promise<void>,message:(s:string)=>void){
 const root=document.getElementById('disclosure-reviews')!;root.replaceChildren();
 const n=(tag:string,text:string,css='')=>{const e=document.createElement(tag);e.textContent=text;e.className=css;return e;};
 root.append(n('h2','Disclosure review & request creation'));
 if(!data.disclosureReviews?.length)root.append(n('p','Disclosure notices queue retrieval. Review begins only after the complete package is saved.','subtle'));
 for(const p of data.disclosureReviews||[]){
  const card=n('article','','card');card.id='disclosure-'+p.id;
  card.append(n('h3',`Ticket ${p.ticket_number}`),n('p',`${p.status.replaceAll('_',' ')} · ${p.manifest.length} disclosure files · received ${new Date(p.complete_at).toLocaleString()}`));
  const review=p.review;
  if(p.last_error)card.append(n('p',`Review needs attention: ${p.last_error}`,'warning'));
  for(const doc of (data.disclosureDocuments||[]).filter((d:any)=>d.job_id===p.job_id&&p.manifest.some((m:any)=>m.name===d.name&&m.sha256===d.sha256))){
   const open=n('button',`Open ${doc.name}`) as HTMLButtonElement;
   open.onclick=async()=>{const w=window.open('about:blank','_blank');try{const d=await api('disclosure-document',{id:doc.id});if(w){w.opener=null;w.location.href=d.url;}}catch(e){w?.close();message(e instanceof Error?e.message:'Document unavailable.');}};card.append(open);
  }
  if(review){
   if(review.comparable){const c=review.comparable;card.append(n('h3',`Internal reference: Ticket ${c.ticket_number}`),n('p',`Verified prior offer $${Number(c.original_total).toFixed(2)} → $${Number(c.offered_total).toFixed(2)}. ${c.speed} in ${c.speed_limit} km/h. Same registered-owner construction-zone charge.`),n('p',`This request: $${Number(c.current_total).toFixed(2)} → requested $${Number(c.requested_total).toFixed(2)} or lower. Proposed saving: $${Number(c.requested_saving).toFixed(2)}. Awaiting a Crown offer.`),n('p',c.note,'subtle'));}
   if(review.comparable_hold)card.append(n('p',review.comparable_hold,'warning'));
   for(const hold of review.holds||[])card.append(n('p',hold,'warning'));
   const details=n('details','');details.className='offer-form';details.append(n('summary','Evidence findings and reference rows'));
   for(const c of review.operator_corrections||[])details.append(n('p',`Verified evidence correction — ${c.file}: ${c.field}. ${c.reason} Actual evidence: “${c.quote}”. Recorded ${new Date(c.verified_at).toLocaleString()} by ${c.verified_by}. Original extraction preserved.`,'warning'));
   for(const o of review.observations||[])details.append(n('p',`${o.key.replaceAll('_',' ')}: ${o.value} — ${o.file}, page ${o.page}. “${o.quote}”`));
   for(const c of review.checklist||[]){details.append(n('h3',`${c.key.replaceAll('_',' ')}: ${c.status}`));for(const f of c.findings)details.append(n('p',`${f.detail} ${f.page?`(${f.file}, page ${f.page})`:''}`));}
   for(const r of review.candidates||[]){
    details.append(n('h3',`${r.original_offence} → ${r.primary_plea_target}`),n('p',`${r.sheet}, ${r.range}. Fine: ${r.standard_fine_penalty} → ${r.target_fine_penalty}. Driver points: ${r.points} → ${r.target_points}.`));
    if(review.owner_liability)details.append(n('p','Registered-owner liability: driver demerit reductions do not apply.','subtle'));
    details.append(n('p',`Fits when: ${r.when_target_fits}`),n('p',`Limits: ${r.negotiation_limits}`),n('p',`Backup: ${r.backup_target}`),n('p',r.fine_note,'subtle'));
   }
   details.append(n('p',`${review.reference.filename} · version ${review.reference.version} · ${review.reference.sha256}`,'reference'));card.append(details);
  }
  if(p.draft_text){
   card.append(n('h3','Proposed government portal request'),n('pre',p.draft_text));
   const copy=n('button','Copy request text') as HTMLButtonElement;copy.onclick=async()=>{try{await navigator.clipboard.writeText(p.draft_text);message('Request copied.');}catch{message('Select and copy the request text above.');}};card.append(copy);
   if(p.status==='needs_review'&&!review.blocked){
    const terms=data.portalTerms;
    if(!terms){card.append(n('p','Government terms must be available before approval. Refresh to load them.','warning'));root.append(card);continue;}
    const termsDetails=n('details','');termsDetails.append(n('summary',`Government terms — effective ${terms.effective_date}`),n('pre',terms.text));
    const termsLink=n('a','Read the current government terms ↗') as HTMLAnchorElement;termsLink.href=terms.url;termsLink.target='_blank';termsLink.rel='noopener noreferrer';termsDetails.append(termsLink);card.append(termsDetails);
    const form=document.createElement('form');form.className='offer-form disclosure-approval';form.onsubmit=e=>e.preventDefault();
    const label=n('label',`Approve this exact request for Ticket ${p.ticket_number}. I confirm the supplied information is accurate and truthful. I have reviewed the evidence and verified consent, signer authority, client instructions, the proposed target and applicable law. I authorize Fabsy to accept the government terms shown above and submit this request.`);
    const box=document.createElement('input');box.type='checkbox';box.name='combined-approval';label.prepend(box);form.append(label);
    form.append(n('p','One tick saves approval. It covers this request and these terms only; it does not accept a prosecutor offer or enter a plea.','subtle'));
    box.onchange=async()=>{if(!box.checked||box.disabled)return;box.disabled=true;form.dataset.edited='true';message('Saving approval…');try{await api('approve-disclosure-review',{id:p.id,hash:p.draft_sha256,attestations:{confirmed:true,version:'review-and-terms-v1',terms_sha256:terms.sha256,scope:'exact_review_request'}});message('Approved. The government submission is queued; its confirmation will appear here.');form.dataset.edited='false';await refresh();}catch(e){box.checked=false;form.dataset.edited='false';message(e instanceof Error?e.message:'Approval failed.');}finally{box.disabled=false;}};
    card.append(form);
   }
  }
  if(p.review_submission_job_id){
   const job=(data.jobs||[]).find((j:any)=>j.id===p.review_submission_job_id);
   card.append(n('p',p.status==='submitted'?'Government submission confirmed.':`Government submission: ${(job?.status||'queued').replaceAll('_',' ')}. ${job?.review_reason||'The cloud agent will submit this approved request and save the confirmation.'}`,'subtle'));
   const link=n('a','Open submission job','button') as HTMLAnchorElement;link.href='/admin/portal?job='+encodeURIComponent(p.review_submission_job_id);card.append(link);
   if(p.client_update_draft_id){const email=n('a','Review client status update','button') as HTMLAnchorElement;email.href='/admin/portal?draft='+encodeURIComponent(p.client_update_draft_id);card.append(email);}
  }
  if(p.status==='approved'&&!p.review_submission_job_id){
   const termsApproved=p.approval_evidence?.government_terms?.authorized===true&&p.approval_evidence?.portal_submission_authorized===true;
   card.append(n('p',termsApproved?'Approved request. The saved approval includes the displayed government terms and submission of this exact request. Verify the live portal state before submitting; changed terms require a new approval.':'Approved request. Government terms were not included in the saved approval and require separate confirmation.','warning'));
   const link=n('a','Open government ticket options','button') as HTMLAnchorElement;link.href='https://traffictickets.alberta.ca/ticket-number-search?ticketNumber='+encodeURIComponent(p.ticket_number);link.target='_blank';link.rel='noopener noreferrer';card.append(link);
   const form=document.createElement('form');form.className='offer-form disclosure-approval';form.oninput=()=>{form.dataset.edited='true';};
   const url=document.createElement('input');url.type='url';url.required=true;url.placeholder='Official confirmation page URL';
   const text=document.createElement('textarea');text.required=true;text.placeholder='Paste the actual review-request confirmation';text.minLength=20;
   const button=n('button','Record portal submission receipt') as HTMLButtonElement;button.type='submit';form.append(n('label','Confirmation URL'),url,n('label','Confirmation text'),text,button);
   form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await api('record-review-receipt',{id:p.id,hash:p.draft_sha256,receipt:{ticket_number:p.ticket_number,url:url.value,confirmation:text.value,recorded_at:new Date().toISOString(),source:'staff_verified_portal'}});message('Review receipt recorded.');await refresh();}catch(e){message(e instanceof Error?e.message:'Receipt failed.');}finally{button.disabled=false;}};card.append(form);
  }
  if(p.receipt)card.append(n('pre',p.receipt.confirmation));
  root.append(card);
 }
}
