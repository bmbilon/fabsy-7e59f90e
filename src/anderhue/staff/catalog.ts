// Single bridge to the shared practice catalog (stages, outcomes, labels,
// client copy, vocabularies, limits). Everything in the staff app imports the
// catalog from here so the relative path lives in one place.
export * from '../../../supabase/functions/_shared/practice-catalog';
