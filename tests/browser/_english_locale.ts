import { afterEach, beforeEach } from 'vitest';
import { getLanguage, setLanguage } from '../../src/ui/i18n';

/** Opt in only for browser fixtures whose text and accessible-name pins are English. */
export function useEnglishLocale(): void {
  let previous = getLanguage();
  beforeEach(() => {
    previous = getLanguage();
    setLanguage('en');
  });
  afterEach(() => setLanguage(previous));
}
