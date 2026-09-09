import { useId } from "react";
import { Camera, ChevronDown } from "lucide-react";

export function TicketPhotoGuide() {
  const headingId = useId();

  return (
    <aside aria-labelledby={headingId} lang="en" dir="ltr" className="rounded-xl border border-sky-200 bg-sky-50/70 p-[16px] text-left text-slate-800">
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
        <Camera className="h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
        How to photograph your ticket
      </h3>
      <ul className="mt-[12px] grid list-disc grid-cols-2 gap-x-4 gap-y-1 pl-4 text-sm leading-snug marker:text-sky-700">
        <li>Flat ticket</li>
        <li>Even light</li>
        <li>All four edges</li>
        <li>Sharp text</li>
      </ul>
      <p className="mt-[12px] text-sm leading-relaxed">
        Keep the <strong>ticket number, offence/section, dates, fine and court details</strong> readable.
      </p>
      <details className="group mt-[12px] border-t border-sky-200 pt-3">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded text-sm font-semibold text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700 [&::-webkit-details-marker]:hidden">
          See the steps and example
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <ol className="mt-[12px] list-decimal space-y-2 pl-5 text-sm leading-relaxed marker:font-semibold marker:text-sky-800">
          <li><strong>Flatten it.</strong> Unfold the ticket on a flat, plain surface. Keep fingers and objects off the text.</li>
          <li><strong>Light it evenly.</strong> Use bright light and move away from glare or shadows.</li>
          <li><strong>Show the whole ticket.</strong> Hold your phone directly above it with all four edges inside the photo.</li>
          <li><strong>Make the writing sharp.</strong> Tap the text to focus, hold still, then check the small print.</li>
        </ol>
        <div className="mt-[12px] grid items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div role="img" aria-label="Illustration of a flat ticket photographed directly from above. All four edges and the ticket number, offence, dates, fine and court details are visible." className="relative mx-auto w-[180px] max-w-full rounded-xl bg-slate-700 p-5">
            <div className="absolute inset-2 rounded border-2 border-dashed border-emerald-300" aria-hidden="true" />
            <div className="relative space-y-3 rounded-sm border border-slate-300 bg-white p-[12px] text-[10px] leading-snug text-slate-900 shadow-sm" aria-hidden="true">
              <p className="border-b border-slate-200 pb-2 text-center font-bold tracking-wider">EXAMPLE ONLY</p>
              <p><span className="block text-slate-500">Ticket number</span><strong>ABC 123456</strong></p>
              <p><span className="block text-slate-500">Offence / section</span><span className="mt-[4px] block h-1.5 w-full rounded bg-slate-600" /></p>
              <p><span className="block text-slate-500">Dates / court details</span><span className="mt-[4px] block h-1.5 w-4/5 rounded bg-slate-600" /></p>
              <p><span className="block text-slate-500">Fine amount</span><span className="mt-[4px] block h-1.5 w-1/2 rounded bg-slate-600" /></p>
            </div>
          </div>
          <p className="text-sm leading-relaxed">Leave a little space around every edge. Check both the top ticket number and the bottom section before using the photo.</p>
        </div>
        <p className="mt-[12px] text-xs leading-relaxed text-slate-600">If the original printing is faint or damaged, send the clearest photo you can and tell us in your notes.</p>
      </details>
    </aside>
  );
}

export function TicketPhotoCheck() {
  return (
    <p lang="en" dir="ltr" className="text-left text-sm leading-relaxed text-slate-700">
      <strong>Before continuing:</strong> check that the whole ticket and its small print are readable. Retake the photo if anything is blurry, shadowed or cut off.
    </p>
  );
}
