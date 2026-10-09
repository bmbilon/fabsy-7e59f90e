import {normalizePortalLookup,portalLookupLabels,type PortalLookupKind} from '../../supabase/functions/_shared/portal-lookup-values';
type Detail={kind:PortalLookupKind;value:string;provenance:string};
type Api=(action:string,values:Record<string,unknown>)=>Promise<any>;
const element=(tag:string,text:string,className='')=>{const item=document.createElement(tag);item.textContent=text;item.className=className;return item;};
function copySynchronously(value:string){
 const input=document.createElement('textarea');input.value=value;input.readOnly=true;input.setAttribute('aria-label','Lookup value to copy');
 input.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';document.body.append(input);input.focus();input.select();input.setSelectionRange(0,value.length);
 try{return typeof document.execCommand==='function'&&document.execCommand('copy');}catch{return false;}finally{input.remove();}
}
export async function copyLookupValue(value:string){
 if(copySynchronously(value))return;
 if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
 throw new Error('Clipboard access is unavailable. Select the displayed value and copy it.');
}
export function mountPortalLookup(card:HTMLElement,job:any,api:Api,message:(value:string)=>void,refresh:()=>Promise<void>,autoLoad=false){
 if(job.action!=='submit_initial_disclosure'||job.status==='completed'||job.result?.phase==='committing')return;
 const root=element('details','','portal-lookup') as HTMLDetailsElement;root.open=autoLoad;
 root.append(element('summary','Ticket lookup details'));card.append(root);
 const body=element('div','','lookup-body');root.append(body);let loaded=false;
 const load=async()=>{
  if(loaded)return;loaded=true;body.replaceChildren(element('p','Loading this ticket’s lookup details…','subtle'));
  try{
   const result=await api('lookup-details',{id:job.id});if(!root.isConnected)return;
   if(result.ticket_number!==job.ticket_number)throw new Error('The lookup details belong to a different ticket. Refresh this case.');
   body.replaceChildren();
   if(result.loading){body.append(element('p','The agent is checking the source ticket. Refresh this case when that check finishes.','subtle'));return;}
   body.append(element('p',result.defendant||'Defendant name requires verification'));
   const details:Detail[]=result.details||[];
   if(details.length){
    const select=document.createElement('select');select.setAttribute('aria-label','Lookup identifier');
    for(const detail of details)select.append(new Option(portalLookupLabels[detail.kind],detail.kind));
    const value=document.createElement('input');value.readOnly=true;value.setAttribute('aria-label','Verified lookup value');
    const selected=()=>details.find(detail=>detail.kind===select.value)!;
    const source=element('p','','subtle');
    const show=()=>{value.value=selected().value;source.textContent=selected().provenance==='source_ticket'?'Verified from the uploaded ticket.':selected().provenance==='signed_consent'?'Recorded in the signed consent.':selected().provenance==='client_confirmation'?'Supplied by the client for this ticket.':'Confirmed by staff for this ticket.';};show();select.onchange=show;
    const copy=element('button','Copy lookup value') as HTMLButtonElement;copy.type='button';
    copy.onclick=async()=>{copy.disabled=true;try{await copyLookupValue(selected().value);message(portalLookupLabels[selected().kind]+' copied for ticket '+job.ticket_number+'.');}catch(error){message((error as Error).message);value.focus();value.select();}finally{copy.disabled=false;}};
    body.append(select,value,source,copy);
    const target=new URL(job.source_url);
    if(target.origin==='https://traffictickets.alberta.ca'){
     const link=element('a','Copy lookup value and open government portal','button') as HTMLAnchorElement;link.href=target.href;link.target='_blank';link.rel='noopener noreferrer';
     let copied=false;
     link.onclick=event=>{
      if(copied){copied=false;return;}
      const detail=selected();
      if(copySynchronously(detail.value)){message('Copied '+portalLookupLabels[detail.kind].toLowerCase()+'. Select that option in the government portal and paste the value.');return;}
      event.preventDefault();
      void copyLookupValue(detail.value).then(()=>{if(!link.isConnected)return;copied=true;link.click();}).catch(error=>{message((error as Error).message);value.focus();value.select();});
     };body.append(link);
    }
    body.append(element('p','The cloud agent fills the portal automatically after you accept its session terms. Opening this separate portal uses the copied value.','subtle'));
   }else{
    body.append(element('p','The uploaded ticket and signed consent contain no usable plate, driver’s licence number, or date of birth. One is required for the government lookup.','warning'));
   }
   if(!result.can_edit)return;
   const form=document.createElement('form');form.className='lookup-form';
   const kind=document.createElement('select');kind.id='lookup-kind-'+job.id;kind.required=true;
   for(const key of ['plate','drivers_license','date_of_birth'] as const)kind.append(new Option(portalLookupLabels[key],key));
   const caption=element('label','Identifier to use') as HTMLLabelElement;caption.htmlFor=kind.id;
   const input=document.createElement('input');input.id='lookup-value-'+job.id;input.required=true;input.maxLength=60;input.autocomplete='off';
   const label=element('label','Licence plate') as HTMLLabelElement;label.htmlFor=input.id;
   kind.onchange=()=>{input.value='';input.type=kind.value==='date_of_birth'?'date':'text';label.textContent=portalLookupLabels[kind.value as PortalLookupKind];};
   const check=document.createElement('input');check.type='checkbox';check.required=true;
   const confirmation=element('label',`I verified this identifier belongs to ${result.defendant} or their vehicle for ticket ${job.ticket_number}.`);confirmation.prepend(check);
   const submit=element('button','Save and continue automatically') as HTMLButtonElement;submit.type='submit';
   const status=element('p','','subtle');status.setAttribute('role','status');
   form.append(caption,kind,label,input,confirmation,submit,status);
   form.onsubmit=event=>{
    event.preventDefault();if(submit.disabled||!check.checked)return;
    let normalized:string;try{normalized=normalizePortalLookup(kind.value,input.value);}catch{status.textContent='Enter a valid '+portalLookupLabels[kind.value as PortalLookupKind].toLowerCase()+'.';input.focus();return;}
    submit.disabled=true;kind.disabled=true;input.disabled=true;check.disabled=true;status.textContent='Saving the case lookup detail…';
    void api('lookup-save',{id:job.id,kind:kind.value,value:normalized,verified:true}).then(async result=>{
     if(result.saved!==true)throw new Error('The lookup detail was not confirmed saved. Refresh before trying again.');
     message(result.queued?'Lookup detail saved. The cloud agent will start the government session and show its terms here.':'Lookup detail saved. Refresh this case to check the next step.');await refresh();
    }).catch(error=>{status.textContent=(error as Error).message;}).finally(()=>{submit.disabled=false;kind.disabled=false;input.disabled=false;check.disabled=false;});
   };body.append(form);
  }catch(error){if(!root.isConnected)return;body.replaceChildren(element('p',(error as Error).message,'warning'));const retry=element('button','Reload lookup details') as HTMLButtonElement;retry.type='button';retry.onclick=()=>{loaded=false;void load();};body.append(retry);}
 };
 root.ontoggle=()=>{if(root.open)void load();};if(autoLoad)queueMicrotask(()=>{if(root.isConnected)void load();});
}
