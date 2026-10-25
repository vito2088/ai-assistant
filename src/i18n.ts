import { translations } from './locales';

export const languages = [
  { id: 'zh-CN', name: '简体中文' },
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
] as const;
export type Locale = typeof languages[number]['id'];
export const normalizeLocale = (value: string | null): Locale => languages.some(l => l.id === value) ? value as Locale : 'zh-CN';
let locale: Locale = 'zh-CN';
try { locale = normalizeLocale(localStorage.getItem('ui_language')); } catch { /* Storage may be unavailable in a webview. */ }
export const getLocale = () => locale;
export function setLocale(value: string | null) {
  locale = normalizeLocale(value);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  try { localStorage.setItem('ui_language', locale); } catch { /* SQLite remains the source of truth. */ }
}
export function t(key: string, values: readonly unknown[] = []): string {
  const text = locale === 'zh-CN' ? key : translations[key]?.[locale] ?? key;
  // A single replacement pass keeps interpolation data opaque, even if it contains braces.
  return text.replace(/\{(\d+)\}/g, (match, index) => Number(index) < values.length ? String(values[Number(index)]) : match);
}
export function h(key: string, values: readonly unknown[] = []) {
  return t(key, values).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
