/**
 * <to-template-picker> and `pickTemplate(app?)`: a document to start from, chosen from the apps' templates and handed
 * back to the page, never opened (docs/library.md, A template picker). The home page's templates dialog (kit/ui/home.ts)
 * opens the document it is chosen in; this one gives it to the page that asked, as `{ app, id, title, text }`
 * (PickedTemplate: the app's id, the template's, its name, and its TLO text), for a host that keeps its documents
 * itself (a CRM built on the library writes an exploration from one).
 *
 * The templates are the registry's (`appOf(id).templates()`, an app built outside the suite's too), each drawn small
 * from its own document (<to-preview>), under its app's name, Blank first where the app's templates carry no blank of
 * their own (its `blank()`, named as a new document of the app is). `app` names one app; `apps`, a few (a host that
 * keeps documents of a few apps: a text, a deck, a sheet), offered first as a menu of the apps, each its icon, name and
 * line, the one chosen's templates then, with a way back to the apps; without either, every app of the suite. It is a listbox in a dialog, its keys a menu's (kit/ui/menu.ts): the arrows, Home and End, letters, Enter;
 * Escape or a click outside lets it go.
 *
 *   const picked = await pickTemplate('write');   // null when let go
 *   const one = await pickTemplate(['write', 'deck', 'sheet', 'outline', 'board']);   // the apps first, then one's templates
 *   if (picked) save(picked.title, picked.text);
 *
 * The element is for a page that places it itself: `show()` opens it and resolves as `pickTemplate` does, and a
 * template chosen is told in `templatepick` too.
 */
import { LitElement, type TemplateResult } from 'lit';
import type { Template } from '../core/app.ts';
import './preview.ts';
/** A document to start from: its app, the template's id ("blank" for Blank), its name, and its text. */
export interface PickedTemplate {
    app: string;
    id: string;
    title: string;
    text: string;
}
export declare class ToTemplatePicker extends LitElement {
    static properties: {
        app: {};
        apps: {
            attribute: boolean;
        };
        chosen: {
            state: boolean;
        };
        lists: {
            state: boolean;
        };
    };
    /** The one app whose templates are offered; '' for every app of the suite. */
    app: string;
    /** The apps offered, by id, when they are a few: more than one, a menu of them first. */
    apps: string[];
    /** The app chosen from the menu of `apps`; '' while the menu is shown. */
    chosen: string;
    /** Each app's templates as they arrive. */
    lists: Map<string, Template[]>;
    readonly uid: string;
    private answer;
    private from;
    constructor();
    createRenderRoot(): this;
    get dialog(): HTMLDialogElement | null;
    private get listbox();
    private options;
    /** The apps of the menu, where `apps` names more than one (each one the registry knows). */
    private offered;
    /** The menu of apps is what is shown: several offered and none chosen yet. */
    private get choosing();
    /** The apps whose templates are offered: the one chosen from the menu, the one named, the one of `apps`, or the suite's. */
    private defs;
    /** An app's templates asked for, once. */
    private load;
    /** An app chosen from the menu: its templates, the first one in hand. */
    private pickApp;
    /** Back to the menu of apps, the one that was chosen in hand. */
    private back;
    /** The picker opened: resolves with the template chosen, or null when it is let go. */
    show(): Promise<PickedTemplate | null>;
    /** Let go: resolves null. */
    close(): void;
    private choose;
    private onClose;
    private option;
    /** One of the menu's apps: its icon, its name and its line. */
    private appOption;
    render(): TemplateResult<1>;
}
/**
 * A template chosen, handed back: `app`'s templates (every app's in the suite, without it; given a list of apps, a
 * menu of them first, and then the one chosen's) in a dialog over the page,
 * resolving with the one chosen (PickedTemplate) or null when the dialog is let go. Nothing is opened or navigated to.
 */
export declare function pickTemplate(app?: string | string[]): Promise<PickedTemplate | null>;
