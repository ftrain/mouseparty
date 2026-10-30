interface Names {
    month: string[];
    monthShort: string[];
    weekday: string[];
    weekdayShort: string[];
}
/** The languages Intl may lack: their months and weekdays (Sunday first, as Intl counts them). */
export declare const NAMES: Record<string, Names>;
export interface DateWords {
    format(d: Date | number): string;
    formatToParts(d: Date | number): Intl.DateTimeFormatPart[];
    formatRange(a: Date | number, b: Date | number): string;
}
/**
 * A formatter for the language, as `new Intl.DateTimeFormat(lang, opts)` is for a language without names of its own;
 * with them, Intl's English layout with the language's own names for the month and the weekday, in the length asked.
 */
export declare function dateWords(opts: Intl.DateTimeFormatOptions, lang?: string): DateWords;
/** `toLocaleDateString(lang, opts)` with the lacking languages' names: the same words, from the same formatter. */
export declare const dateString: (d: Date | number, opts: Intl.DateTimeFormatOptions, lang?: string) => string;
export {};
