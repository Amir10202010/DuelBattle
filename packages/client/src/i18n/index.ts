import { getPreferences } from './preferences.js';
import { ru, en } from './messages.js';
import { gameEn, gameRu } from './gameCopy.js';
import { characterRu } from './characterCopy.js';
import { landingRu } from './landingCopy.js';
import { telegramRu } from './telegramCopy.js';
import { RUSSIAN_PROMPTS } from '@battle/shared';
export { useUiPreferences } from './preferences.js';

const dictionaries = {
  en: { ...en, ...gameEn },
  ru: { ...ru, ...RUSSIAN_PROMPTS, ...gameRu, ...characterRu, ...landingRu, ...telegramRu },
};
function patterns(dictionary: Record<string, string>) {
  return Object.entries(dictionary)
    .filter(([key]) => key.includes('{0}'))
    .map(([key, value]) => ({
      regex: new RegExp(
        '^' +
          key
            .split(/(\{\d+\})/)
            .map((part) =>
              /^\{\d+\}$/.test(part) ? '(.+?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            )
            .join('') +
          '$',
      ),
      value,
    }));
}
const templates = { en: patterns(dictionaries.en), ru: patterns(dictionaries.ru) };
const cache = new Map<string, string>();
function translate(text: string): string {
  const key = text.trim().replace(/\s+/g, ' ');
  const locale = getPreferences().locale;
  const cacheKey = `${locale}:${key}`;
  let result = cache.get(cacheKey);
  if (result === undefined) {
    const dictionary = dictionaries[locale];
    if (Object.hasOwn(dictionary, key)) result = dictionary[key];
    else
      for (const { regex, value } of templates[locale]) {
        const match = regex.exec(key);
        if (match) {
          result = value.replace(
            /\{(\d+)\}/g,
            (_, index: string) => match[Number(index) + 1] ?? '',
          );
          break;
        }
      }
    result ??= key;
    // Dynamic scores and messages must not grow the cache for the life of a tab.
    if (cache.size >= 1500) cache.clear();
    cache.set(cacheKey, result);
  }
  return result ? `${/^\s/.test(text) ? ' ' : ''}${result}${/\s$/.test(text) ? ' ' : ''}` : '';
}
/** Translate product copy only. Player names, room codes and custom prompts remain verbatim. */
export function tr<T>(value: T): T {
  return (typeof value === 'string' ? translate(value) : value) as T;
}
export function formatDate(
  at: number,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return new Intl.DateTimeFormat(
    getPreferences().locale === 'ru' ? 'ru-RU' : 'en-US',
    options,
  ).format(at);
}
