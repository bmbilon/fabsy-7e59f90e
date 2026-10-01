import { Building2, CarFront, Scale, type LucideIcon } from 'lucide-react';
import { ANDERHUE_PRACTICE } from '../../config';
import type { PracticeArea } from '../catalog';

/** Client-facing copy for each practice area in the uploader. */
export interface AreaCopy {
  icon: LucideIcon;
  /** Area chooser card. */
  title: string;
  summary: string;
  /** Eyebrow above the wizard heading. */
  eyebrow: string;
  uploadIntro: string;
  uploadItems: string[];
  detailsTitle: string;
  detailsIntro: string;
  nextSteps: string[];
}

export const AREA_ORDER: PracticeArea[] = ['ltb', 'traffic', 'general'];

export const AREA_COPY: Record<PracticeArea, AreaCopy> = {
  ltb: {
    icon: Building2,
    title: 'Landlord',
    summary: 'A tenant owes rent or must leave',
    eyebrow: 'Landlord and Tenant Board',
    uploadIntro: 'Photos or PDFs of these help us see where things stand:',
    uploadItems: ['Your lease', 'The rent ledger', 'Any notice already served, such as an N4', 'Photo ID'],
    detailsTitle: 'About the tenancy',
    detailsIntro: 'A few quick questions. Answer what you can.',
    nextSteps: [
      'Don reviews your documents and the dates on any notice.',
      'We reply by email with your next deadline and the fee that applies.',
      'Nothing is filed for you until you sign a written retainer.',
    ],
  },
  traffic: {
    icon: CarFront,
    title: 'Traffic ticket',
    summary: 'Ontario ticket or offence notice',
    eyebrow: 'Traffic ticket',
    uploadIntro: 'Clear photos work well. Keep all four corners in the frame:',
    uploadItems: ['The front of the ticket', 'The back of the ticket', 'Any court notice you have received since'],
    detailsTitle: 'About your ticket',
    detailsIntro: 'A few quick questions. Answer what you can.',
    nextSteps: [
      'We read your ticket and check the deadline printed on it.',
      'We reply by email with your options and the fee.',
      'Keep the original ticket somewhere safe. Its deadline still applies while we review it.',
    ],
  },
  general: {
    icon: Scale,
    title: 'Something else',
    summary: 'Small claims, a tribunal, another offence or commissioning documents',
    eyebrow: 'Other matters',
    uploadIntro: 'Add anything that explains the matter:',
    uploadItems: ['Any notice, claim or letter you received', 'Anything with a deadline on it'],
    detailsTitle: 'About your matter',
    detailsIntro: 'Tell us what is going on. A few sentences is plenty.',
    nextSteps: [
      'We review what you sent and confirm whether we can help.',
      'If we can, we reply with the next step and the fee in writing.',
      `If a deadline is close, call us at ${ANDERHUE_PRACTICE.phoneDisplay}.`,
    ],
  },
};

export const RETAINER_STATEMENT = 'Sending this does not create a retainer. We reply with your next step and the fee in writing.';
export const PRIVACY_STATEMENT = 'We use this only to reply about your file. It is stored with our service providers, which may process it outside Canada.';
