import { Link } from "react-router-dom";
import { CheckCircle2, Phone, ShieldCheck } from "lucide-react";
import FeeRefundNotice from "@/components/FeeRefundNotice";
import StaticJsonLd from "@/components/StaticJsonLd";
import RapidResolutionCta from "@/components/RapidResolutionCta";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RAPID_RESOLUTION, PHOTO_RADAR } from "@/config/offers";
import { FEE_REFUND } from "@/config/feeRefund";
import { FABSY_WHATSAPP_URL, WHATSAPP_ENABLED } from "@/config/whatsapp";
import { VERIFIED_CLIENT_TESTIMONIALS } from "@/content/clientTestimonials";
import { HOMEPAGE_REFUND_COPY } from "@/content/homepageRefundCopy";
import useSafeHead from "@/hooks/useSafeHead";

const price = `$${RAPID_RESOLUTION.priceCad} CAD + GST`;
const total = (RAPID_RESOLUTION.priceCad * 1.05).toFixed(2);
const processSteps = [
  ["Upload and authorize", "A ticket photo or PDF, your email, and your digital authorization. Payment comes at checkout after your ticket details are confirmed."],
  ["Fabsy requests disclosure", "The request is tracked. It does not extend your deadline, so you receive deadline instructions and file updates."],
  ["Review and prosecutor step within 48 hours", `${RAPID_RESOLUTION.actionCommitment} The clock covers Fabsy's action, not the Crown's reply or the final outcome.`],
  ["You decide", "Fabsy explains any Crown response in plain language. You direct whether to accept. Nothing is accepted automatically."],
];
const faqs = [
  ["Is Fabsy a law firm?", "No. Fabsy is a traffic ticket agent service and does not give legal advice. A matter outside permitted agent scope may need a lawyer."],
  ["Do I have to go to court?", "Rapid Resolution is a pre-trial service handled online. If a court or the procedure requires you personally, you must attend. Trial representation is quoted separately."],
  ["Does uploading pause my deadline?", "No. Uploading a ticket or requesting disclosure does not extend a response date or trial date. You remain responsible for every deadline on your ticket, portal or court notice."],
  ["What if my ticket is not eligible?", "Fabsy reads the ticket and confirms eligibility. If Fabsy declines an otherwise complete paid matter before substantive work begins, the service fee is refunded."],
  ["Will you accept a deal without asking me?", "No. Fabsy explains the response; you give the case-specific instruction. Nothing is accepted automatically."],
  ["Is it resolved in 48 hours?", RAPID_RESOLUTION.speedDisclaimer],
  ["I got a photo radar notice in the mail. Which service do I need?", "Use Rapid Resolution: Photo Radar, $79 CAD + GST ($82.95 total), for eligible photo radar or red-light camera notices mailed to the registered owner."],
];
const excerpts: Record<string, string> = {
  Sam: "Excellent communication and responsiveness the whole time.",
  Paula: "thanks to Fabsy I ended up with a lesser amount at the end of the day",
  James: "answered all my questions clearly, didn't try to push any services on me, and made it easy to choose which option to start with.",
};

const heroReview = VERIFIED_CLIENT_TESTIMONIALS.find(review => review.name === "Sam" && review.quote.includes(excerpts.Sam));

export default function RapidResolution() {
  useSafeHead({ title: "Rapid Resolution | Alberta Ticket Help | $198 CAD + GST", description: "Fabsy negotiates eligible Alberta traffic tickets for a lower fine, fewer demerits or withdrawal. $198 + GST ($207.90 total). You approve any deal.", canonical: "https://fabsy.ca/rapid-resolution" });
  return <div className="rapid-landing min-h-screen bg-white text-slate-900">
    <StaticJsonLd dataAttr="rapid-resolution-service" schema={{ "@context": "https://schema.org", "@type": "Service", name: RAPID_RESOLUTION.name, description: RAPID_RESOLUTION.oneLineDescription, url: "https://fabsy.ca/rapid-resolution", areaServed: { "@type": "AdministrativeArea", name: "Alberta, Canada" }, provider: { "@type": "Organization", name: "Fabsy", url: "https://fabsy.ca" }, offers: { "@type": "Offer", price: RAPID_RESOLUTION.priceCad.toFixed(2), priceCurrency: "CAD", url: "https://fabsy.ca/submit-ticket" } }} />
    <StaticJsonLd dataAttr="rapid-resolution-faq" schema={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} />
    <header className="border-b border-slate-200 bg-white px-5 py-2">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link to="/" aria-label="Fabsy home" className="text-2xl font-bold tracking-tight text-slate-950">Fabsy</Link>
        <div className="flex items-center gap-5">
          <a href="tel:+18257932279" data-funnel-action="phone" data-funnel-position="header" aria-label="Call Fabsy at (825) 793-2279" className="inline-flex min-h-11 items-center gap-2 font-semibold text-slate-800"><Phone className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">(825) 793-2279</span></a>
          <RapidResolutionCta position="header" className="hidden lg:inline-flex" />
        </div>
      </div>
    </header>
    <main id="main-content">
      <section data-rapid-first-view className="bg-slate-950 px-5 pb-7 pt-5 text-white sm:py-12 lg:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-20">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-200 sm:text-xs"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Alberta traffic ticket agents</p>
            <h1 className="mt-[12px] text-[2.35rem] font-bold leading-[1.03] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">Fight your ticket.<br /><span className="text-blue-200">We do the work.</span></h1>
            <p data-rapid-offer className="mt-[12px] max-w-lg text-sm leading-5 text-slate-200 sm:mt-5 sm:text-lg sm:leading-7">We negotiate for a lower fine, fewer demerits or withdrawal. You approve any deal.</p>
            {heroReview && <figure className="mt-[12px] lg:hidden"><blockquote className="text-xs leading-4 text-slate-200">“{excerpts.Sam}”</blockquote><figcaption className="mt-[4px] text-[11px] text-slate-300">{heroReview.name} · {heroReview.location} · Shared with permission</figcaption></figure>}
            <div data-rapid-refund-summary className="mt-[16px] flex items-center gap-3 border-l-2 border-emerald-300 pl-3 sm:mt-6">
              <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-200" aria-hidden="true" />
              <div><p className="text-sm font-bold text-white sm:text-base">No improvement? Your service fee is refunded.<Link to={FEE_REFUND.termsPath} className="text-white underline" aria-label="Read the fee-refund conditions">*</Link></p><p className="mt-[4px] text-[11px] leading-4 text-slate-300">After the Crown rejects our efforts. Conditions apply. No legal outcome guaranteed.</p></div>
            </div>
            <div data-rapid-price className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="text-[2rem] font-bold leading-none tracking-tight text-white">${RAPID_RESOLUTION.priceCad}<span className="ml-1 text-sm font-medium text-slate-300">CAD + GST</span></p><p className="text-xs text-slate-300">${total} total · One-time fee</p></div>
            <RapidResolutionCta id="rapid-hero-cta" position="hero" className="mt-[16px] w-full sm:max-w-md" />
            <p className="mt-[8px] text-center text-[11px] leading-4 text-slate-300 sm:max-w-md">Start before your deadline. Nothing charged now.</p>

            <p className="mt-[16px] text-xs leading-5 text-slate-300">Camera notice in the mail? <Link to={PHOTO_RADAR.slug} className="font-semibold text-blue-200 underline underline-offset-4">Photo Radar · $79 + GST →</Link></p>
          </div>
          <aside className="hidden overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl lg:block" aria-label="Ticket fighting made simple">
            <div className="border-b border-slate-200 p-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">A better next move</p><h2 className="mt-[12px] text-3xl font-bold tracking-tight">You send the ticket.<br />We take it from there.</h2><ul className="mt-6 space-y-4">{["Evidence reviewed. Deadlines checked.", "Crown negotiation handled for you.", "Every offer explained. Your decision."].map(text => <li key={text} className="flex items-center gap-3 text-sm font-medium"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />{text}</li>)}</ul></div>
            {heroReview && <figure className="bg-slate-50 p-8"><span className="text-4xl leading-none text-blue-700" aria-hidden="true">“</span><blockquote className="mt-[4px] text-xl font-medium leading-8">{excerpts.Sam}</blockquote><figcaption className="mt-[16px] text-sm"><strong>{heroReview.name} · {heroReview.location}</strong><span className="mt-[4px] block text-xs text-slate-600">{heroReview.matter} · Shared with permission</span></figcaption><p className="mt-[16px] text-xs text-slate-500">Individual experience. Results vary.</p></figure>}
            <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-8 py-4 text-xs font-semibold text-slate-600"><span>Agent service, not a law firm</span><span>Secure Stripe checkout</span></div>
          </aside>
        </div>
      </section>
      <section aria-labelledby="rapid-eligibility" className="px-5 py-9 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <h2 id="rapid-eligibility" className="text-2xl font-bold sm:text-3xl">Is your ticket eligible?</h2>
          <div className="mt-5 grid gap-5 text-sm leading-6 md:grid-cols-3">
            <p><strong className="block text-base text-emerald-800">Eligible</strong>An Alberta traffic ticket issued to you as the driver that has not gone to trial. Rapid Resolution is a pre-trial service; Fabsy confirms eligibility after reading your ticket.</p>
            <p><strong className="block text-base">Different service</strong>A photo radar or red-light camera notice mailed to the registered owner. <Link to={PHOTO_RADAR.slug} className="font-semibold text-blue-800 underline">Use Photo Radar ($79 + GST).</Link></p>
            <p><strong className="block text-base">Not covered</strong>Immediate Roadside Sanctions, Notices of Administrative Penalty, appeals, reopenings, trial representation and matters outside Fabsy's permitted agent scope. Trial representation is quoted separately.</p>
          </div>
          <div className="mt-5 rounded-xl bg-slate-100 p-5 text-sm leading-6"><p>If Fabsy declines an otherwise complete paid matter before substantive work begins, your service fee is refunded.</p><p className="mt-[8px]"><strong>Your deadlines stay yours.</strong> Uploading a ticket or requesting disclosure does not extend your response date or trial date. You remain responsible for every deadline and for attending if the court requires you personally. Fabsy provides deadline instructions with file updates.</p></div>
        </div>
      </section>
      <section aria-labelledby="rapid-proof" className="bg-blue-50 px-5 py-9 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <h2 id="rapid-proof" className="text-2xl font-bold sm:text-3xl">What Fabsy clients say</h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-3">{VERIFIED_CLIENT_TESTIMONIALS.map(review => <li key={review.name} className="rounded-xl border border-blue-100 bg-white p-5"><blockquote className="text-sm leading-6">“{excerpts[review.name] && review.quote.includes(excerpts[review.name]) ? excerpts[review.name] : review.quote}”</blockquote><p className="mt-[16px] font-bold">{review.name} · {review.location}</p><p className="mt-[4px] text-xs text-slate-600">{review.matter} · Shared with permission</p></li>)}</ul>
          <p className="mt-[16px] text-xs leading-5 text-slate-600">Excerpts from individual traffic-ticket client experiences. Results vary by case; no outcome is guaranteed. Feedback is published only with confirmed permission. Fabsy does not use unsupported success percentages.</p>
        </div>
      </section>
      <section id="how-it-works" aria-labelledby="rapid-process-heading" className="scroll-mt-4 px-5 py-9 sm:py-12">
        <div className="mx-auto max-w-5xl"><h2 id="rapid-process-heading" className="text-2xl font-bold sm:text-3xl">How it works</h2><ol className="mt-6 grid gap-6 sm:grid-cols-2">{processSteps.map(([title, description], index) => <li key={title} className="flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-900">{index + 1}</span><div><h3 className="font-bold">{title}</h3><p className="mt-[8px] text-sm leading-6 text-slate-700">{description}</p></div></li>)}</ol><RapidResolutionCta className="mt-7 w-full sm:w-auto" /></div>
      </section>
      <section aria-labelledby="rapid-pricing-heading" className="bg-slate-50 px-5 py-9 sm:py-12">
        <div className="mx-auto max-w-5xl"><h2 id="rapid-pricing-heading" className="text-2xl font-bold sm:text-3xl">What you pay. What you get.</h2><p className="mt-[16px] text-xl font-bold">Rapid Resolution: {price} (${total} total)</p><p className="mt-[4px] text-sm text-slate-700">Paid once at checkout. Government fines, court charges and third-party fees are separate.</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">{RAPID_RESOLUTION.included.map(item => <li key={item} className="flex items-start gap-3 text-sm leading-6"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />{item}</li>)}</ul>
          <p className="mt-5 text-sm leading-6"><Link to="/pro-drivers" className="font-semibold text-blue-800 underline">Class 1, 2 or 4 licence? 20% off with a verified Alberta licence ($158.40 + GST).</Link> Officer-issued tickets only.</p>
          <RapidResolutionCta className="mt-6 w-full sm:w-auto" />
          <div id="fee-refund" className="mt-8"><FeeRefundNotice /><p className="mt-[12px] text-sm leading-6 text-slate-700">Any reduction counts; there is no minimum. The refund includes the GST paid. Payment does not start the 30-calendar-day clock; an opening or unchanged offer before Fabsy’s efforts are rejected does not start it either.</p></div>
          <RapidResolutionCta className="mt-6 w-full sm:w-auto" />
        </div>
      </section>
      <section aria-labelledby="rapid-faq-heading" className="px-5 py-9 sm:py-12"><div className="mx-auto max-w-3xl"><h2 id="rapid-faq-heading" className="text-2xl font-bold sm:text-3xl">Common questions</h2><Accordion type="single" collapsible className="mt-5">{faqs.map(([question, answer], index) => <AccordionItem key={question} value={`faq-${index}`}><AccordionTrigger className="text-left">{question}</AccordionTrigger><AccordionContent className="leading-6 text-slate-700">{answer}</AccordionContent></AccordionItem>)}</Accordion><div className="mt-6 text-sm leading-7"><h3 className="font-bold">Can I talk to someone first?</h3><p>Call <a href="tel:+18257932279" data-funnel-action="phone" data-funnel-position="section" className="font-semibold text-blue-800 underline">(825) 793-2279</a>{WHATSAPP_ENABLED && <>, message on <a href={FABSY_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" data-funnel-action="whatsapp" data-funnel-position="section" className="font-semibold text-blue-800 underline">WhatsApp</a></>}, or email <a href="mailto:hello@fabsy.ca" className="font-semibold text-blue-800 underline">hello@fabsy.ca</a>.</p></div></div></section>
      <section aria-labelledby="rapid-final-heading" className="bg-slate-950 px-5 py-10 text-center text-white"><h2 id="rapid-final-heading" className="text-2xl font-bold text-white sm:text-3xl">Put your ticket into motion today.</h2><p className="mt-[12px] text-slate-200">{price} (${total} total), paid at checkout.</p><p className="mx-auto mt-[12px] max-w-xl text-sm text-slate-200">{HOMEPAGE_REFUND_COPY.headline} {HOMEPAGE_REFUND_COPY.headlineAccent}<Link to={FEE_REFUND.termsPath} className="text-white underline" aria-label="Fee-refund conditions">*</Link></p><RapidResolutionCta position="footer" className="mt-5 w-full sm:w-auto" /></section>
    </main>
    <footer className="px-5 pb-28 pt-8 text-sm text-slate-700 md:pb-8"><div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-6"><div><p className="font-bold">Fabsy Traffic Ticket Services · Alberta</p><p className="mt-[8px]">Agent service, not a law firm. No legal advice.</p><p className="mt-[8px]"><a href="tel:+18257932279" data-funnel-action="phone" data-funnel-position="footer" className="underline">(825) 793-2279</a> · <a href="mailto:hello@fabsy.ca" className="underline">hello@fabsy.ca</a></p></div><nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">{[["/privacy-policy", "Privacy Policy"], ["/terms-of-service", "Terms of Service"], ["/terms-of-purchase", "Terms of Purchase"], [FEE_REFUND.termsPath, "Fee-refund guarantee"]].map(([to, label]) => <Link key={label} to={to} className="inline-flex min-h-11 items-center underline">{label}</Link>)}</nav></div></footer>
  </div>;
}
