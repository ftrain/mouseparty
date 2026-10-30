/**
 * The registry: every app's definition, in the order the home page shows them. A definition is light (no
 * DOM, no templates: those are a file of their own, asked for with `templates()`), so the API reads it without the
 * editors (vite.api.config.ts); the build reads it too (vite.config.ts).
 *
 * An app built outside the suite (docs/library.md, An app built outside) is registered by the page that holds it,
 * with `registerApp`, after the suite's: `appOf` finds it, so `editorTag` and `mount` draw it, and a document of it
 * placed in another is drawn by its own view. `apps()` stays the suite's, in their order, since everything that
 * lists it is the site's: the home page, the routes and pages the build writes, Insert ▾'s new documents, the drawer,
 * the API, the skill and its examples. The site never registers one.
 */
import { type AppDef } from './app.ts';
export declare const apps: () => AppDef[];
export declare const appOf: (id: string) => AppDef | undefined;
/**
 * An app built outside the suite, put in the registry after the suite's: from now on `appOf(def.id)` is `def`. Its id
 * names nothing the registry knows (an app's, or the QR code's, the picture's and the locked document's above), or this throws, so a
 * second registration of one id is an error rather than an app quietly replaced; unless it is the same definition
 * again (sameDef: the module imported twice, or reloaded unchanged), which is nothing to do.
 */
export declare function registerApp(def: AppDef): void;
/** The site's own address, whichever app page we were opened from ("/text/" is a page of the site at "/"): route.ts siteOf. */
export declare const siteRoot: () => string;
