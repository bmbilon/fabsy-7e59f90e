import { useState, type Ref } from 'react';
import { Field } from '../components/ui';
import { MAX_LENGTH, emailSuggestion, type FieldErrors, type FieldName, type IntakeFields } from './intake';
import StepHeading from './StepHeading';

interface ContactStepProps {
  fields: IntakeFields;
  errors: FieldErrors;
  setField: (name: FieldName, value: string) => void;
  company: string;
  setCompany: (value: string) => void;
  headingRef: Ref<HTMLHeadingElement>;
}

export default function ContactStep({ fields, errors, setField, company, setCompany, headingRef }: ContactStepProps) {
  const [emailChecked, setEmailChecked] = useState(false);
  const suggestion = emailChecked && !errors.email ? emailSuggestion(fields.email) : null;

  return (
    <section aria-labelledby="step-title">
      <StepHeading ref={headingRef} title="How can we reach you?" intro="We email your secure file link and our reply to this address." />
      <div className="mt-6 grid gap-6">
        <Field id="f-name" label="Full name" error={errors.name}>
          {control => (
            <input
              {...control}
              className="ahc-input"
              value={fields.name}
              maxLength={MAX_LENGTH.name}
              onChange={event => setField('name', event.target.value)}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
            />
          )}
        </Field>
        <Field id="f-email" label="Email" error={errors.email} hint={suggestion ? undefined : 'We send your secure file link here.'}>
          {control => (
            <>
              <input
                {...control}
                className="ahc-input"
                type="email"
                inputMode="email"
                value={fields.email}
                maxLength={MAX_LENGTH.email}
                onChange={event => {
                  setEmailChecked(false);
                  setField('email', event.target.value);
                }}
                onBlur={() => setEmailChecked(true)}
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
              />
              {suggestion ? (
                <p className="ahc-hint mt-1.5" aria-live="polite">
                  Did you mean{' '}
                  <button type="button" className="ahc-link" onClick={() => { setField('email', suggestion); setEmailChecked(false); }}>
                    {suggestion}
                  </button>
                  ?
                </p>
              ) : null}
            </>
          )}
        </Field>
        <Field id="f-phone" label="Phone" optional hint="So we can call if something is urgent." error={errors.phone}>
          {control => (
            <input
              {...control}
              className="ahc-input sm:max-w-[320px]"
              type="tel"
              inputMode="tel"
              value={fields.phone}
              maxLength={MAX_LENGTH.phone}
              onChange={event => setField('phone', event.target.value)}
              autoComplete="tel"
              enterKeyHint="done"
            />
          )}
        </Field>
        <div className="ahc-hp" aria-hidden="true">
          <label htmlFor="f-hp-field">Leave this field empty</label>
          <input id="f-hp-field" name="hp_field" tabIndex={-1} autoComplete="off" value={company} onChange={event => setCompany(event.target.value)} />
        </div>
      </div>
    </section>
  );
}
