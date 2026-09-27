import type { CoachLanguage } from '@/lib/contracts';

/** Languages the coach writes in (plan §6.4); the UI copy stays English. */
export const COACH_LANGUAGES: { id: CoachLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'nl', label: 'Nederlands' },
  { id: 'pl', label: 'Polski' },
];
