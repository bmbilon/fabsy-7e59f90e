import { ArrowRight, Check, Clock3, FileSearch, Landmark, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { RAPID_RESOLUTION } from "@/config/offers";
import { VERIFIED_CLIENT_TESTIMONIALS } from "@/content/clientTestimonials";

const differences = [
  { icon: FileSearch, challenge: "Research, paperwork and follow-ups", answer: "Your ticket reviewed. A clear next step.", detail: "Start online. We request the evidence, review your ticket, and keep you updated." },
  { icon: Landmark, challenge: "Navigating complex and confusing legal procedures", answer: "Court proceedings handled.", detail: "We handle the authorized court and prosecutor steps for your eligible pre-trial matter. Trial representation is separate." },
  { icon: Clock3, challenge: "Inconvenient deadlines", answer: "Know what needs your attention.", detail: "We track your file and explain the deadlines and actions you still need to follow." },
  { icon: MessageCircle, challenge: "Unpredictable outcomes", answer: "You see the options. You make the call.", detail: "We explain the prosecutor’s response in plain language. You choose whether to accept an available resolution." },
] as const;

const featuredClient = VERIFIED_CLIENT_TESTIMONIALS.find((testimonial) => testimonial.name === "Sam");
const featuredExcerpt = "Excellent communication and responsiveness the whole time.";

export default function HomepageComparison() {
  return (
    <>
      <section id="fabsy-difference" className="scroll-mt-20 bg-slate-50 px-5 py-14 sm:px-8 sm:py-20" aria-labelledby="homepage-difference-heading">
        <div className="container mx-auto max-w-7xl px-0">
          <div className="mb-9 flex flex-col justify-between gap-4 lg:mb-12 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-primary-dark">The Fabsy difference</p>
              <h2 id="homepage-difference-heading" className="mt-3 text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl lg:text-[2.75rem]">
                Less on your plate.<br />More support on your side.
              </h2>
            </div>
            <p className="max-w-sm text-base leading-relaxed text-slate-600">
              The ticket is stressful enough. Understanding your next step shouldn’t be.
            </p>
          </div>

          <div className="grid items-center gap-8 lg:grid-cols-[1.08fr_1fr] lg:gap-12">
            <figure className="overflow-hidden rounded-2xl bg-slate-950 sm:rounded-3xl">
              <img
                src="/fabsy-way-comparison-2026.webp"
                alt="On your own: research, paperwork, navigating complex and confusing legal procedures, inconvenient deadlines, follow-ups and unpredictable outcomes. The Fabsy way: ticket reviewed, court proceedings handled, options explained, and you in control. Eligible pre-trial matters; trial representation separate."
                width={1305}
                height={1206}
                loading="lazy"
                decoding="async"
                className="h-auto w-full"
              />
            </figure>

            <div>
              <ul className="divide-y divide-slate-200">
                {differences.map(({ icon: Icon, challenge, answer, detail }) => (
                  <li key={challenge} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-primary-dark">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">{challenge}</p>
                      <div>
                        <h3 className="mt-1 text-lg font-bold leading-snug text-slate-950">{answer}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <Link to={RAPID_RESOLUTION.slug} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-bold text-primary-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                See everything included for ${RAPID_RESOLUTION.priceCad}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="mt-1 text-xs text-slate-500">CAD plus GST. Eligible pre-trial matters; trial separate.</p>
            </div>
          </div>
        </div>
      </section>

      {featuredClient?.quote.includes(featuredExcerpt) && (
        <aside className="border-y border-blue-100 bg-blue-50 px-5 py-8 sm:px-8 sm:py-10" aria-label="Client feedback">
          <div className="container mx-auto flex max-w-6xl flex-col gap-5 px-0 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
            <div className="max-w-3xl">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-primary-dark">
                <Check className="h-4 w-4" aria-hidden="true" />
                A real client experience · Shared with permission
              </p>
              <blockquote className="text-xl font-semibold leading-relaxed tracking-tight text-slate-950 sm:text-2xl">
                “{featuredExcerpt}”
              </blockquote>
              <p className="mt-3 text-sm text-slate-600">{featuredClient.name}, {featuredClient.location} · {featuredClient.matter}</p>
              <p className="mt-1 text-xs text-slate-500">An excerpt from one client’s experience, not a promised result.</p>
            </div>
            <Link to="/testimonials" className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-sm text-sm font-bold text-primary-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:self-center">
              Read client stories
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </aside>
      )}
    </>
  );
}
