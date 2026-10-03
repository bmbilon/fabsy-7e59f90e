import { Fragment, type Ref } from 'react';
import { CalendarDays } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '../../config';
import { Field } from '../components/ui';
import {
  GENERAL_CATEGORIES, LTB_ISSUES, TICKET_OPTION_CHOSEN, TICKET_RESPONSE_DAYS, TICKET_TYPES,
  daysUntil, formatLongDate, type PracticeArea,
} from '../catalog';
import { cx } from '../lib/cx';
import { AREA_COPY } from './content';
import { MAX_LENGTH, estimatedResponseDate, ticketDateRange, type FieldErrors, type FieldName, type IntakeFields } from './intake';
import StepHeading from './StepHeading';

interface DetailsStepProps {
  area: PracticeArea;
  fields: IntakeFields;
  errors: FieldErrors;
  setField: (name: FieldName, value: string) => void;
  headingRef: Ref<HTMLHeadingElement>;
}

const SERVED_OPTIONS = [
  { value: 'no', label: 'Not yet' },
  { value: 'yes', label: 'Yes' },
  { value: 'unsure', label: 'Not sure' },
];

function Select({ name, value, options, setField, placeholder = 'Choose one', ...control }: {
  name: FieldName;
  value: string;
  options: readonly { value: string; label: string }[];
  setField: (name: FieldName, value: string) => void;
  placeholder?: string;
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}) {
  return (
    <select {...control} className="ahc-input" value={value} data-empty={value ? undefined : 'true'} onChange={event => setField(name, event.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function ResponseEstimate({ receivedOn }: { receivedOn: string }) {
  const estimate = estimatedResponseDate(receivedOn);
  if (!estimate) return null;
  const days = daysUntil(estimate);
  const urgent = days !== null && days <= 3;
  let when = '';
  if (days === null) when = '';
  else if (days > 1) when = `That is ${days} days from today.`;
  else if (days === 1) when = 'That is tomorrow.';
  else if (days === 0) when = 'That is today.';
  else when = `That date may have passed. Call us today at ${ANDERHUE_PRACTICE.phoneDisplay}.`;
  return (
    <div className={cx('ahc-alert mt-3', urgent ? 'ahc-alert--warn' : 'ahc-alert--info')} aria-live="polite">
      <CalendarDays size={20} aria-hidden="true" />
      <div>
        <p><span className="font-semibold">Estimated response date: {formatLongDate(estimate)}</span></p>
        <p className="mt-1 text-[14px]">
          {when} This is an estimate, {TICKET_RESPONSE_DAYS} days after the date you got the ticket. The date printed on your ticket is the one that counts.
        </p>
      </div>
    </div>
  );
}

function DeadlineNote({ deadline }: { deadline: string }) {
  const days = daysUntil(deadline);
  if (days === null || days > 7) return null;
  return (
    <p className="ahc-alert ahc-alert--warn mt-3" aria-live="polite">
      <CalendarDays size={18} aria-hidden="true" />
      <span>
        {days < 0 ? 'This date has passed.' : days === 0 ? 'This deadline is today.' : `This deadline is ${days === 1 ? 'tomorrow' : `in ${days} days`}.`}
        {' '}After you send this, call us at {ANDERHUE_PRACTICE.phoneDisplay} so we know it is urgent.
      </span>
    </p>
  );
}

export default function DetailsStep({ area, fields, errors, setField, headingRef }: DetailsStepProps) {
  const copy = AREA_COPY[area];
  const input = (name: FieldName) => ({
    value: fields[name],
    maxLength: MAX_LENGTH[name],
    onChange: (event: { target: { value: string } }) => setField(name, event.target.value),
    className: 'ahc-input',
  });

  return (
    <section aria-labelledby="step-title">
      <StepHeading ref={headingRef} title={copy.detailsTitle} intro={copy.detailsIntro} />
      <div className="mt-6 grid gap-6">
        {area === 'ltb' ? (
          <>
            <Field id="f-issue" label="What is the issue?" error={errors.issue}>
              {control => <Select {...control} name="issue" value={fields.issue} options={LTB_ISSUES} setField={setField} />}
            </Field>
            <fieldset>
              <legend className="ahc-label">Has a notice been served?<span className="ahc-optional">(optional)</span></legend>
              <div className="ahc-seg">
                {SERVED_OPTIONS.map(option => (
                  <Fragment key={option.value}>
                    <input
                      type="radio"
                      id={`f-served-${option.value}`}
                      name="served"
                      value={option.value}
                      checked={fields.served === option.value}
                      onChange={() => setField('served', option.value)}
                    />
                    <label htmlFor={`f-served-${option.value}`}>{option.label}</label>
                  </Fragment>
                ))}
              </div>
              <p className="ahc-hint mt-1.5">For example an N4 for unpaid rent, or an N12.</p>
            </fieldset>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="f-owed" label="Approximate rent owed" optional>
                {control => (
                  <div className="ahc-affix">
                    <span aria-hidden="true">$</span>
                    <input
                      {...control}
                      {...input('owed')}
                      onChange={event => setField('owed', event.target.value.replace(/^\s*\$\s*/, ''))}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="2,400"
                    />
                  </div>
                )}
              </Field>
              <Field id="f-city" label="Rental unit city" optional>
                {control => <input {...control} {...input('city')} autoComplete="off" placeholder="For example, Hamilton" />}
              </Field>
            </div>
            <Field id="f-notes" label="Anything we should know?" optional hint="Dates, amounts, what the tenant has said.">
              {control => <textarea {...control} {...input('notes')} rows={4} />}
            </Field>
          </>
        ) : null}

        {area === 'traffic' ? (
          <>
            <Field id="f-ticketType" label="What is the ticket for?" error={errors.ticketType}>
              {control => <Select {...control} name="ticketType" value={fields.ticketType} options={TICKET_TYPES} setField={setField} />}
            </Field>
            <Field
              id="f-ticketReceivedOn"
              label="Date you got it"
              optional
              hintFirst
              hint="Most offence notices give 15 days to choose an option. Check the date printed on yours."
              error={errors.ticketReceivedOn}
            >
              {control => {
                const range = ticketDateRange();
                return (
                  <>
                    <input {...control} {...input('ticketReceivedOn')} type="date" min={range.min} max={range.max} className="ahc-input sm:max-w-[280px]" />
                    {!errors.ticketReceivedOn && fields.ticketReceivedOn ? <ResponseEstimate receivedOn={fields.ticketReceivedOn} /> : null}
                  </>
                );
              }}
            </Field>
            <Field id="f-ticketCity" label="City where it was issued" optional>
              {control => <input {...control} {...input('ticketCity')} autoComplete="off" placeholder="For example, Mississauga" />}
            </Field>
            <fieldset>
              <legend className="ahc-label">What have you done so far?<span className="ahc-optional">(optional)</span></legend>
              <div className="ahc-choices ahc-choices--two mt-1">
                {TICKET_OPTION_CHOSEN.map(option => (
                  <label key={option.value} className="ahc-choice" htmlFor={`f-optionChosen-${option.value}`}>
                    <input
                      type="radio"
                      id={`f-optionChosen-${option.value}`}
                      name="optionChosen"
                      value={option.value}
                      checked={fields.optionChosen === option.value}
                      onChange={() => setField('optionChosen', option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id="f-notes" label="Anything we should know?" optional hint="For example, where it happened or why you think the ticket is wrong.">
              {control => <textarea {...control} {...input('notes')} rows={4} />}
            </Field>
          </>
        ) : null}

        {area === 'general' ? (
          <>
            <Field id="f-category" label="What kind of matter is it?" error={errors.category}>
              {control => <Select {...control} name="category" value={fields.category} options={GENERAL_CATEGORIES} setField={setField} />}
            </Field>
            <Field
              id="f-notes"
              label="What do you need help with?"
              hintFirst
              hint="What happened, who is involved and what you would like to happen."
              error={errors.notes}
            >
              {control => (
                <>
                  <textarea {...control} {...input('notes')} rows={5} />
                  {fields.notes.length > MAX_LENGTH.notes - 400 ? (
                    <p className="ahc-hint mt-1.5 text-right ah-mono">{MAX_LENGTH.notes - fields.notes.length} characters left</p>
                  ) : null}
                </>
              )}
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="f-deadline" label="Any deadline?" optional hint="A hearing, filing or response date." error={errors.deadline}>
                {control => <input {...control} {...input('deadline')} type="date" />}
              </Field>
              <Field id="f-clientCity" label="Your city" optional>
                {control => <input {...control} {...input('clientCity')} autoComplete="address-level2" placeholder="For example, Oshawa" />}
              </Field>
            </div>
            {fields.deadline && !errors.deadline ? <DeadlineNote deadline={fields.deadline} /> : null}
            <Field id="f-otherParty" label="The other party, if any" optional>
              {control => <input {...control} {...input('otherParty')} autoComplete="off" placeholder="A person, business or agency" />}
            </Field>
          </>
        ) : null}
      </div>
    </section>
  );
}
