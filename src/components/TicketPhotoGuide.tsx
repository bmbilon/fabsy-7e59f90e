import { Camera, ChevronDown, ZoomIn } from "lucide-react";

const ticketExamples = [
  {
    label: "Yellow paper ticket",
    image: "/images/ticket-photo-examples/alberta-yellow-sample.png",
    preview: "/images/ticket-photo-examples/alberta-yellow-sample-preview.webp",
    width: 887,
    height: 1774,
    details: "The ticket number is near the top right. Include the offence, date and court box, and the fine near the bottom.",
  },
  {
    label: "White printed ticket",
    image: "/images/ticket-photo-examples/alberta-white-sample.png",
    preview: "/images/ticket-photo-examples/alberta-white-sample-preview.webp",
    width: 1086,
    height: 1448,
    details: "The ticket number is near the top left. Include the charge, speed details, response date and fine under Your options.",
  },
];

export function TicketPhotoGuide() {

  return (
    <details lang="en" dir="ltr" className="group rounded-xl border border-sky-200 bg-sky-50/70 text-left text-slate-800">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl p-[12px] text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 [&::-webkit-details-marker]:hidden">
        <Camera className="h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
        <span className="flex-1">How to properly capture an image of your ticket</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-sky-700 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="border-t border-sky-200 p-[16px]">
      <ul className="mt-[12px] grid list-disc grid-cols-2 gap-x-4 gap-y-1 pl-4 text-sm leading-snug marker:text-sky-700">
        <li>Flat ticket</li>
        <li>Even light</li>
        <li>All four edges</li>
        <li>Sharp text</li>
      </ul>
      <p className="mt-[12px] text-sm leading-relaxed">
        Keep the <strong>ticket number, offence/section, dates, fine and court details</strong> readable.
      </p>
        <ol className="mt-[12px] list-decimal space-y-2 pl-5 text-sm leading-relaxed marker:font-semibold marker:text-sky-800">
          <li><strong>Flatten it.</strong> Unfold the ticket on a flat, plain surface. Keep fingers and objects off the text.</li>
          <li><strong>Light it evenly.</strong> Use bright light and move away from glare or shadows.</li>
          <li><strong>Show the whole ticket.</strong> Hold your phone directly above it with all four edges inside the photo.</li>
          <li><strong>Make the writing sharp.</strong> Tap the text to focus, hold still, then check the small print.</li>
        </ol>
        <p className="mt-[12px] text-sm leading-relaxed">Leave a little space around every edge, as shown below. Open either example to see the details at full size.</p>
        <div className="mt-[12px] grid gap-5 sm:grid-cols-2">
          {ticketExamples.map((example) => (
            <figure key={example.image} className="min-w-0 space-y-3">
              <figcaption className="text-sm font-semibold">{example.label}</figcaption>
              <a href={example.image} target="_blank" rel="noopener noreferrer" aria-label={`Enlarge ${example.label.toLowerCase()} example (opens in a new tab)`} className="block overflow-hidden rounded-lg border border-slate-300 bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700">
                <img src={example.preview} alt={`${example.label} from Alberta, with fictional John Doe details, photographed flat with all four edges visible.`} width={example.width} height={example.height} loading="lazy" decoding="async" className="h-[360px] w-full object-contain" />
                <span className="flex min-h-11 items-center justify-center gap-2 bg-white px-3 py-2 text-sm font-semibold text-sky-800">
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                  View larger <span className="sr-only">(opens in a new tab)</span>
                </span>
              </a>
              <p className="text-sm leading-relaxed">{example.details}</p>
            </figure>
          ))}
        </div>
        <p className="mt-[12px] text-xs leading-relaxed text-slate-600">Fictional examples for photo guidance. Your ticket may look different; follow the instructions and dates on your own ticket.</p>
        <p className="mt-[12px] text-xs leading-relaxed text-slate-600">If the original printing is faint or damaged, send the clearest photo you can.</p>
      </div>
    </details>
  );
}

export function TicketPhotoCheck() {
  return (
    <p lang="en" dir="ltr" className="text-left text-sm leading-relaxed text-slate-700">
      <strong>Before continuing:</strong> check that the whole ticket and its small print are readable. Retake the photo if anything is blurry, shadowed or cut off.
    </p>
  );
}
