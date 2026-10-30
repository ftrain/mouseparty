/**
 * iCalendar (RFC 5545) as text, for any app with dates: one writer, so every file folds its lines the same
 * way (at most 75 octets of UTF-8 a line, a continuation starting with a space, never splitting a character),
 * escapes the same characters and ends its lines with CRLF. No DOM.
 */
/** TEXT values: a backslash, a semicolon and a comma escaped, a newline as \n. */
export declare const icsText: (s: string) => string;
/** "2027-03-01" as a DATE value: 20270301. */
export declare const icsDate: (iso: string) => string;
/** An instant as a UTC DATE-TIME: 20270301T100000Z. */
export declare const icsStamp: (ms: number) => string;
/** A content line folded: longer than the limit, it goes on in lines that start with a space. */
export declare function icsFold(line: string): string;
/** A calendar of components (each the lines of one VEVENT or VTODO, BEGIN to END), folded, with CRLF line ends. */
export declare function vcalendar(components: string[][], product?: string): string;
