import type { Block } from '../../doc/index.ts';
import './dialog.ts';
/** A short link from the shortener, …/<id>#<key> (a ".…" after the key is let be): where it is, its id and key. */
export declare function shortParts(link: string): {
    at: string;
    id: string;
    key: string;
} | null;
/** Another Tiny Little Office document, by its link (long or short): its first page is shown small. Resolves the fence that holds it. */
export declare function askDocLink(): Promise<Block | null>;
