/** A language's Fluent file, or a loader of one (Vite's ?raw import: the file's text as its default). */
type Loader = () => Promise<string | {
    default: string;
}>;
/** A language's name, in itself, as a menu begins it: "Español", "Русский", "Kreyòl ayisyen". */
export declare const languageName: (code: string) => string;
/**
 * The codes of the languages present, English first, then by their names in themselves under the root collation:
 * the Latin names A to Z, then Cyrillic, Arabic, Devanagari, Bengali, Hangul and Han, as a reader of each finds theirs.
 */
export declare const languages: () => string[];
/** The language in use. */
export declare const language: () => string;
/** Whoever shows strings is told when the language changes, so they can draw again. */
export declare function onLanguage(cb: () => void): () => void;
/** A language's file given by hand (a test's in-memory Spanish), or a loader of one (a test's slow file). */
export declare function register(code: string, source: string | Loader): void;
/**
 * Messages added to a language, as a Fluent source (an app built outside the suite: the header): kept, so the language
 * gets them whenever its bundle is made, and added at once to the bundle there is. An id already there keeps its
 * message. English is made here if no file brought it (a program run from source with no en.ftl beside it).
 */
export declare function addStrings(code: string, source: string): void;
/**
 * In development only: the ids asked for in the language in use and not found there, so English showed
 * through. A test clears it, draws, and reads it; a build drops the recording.
 */
export declare const missed: Set<string>;
/** The message in the language in use, its placeables filled; a variable not given shows as {name}, so the gap can be seen. */
export declare function t(id: string, vars?: Record<string, string | number>): string;
/** Which way a language runs. */
export declare function directionOf(code: string): 'ltr' | 'rtl';
/** The language being loaded, or null when the one in force is the one asked for. */
export declare const languagePending: () => Promise<void> | null;
/** The language chosen, or null to follow the browser: what the link carries as "lang". */
export declare const chosenLanguage: () => string | null;
/** Choose a language (null: the browser's), from now on. The shell puts it in the address (onLanguage). */
export declare function setLanguage(code: string | null): Promise<void>;
/**
 * The language of the browser's nearest to one present: "pt-BR" finds pt-br, then pt; a Chinese tag finds its script
 * (zh-TW, zh-HK and zh-Hant-* are zh-hant; zh-CN, zh-SG, zh-Hans-* and zh alone are zh-hans), as Intl.Locale's
 * maximize() says it is written; else English.
 */
export declare function browserLanguage(wanted?: readonly string[]): string;
/** At load: the language the link chose (the shell has read it already), or the browser's. */
export declare const initLanguage: () => Promise<void>;
export {};
