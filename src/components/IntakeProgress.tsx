export default function IntakeProgress({ current }: { current: 1 | 2 | 3 }) {
  return <ol aria-label="Your progress" className="flex justify-center gap-5 text-xs sm:text-sm">
    {["Ticket", "Contact", "Payment"].map((label, index) => <li key={label} aria-current={current === index + 1 ? "step" : undefined} className={current === index + 1 ? "font-bold text-blue-800" : "text-slate-500"}>{index + 1} {label}</li>)}
  </ol>;
}
