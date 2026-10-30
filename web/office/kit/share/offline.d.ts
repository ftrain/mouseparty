/** The worker registered (on) or removed with its caches (off). Never throws: a browser without workers keeps nothing. */
export declare function keepOffline(on: boolean): Promise<void>;
/** At load: registered under Saved, and nothing left under Private. */
export declare const offlineAtLoad: () => Promise<void>;
