/** A direct profile link keeps reviews available without a third-party widget. */
export default function TrustpilotReviewLink() {
  return (
    <a
      href="https://www.trustpilot.com/review/fabsy.ca"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-emerald-800 hover:decoration-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:text-sm"
    >
      Read our reviews on Trustpilot
    </a>
  );
}
