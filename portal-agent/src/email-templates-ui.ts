type Api = (action:string, input?:Record<string,unknown>)=>Promise<any>;
const node=(tag:string,text='')=>{const el=document.createElement(tag);el.textContent=text;return el;};

export function mountEmailTemplates(container:HTMLElement, api:Api, refresh:()=>Promise<void>, message:(text:string)=>void) {
 const heading=node('h2','Automatic email templates');
 const intro=node('p','Approve each version once. Verified case facts fill its fields, and eligible emails then send through hello@fabsy.ca. Staff-written messages still need individual approval.');
 const load=node('button','Review email templates') as HTMLButtonElement;
 const list=node('div');
 container.replaceChildren(heading,intro,load,list);
 async function render(){
  const result=await api('email-templates');list.replaceChildren();
  for(const template of result.templates){
   const card=node('article');card.className='card template-review';
   card.append(node('h3',`${template.title} · version ${template.version}`),node('p',template.status==='approved'?'Approved for automatic sends':template.status==='draft'?'Needs one-time approval':'Revoked — automatic sends disabled'));
   card.append(node('p','From: The Fabsy Team <hello@fabsy.ca>'),node('p','To: the verified client for this ticket'),node('p','Subject: '+template.content.subject));
   const frame=document.createElement('iframe');frame.className='email-preview';frame.title='Template email body';frame.setAttribute('sandbox','');frame.referrerPolicy='no-referrer';
   frame.srcdoc=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1">`+template.content.html;
   card.append(frame);
   const plain=node('details');plain.append(node('summary','Plain-text version'),node('pre',template.content.text));card.append(plain);
   const slots=node('dl');for(const [key,meaning] of Object.entries(template.slots)){slots.append(node('dt',`{{${key}}}`),node('dd',String(meaning)));}card.append(slots);
   if(template.approved_at)card.append(node('p','Template approved '+new Date(template.approved_at).toLocaleString()));
   if(template.status!=='revoked'){
    const controls=node('div');controls.className='row';
    const buttons:HTMLButtonElement[]=[];
    async function review(approve:boolean){
     buttons.forEach(b=>b.disabled=true);
     try{
      await api(approve?'approve-email-template':'revoke-email-template',{id:template.id,hash:template.content_hash});
      message(approve?'Template approved. Queued and future emails using this version can send after their facts are rechecked.':'Template revoked. Unsent messages using this version are held.');
      await render();await refresh();
     }catch(error){message(error instanceof Error?error.message:'Template review failed. Refresh before trying again.');buttons.forEach(b=>b.disabled=false);}
    }
    if(template.status==='draft'){
     card.append(node('p','Approve this exact copy and the fields listed above for queued and future matching emails. Existing messages awaiting individual approval are not changed.'));
     const approve=node('button','Approve template version') as HTMLButtonElement;approve.className='primary';approve.onclick=()=>review(true);buttons.push(approve);controls.append(approve);
    }
    const revoke=node('button',template.status==='approved'?'Stop using this version':'Reject this version') as HTMLButtonElement;revoke.onclick=()=>review(false);buttons.push(revoke);controls.append(revoke);card.append(controls);
   }
   list.append(card);
  }
 }
 load.onclick=async()=>{load.disabled=true;try{await render();}catch(error){message(error instanceof Error?error.message:'Unable to load templates.');}finally{load.disabled=false;}};
}
