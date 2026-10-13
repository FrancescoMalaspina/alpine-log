export const LANGS = ['en', 'it'] as const;
export type Lang = typeof LANGS[number];

/**
 * The shape another language must match: every string becomes `string`,
 * functions (plurals, text with values or markup) keep their signature.
 * English is the source; a key missing in Italian is a type error.
 */
export type Widen<T> =
  T extends string ? string
  : T extends (...args: infer A) => infer R ? (...args: A) => R
  : { [K in keyof T]: Widen<T[K]> };
