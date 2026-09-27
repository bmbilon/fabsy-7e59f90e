type Api=(action:string,values?:Record<string,unknown>)=>Promise<any>;
const node=(tag:string,text:string)=>{const n=document.createElement(tag);n.textContent=text;return n;};
export async function renderAds(root:HTMLElement,api:Api,message:(text:string)=>void){
 root.replaceChildren();root.hidden=false;root.append(node('h2','Paid acquisition launch'));
 let data:any;
 try{data=await api('ads-status');}catch{root.append(node('p','Ads engine is awaiting its database and worker deployment.'));return;}
 root.append(node('p',data.state.paused?'Automation paused. Campaign delivery is checked separately.':'Approved launch controls are configured.'));
 if(data.state.last_error)root.append(node('p',data.state.last_error));
 const pause=node('button','Pause paid campaigns') as HTMLButtonElement;pause.onclick=async()=>{pause.disabled=true;try{await api('ads-pause');message('Pause recorded and live delivery checked.');await renderAds(root,api,message);}catch(e){message((e as Error).message);}finally{pause.disabled=false;}};root.append(pause);
 const recheck=node('button','Recheck live data') as HTMLButtonElement;recheck.onclick=async()=>{recheck.disabled=true;try{await api('ads-recheck');await renderAds(root,api,message);}catch(e){message((e as Error).message);}finally{recheck.disabled=false;}};root.append(recheck);
 for(const batch of data.batches){
  const box=node('article','');box.className='card';box.append(node('h3',`Launch batch: ${batch.status}`));
  const config=batch.payload.config;
  const measurement=batch.payload.kind==='measurement_setup';
  if(measurement)box.append(node('p','Create Qualified Ticket Upload as primary; reuse Officer Paid and Camera Paid as secondary. This setup does not enable campaigns or authorize spending.'));
  box.append(node('p',`CAD, America/Edmonton. Officer $${config.campaigns['G-Search-Officer'].dailyBudgetCad}/day. Camera $${config.campaigns['G-Search-Camera'].dailyBudgetCad}/day. Learning limit: ${config.learningSpendLimitCad===null?'not proposed':`$${config.learningSpendLimitCad}`}. Start: ${config.startDate||'not proposed'}.`));
  box.append(node('p','One approval covers this exact copy, destinations, targeting, bidding, budgets and delayed safety pauses. Opening this page grants no approval.'));
  const details=node('details','');details.append(node('summary','Review frozen campaign copy and controls'),node('pre',JSON.stringify(batch.payload,null,2)));box.append(details);
  if(batch.payload.holds.length)box.append(node('p','Launch holds: '+batch.payload.holds.join(', ')));
  if(batch.status==='pending'){
   if(batch.payload.holds.includes('DESTINATION_AND_DIAGNOSTICS_VERIFICATION_REQUIRED')){
    const label=node('label','Record verified destination, test upload and test payment diagnostic evidence');
    const evidence=document.createElement('textarea');evidence.placeholder='Describe exact test receipts, dedup checks, Google diagnostic evidence and verified destination content. Do not include client records.';
    const record=node('button','Save readiness evidence') as HTMLButtonElement;
    record.onclick=async()=>{record.disabled=true;try{await api('ads-verify-readiness',{id:batch.id,evidence:evidence.value});await renderAds(root,api,message);}catch(e){message((e as Error).message);}finally{record.disabled=false;}};
    label.append(evidence);box.append(label,record);
   }
   const approve=node('button',measurement?'Approve conversion setup':'Approve this launch batch') as HTMLButtonElement;
   approve.className='primary';approve.disabled=batch.payload.holds.length>0;
   approve.onclick=async()=>{approve.disabled=true;try{await api('ads-approve',{id:batch.id,hash:batch.payload_hash});message('The frozen launch batch is approved.');await renderAds(root,api,message);}catch(e){message((e as Error).message);}finally{approve.disabled=false;}};
   const reject=node('button','Reject batch') as HTMLButtonElement;reject.onclick=async()=>{reject.disabled=true;try{await api('ads-reject',{id:batch.id,hash:batch.payload_hash});await renderAds(root,api,message);}catch(e){message((e as Error).message);}finally{reject.disabled=false;}};box.append(approve,reject);
  }
  if(measurement&&batch.status==='approved'){
   const apply=node('button','Apply approved conversion setup') as HTMLButtonElement;
   apply.onclick=async()=>{apply.disabled=true;try{await api('ads-apply-measurement',{id:batch.id,dryRun:false});message('Conversion setup applied.');await renderAds(root,api,message);}catch(e){message((e as Error).message);}finally{apply.disabled=false;}};box.append(apply);
  }
  root.append(box);
 }
 if(data.reports[0]){const details=node('details','');details.append(node('summary','Latest daily report'),node('pre',JSON.stringify(data.reports[0].payload,null,2)));root.append(details);}
 const id=new URLSearchParams(location.search).get('ads');if(id&&data.batches.some((b:any)=>b.id===id))root.scrollIntoView({block:'start'});
}
