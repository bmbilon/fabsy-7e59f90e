import { createContext, useContext } from 'react';
import type { FormData } from '@/components/TicketForm';
import type { LocaleCode } from './locale-policy.mjs';

export type IntakeHandoff = { prefillTicketData: Partial<FormData>; startAtStep: number; ticketImage: File | null };
type LocaleInfo = { code: string; languageTag: string; nativeName: string; englishName: string; dir: string; wave: number };
export type LocaleContextValue = {
  locale: LocaleCode; basePath: string; isReleased: boolean; direction: 'ltr' | 'rtl';
  href: (path: string) => string; availableLocales: LocaleInfo[];
  intakeHandoff: IntakeHandoff | null; setIntakeHandoff: (value: IntakeHandoff | null) => void;
};

// Keep context identity outside the provider's Fast Refresh boundary.
export const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en', basePath: '/', isReleased: true, direction: 'ltr', href: path => path,
  availableLocales: [{ code: 'en', languageTag: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', wave: 0 }],
  intakeHandoff: null, setIntakeHandoff: () => undefined,
});
export const useLocale = () => useContext(LocaleContext);
