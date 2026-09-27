// Only files linked by the verified disclosure page, under its exact ticket.
export function disclosureAsset(ticket,name,href){
 const url=new URL(href);
 if(url.origin!=='https://goaccapisprod.blob.core.windows.net'||url.username||url.password||url.hash||url.pathname!==`/ticket-disclosures/${ticket}/${encodeURIComponent(name)}`||!/^[^/\\\x00-\x1f]{1,180}$/.test(name))throw new Error('Invalid disclosure asset');
 const mime=/\.pdf$/i.test(name)?'application/pdf':/\.jpe?g$/i.test(name)?'image/jpeg':/\.png$/i.test(name)?'image/png':null;
 const expiry=Date.parse(url.searchParams.get('se')||'');
 if(!mime||url.searchParams.getAll('sp').length!==1||url.searchParams.get('sp')!=='r'||url.searchParams.getAll('sig').length!==1||!Number.isFinite(expiry)||expiry<=Date.now())throw new Error('Invalid disclosure asset');
 return {url:url.href,name,mime,source_path:url.pathname};
}
