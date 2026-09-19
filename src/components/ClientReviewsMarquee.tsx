import { useId, useState } from "react";
import { Pause, Play, Quote } from "lucide-react";
import { Link } from "react-router-dom";
import { VERIFIED_CLIENT_TESTIMONIALS } from "@/content/clientTestimonials";
import "./ClientReviewsMarquee.css";

const excerpts: Record<string, string> = {
  Sam: "Excellent communication and responsiveness the whole time.",
  Paula: "thanks to Fabsy I ended up with a lesser amount at the end of the day",
  James: "answered all my questions clearly, didn't try to push any services on me, and made it easy to choose which option to start with.",
};

const reviews = VERIFIED_CLIENT_TESTIMONIALS.map((review) => {
  const excerpt = excerpts[review.name];
  return { ...review, excerpt: excerpt && review.quote.includes(excerpt) ? excerpt : review.quote };
});

export default function ClientReviewsMarquee() {
  const headingId = useId();
  const trackId = useId();
  const [paused, setPaused] = useState(false);
  if (!reviews.length) return null;

  return (
    <section className="client-reviews border-y border-blue-100 bg-blue-50 py-8 sm:py-10" aria-labelledby={headingId} data-paused={paused}>
      <div className="container mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-dark">Shared with permission</p>
            <h2 id={headingId} className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">What Fabsy clients say</h2>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/testimonials" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-dark underline underline-offset-4">Read full stories</Link>
            <button type="button" className="client-reviews-pause inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-controls={trackId} aria-pressed={paused} onClick={() => setPaused(!paused)}>
              {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
              {paused ? "Play reviews" : "Pause reviews"}
            </button>
          </div>
        </div>
        <div className="client-reviews-window" id={trackId}>
          <div className="client-reviews-track">
            {[false, true].map((duplicate) => (
              <ul key={String(duplicate)} className="client-reviews-group" aria-hidden={duplicate || undefined}>
                {reviews.map((review) => (
                  <li key={review.name} className="client-review rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
                    <Quote className="mb-3 h-5 w-5 text-primary-dark" aria-hidden="true" />
                    <blockquote className="text-sm leading-relaxed text-slate-800">“{review.excerpt}”</blockquote>
                    <p className="mt-4 text-sm font-bold text-slate-950">{review.name} · {review.location}</p>
                    <p className="mt-1 text-xs text-slate-600">{review.matter}</p>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-600">Excerpts from individual traffic-ticket client experiences. Results vary by case; no outcome is guaranteed.</p>
      </div>
    </section>
  );
}
