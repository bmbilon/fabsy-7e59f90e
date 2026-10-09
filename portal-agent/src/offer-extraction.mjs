// Suggestions only: staff must verify them against the current official pages.
// Ambiguous or missing fields remain blank; Court/Due date is never a trial date.
export function extractOfferFields(ticket, text, url, observedAt) {
 const u = new URL(url);
 if (u.origin !== 'https://traffictickets.alberta.ca' || u.pathname !== '/dispute-response') return {};
 const ids = [...new Set(text.match(/\b[A-Z]{1,3}\d{6,12}[A-Z]?\b/g) || [])];
 if (ids.length !== 1 || ids[0] !== ticket) return {};
 const offer = text.split(/\bOffer\b/)[1]?.split(/Please note:/)[0];
 if (!offer || !/Original charge and penalty/i.test(offer) || !/New charge and penalty/i.test(offer) || offer.search(/Original charge and penalty/i)>offer.search(/New charge and penalty/i)) return {};
 const money = [...offer.matchAll(/\$([\d,]+(?:\.\d{2})?)(?![\d.])/g)].map(m => Number(m[1].replaceAll(',', '')));
 const demerits = [...offer.matchAll(/\b(\d+) demerits?\b/gi)].map(m => Number(m[1]));
 const charges = [...offer.matchAll(/Section\s+([^\n]+(?:\n(?!Section|New charge|Original charge|\d+ demerit|\$|Ticket number|Refer to)[^\n]+)*)/g)].map(m => m[0].replace(/\s+/g, ' ').trim());
 const fields = {};
 if (money.length === 2 && money.every(n => n > 0 && n <= 100000)) Object.assign(fields, {original_total: money[0], offered_total: money[1]});
 if (demerits.length === 2) fields.demerits = demerits[1];
 if (charges.length === 2) fields.charge = charges[1];
 const date = text.match(/(?:Updated|Response) due date\s*:?\s*(\d{4}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2}, \d{4})\b/i);
 if (date) {
  const parsed=extractScheduleCandidate(ticket,`${ticket} Trial date ${date[1]}`,u.href,observedAt);
  if(parsed)fields.due_date=parsed.date;
 }
 fields.deadline_source = `${u.href} — captured ${observedAt}`;
 return fields;
}

export function extractScheduleCandidate(ticket, text, url, observedAt) {
 const u=new URL(url);
 if(u.origin!=='https://traffictickets.alberta.ca' || !['/ticket-penalty-and-options','/dispute-response'].includes(u.pathname))return null;
 const tickets=[...new Set(text.match(/\b[A-Z]{1,3}\d{6,12}[A-Z]?\b/g)||[])];
 if(tickets.length!==1||tickets[0]!==ticket)return null;
 const matches=[...text.matchAll(/\b(Trial date|Court\/Due date)\s*:?\s*(\d{4}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2}, \d{4})\b/g)];
 if(matches.length!==1)return null;
 const [,label,value]=matches[0];
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const english=value.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);
 const date=english?`${english[3]}-${String(months.indexOf(english[1])+1).padStart(2,'0')}-${english[2].padStart(2,'0')}`:value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return null;
 return {date,label,source:`${u.href} — captured ${observedAt}`,requires_trial_confirmation:true};
}
