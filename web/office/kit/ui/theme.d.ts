export type Theme = 'auto' | 'light' | 'dark';
export declare const THEMES: Theme[];
/**
 * Where a page keeps the theme chosen: on the device under its own `key`, or, null, nowhere (memory, for the visit).
 * Called before anything asks for the theme (before `setup`); the site's own key, "to-theme", is the default.
 */
export declare function keepThemeAt(key: string | null): void;
export declare function theme(): Theme;
export declare const themeName: (th: Theme) => string;
/** The theme as it stands, on the page. */
export declare function applyTheme(): void;
export declare function setTheme(th: Theme): void;
/** At load: the choice as it was left, and the device's changes followed while it is "auto". */
export declare function initTheme(): void;
