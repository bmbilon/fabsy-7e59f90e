import type { FormData } from "@/components/TicketForm";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LeadCaptureFields({ formData, updateFormData, error }: {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  error?: string;
}) {
  const email = formData.email.trim();
  const phone = formData.phone.trim();
  const emailInvalid = Boolean(email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneInvalid = Boolean(phone) && phone.replace(/\D/g, "").length < 7;

  return <div className="mt-6 space-y-5 rounded-xl border border-primary/15 bg-primary/5 p-5 sm:p-6">
    <div>
      <h3 className="text-lg font-semibold">Where can we follow up?</h3>
      <p className="mt-1 text-sm text-muted-foreground">Provide an email address, a phone number, or both. We use this information to save and follow up on this ticket intake.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="lead-email">Email</Label>
        <Input id="lead-email" type="email" inputMode="email" autoComplete="email" maxLength={254}
          value={formData.email} onChange={event => updateFormData({ email: event.target.value })}
          placeholder="you@example.com" aria-invalid={emailInvalid}
          aria-describedby={`lead-email-help${emailInvalid ? " lead-email-error" : ""}`} />
        <p id="lead-email-help" className="text-xs text-muted-foreground">Use an address you can access for the secure return link.</p>
        {emailInvalid ? <p id="lead-email-error" className="text-sm text-destructive" role="alert">Enter a complete email address, such as you@example.com.</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-phone">Phone</Label>
        <Input id="lead-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={32}
          value={formData.phone} onChange={event => updateFormData({ phone: event.target.value })}
          placeholder="403-555-0123" aria-invalid={phoneInvalid}
          aria-describedby={`lead-phone-help${phoneInvalid ? " lead-phone-error" : ""}`} />
        <p id="lead-phone-help" className="text-xs text-muted-foreground">Include an area code when possible.</p>
        {phoneInvalid ? <p id="lead-phone-error" className="text-sm text-destructive" role="alert">Enter a phone number with at least seven digits.</p> : null}
      </div>
    </div>
    <label htmlFor="alberta-confirmed" className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-4 text-sm leading-relaxed">
      <Checkbox id="alberta-confirmed" className="mt-0.5" checked={formData.albertaConfirmed}
        onCheckedChange={checked => updateFormData({ albertaConfirmed: checked === true })} />
      <span>This is an Alberta traffic ticket or registered-owner notice.</span>
    </label>
    <label htmlFor="contact-permission" className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-4 text-sm leading-relaxed">
      <Checkbox id="contact-permission" className="mt-0.5" checked={formData.contactPermission}
        onCheckedChange={checked => updateFormData({ contactPermission: checked === true })} />
      <span>I give Fabsy permission to send me a secure resume link and contact me about this ticket intake using the email address or phone number I provided. Anyone with the link can open my saved intake, so I will not forward it. This is not marketing consent or authorization to act on the ticket.</span>
    </label>
    <p className="text-xs leading-relaxed text-muted-foreground">Saving this intake does not extend the response date on your ticket and does not create a representation agreement.</p>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
  </div>;
}
