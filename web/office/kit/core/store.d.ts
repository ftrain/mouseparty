/** Whether things are kept on this device. */
export declare function keeping(): boolean;
export declare const store: {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    /** Every key of ours that holds something. */
    keys(): string[];
};
/**
 * A page's own preference, kept where it says (kit/ui/theme.ts `keepThemeAt`, kit/ui/zoom.ts `keepSizeAt`): on the
 * device under its key, whatever Private or Saved says, since it is the page's and not the site's; or, with no key, in
 * memory for the visit alone.
 */
export declare function prefAt(key: string | null): {
    get: () => string | null;
    set: (value: string) => undefined;
    remove: () => undefined;
};
/**
 * Keep things from now on (what the visit has set so far comes along), or stop: every trace goes, from the device
 * and from memory alike, the size and the theme with the rest, so turning it on again starts from nothing (Paul,
 * 2026-10-12: "I turn save off and then back on and the documents it removed are still there"). Changed afterwards,
 * the size and the theme are written again: they are the two things a private visit keeps on the device.
 */
export declare function setKeeping(on: boolean): void;
