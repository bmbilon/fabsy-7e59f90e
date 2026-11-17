// Shared workflow catalog with AnderHue-specific public service labels.
export * from '../../../supabase/functions/_shared/practice-catalog';
import { AREAS as SHARED_AREAS } from '../../../supabase/functions/_shared/practice-catalog';
export const AREAS = {
  ...SHARED_AREAS,
  general: { ...SHARED_AREAS.general, staffLabel: 'Notary', clientLabel: 'Notary & Commissioner of Oaths', publicPath: '/notary', startParam: 'notary' },
};
