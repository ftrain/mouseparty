import './dialog.ts';
/** Where a link really goes: null for one that stays here, 'refused' for one that never opens, else the address. */
export declare function leaving(href: string, base?: string): URL | 'refused' | null;
/**
 * What the dialog says of an address: what the link does, and the one name to read (the host, the mailbox, the
 * number). Null for a mailbox or a number whose name hides characters (HIDDEN: a reversal drawn would show a false address in
 * large type); a web address's host is the browser's own spelling, and its whole address spells such characters out.
 */
export declare function where(u: URL): {
    what: string;
    name: string;
} | null;
/** Ask before going to this address. */
export declare function ask(url: URL): Promise<void>;
/** Follow a link from code the way every link is followed: by asking first. */
export declare function openLink(href: string): void;
/** Every click on a link that leaves the site, anywhere on the page, asks first. */
export declare function installLinkGuard(root?: Document): void;
