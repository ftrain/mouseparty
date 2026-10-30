// What the host's Mac sends this page and takes from it, as its Go writes it:
// the chat socket (chat.go, session.go, apphost.go, apps.Session.Info) and
// /status (web.go). Types only: nothing here reaches the page. And the
// contract between host.ts and an app's script (apps/<name>.ts).

// a line of the chat, kept for those who arrive (Chat.say stamps it)
export interface ChatLine {
    type: 'msg' | 'system';
    name?: string; // a msg's
    text: string;
    at: number; // epoch seconds
}

// a subtitle track (session.go SubTrack); its cues come from subs/<token>/<id>
export interface SubTrack {
    id: string;
    label: string;
    lang: string;
    default: boolean;
}
export interface Subs {
    type: 'subs';
    token: string | null;
    tracks: SubTrack[];
}
export type Cue = [start: number, end: number, text: string]; // subtitles.go Cue, in movie seconds

// the movie's position as it leaves the Mac (clockJSON)
export interface Clock {
    token: string;
    position: number;
}

// a line of the guide (session.go ScheduleRow); start is epoch seconds, null before Play
export interface ScheduleRow {
    title: string;
    duration: number;
    start: number | null;
    pages: number | null; // a PDF
    data?: boolean; // a database
    cc: boolean;
}
export interface Schedule {
    type: 'schedule';
    rows: ScheduleRow[];
    now: number; // the host's, epoch seconds
}

// a PDF or a database up (session.go Doc)
export interface Doc {
    token: string;
    title: string;
    kind: 'pdf' | 'db' | 'text';
    pages: number;
    page: number;
    at: string; // a database: the page of it everyone is on
    back: boolean; // and there's one before it
    // another document (session.go): read by pandoc as it goes up, then fetched from /doc/<token> as the editors' text
    app?: 'write' | 'deck' | 'sheet';
    ready?: boolean;
    error?: string;
}
export interface DocNote {
    type: 'doc';
    doc: Doc | null;
}

// an app open (apps.Session.Info), as this viewer sees it
export interface AppInfo {
    id: number;
    name: string;
    script: string; // apps/<script>.js draws it (every document kind is office)
    title: string;
    icon: string;
    glass: boolean;
    size: 'full' | 'big' | 'small';
    by: string;
    view: unknown; // the app's View(v): its script knows its shape
}

// what the + offers (Host.greeting)
export interface AppKind {
    name: string;
    title: string;
    icon: string;
    min: number;
}

// what the host says, then, as /status and the first thing on the socket
export interface Hello {
    subs: Subs;
    clock: Clock | null;
    schedule: Schedule;
    doc: DocNote;
}
export interface Status extends Hello {
    standby: boolean;
    viewers: number;
    iceServers: RTCIceServer[];
}

// an app's view or one of its events ({"type": "app", "id", ...}): the rest is the app's own
export interface AppNote {
    type: 'app';
    id: number;
    kind: string;
    view?: unknown;
    [field: string]: unknown;
}

export type FromHost =
    | (Hello & { type: 'hello'; history: ChatLine[]; online: string[]; you: number; apps: AppInfo[]; kinds: AppKind[]; appsMax: number })
    | { type: 'apps'; op: 'open'; app: AppInfo }
    | { type: 'apps'; op: 'close'; id: number }
    | AppNote
    | DocNote
    | Subs
    | Schedule
    | { type: 'clock'; clock: Clock | null }
    | { type: 'online'; online: string[] }
    | ChatLine;

// what this page says on the socket (chat.go, apphost.go)
export type ToHost =
    | { type: 'join'; name: string }
    | { type: 'say'; text: string }
    | { type: 'app_open'; name: string }
    | { type: 'app_close'; id: number }
    | { type: 'doc_at'; token: string | null; at?: string; back?: true }
    | ({ type: 'app'; id: number } & AppMsg);

// a message to an app's Go half: its Message reads kind and the rest (apps/lib.go Msg)
export interface AppMsg {
    kind: string;
    [field: string]: unknown;
}
// what each app's script says it sends (its Out): a kind, and its own fields
export type Said = { kind: string };

// a picture the host keeps (apps.Picture), from img and grab
export interface Picture {
    ref: string;
    w: number;
    h: number;
    at?: number;
    title?: string;
}

// ---------- the apps' scripts ----------
// Each apps/<name>.js's default export is a Start: given its window (ctx) and
// this viewer's view, it returns whichever of these it needs. V is its view,
// E its events, Out what it sends: each as its Go half writes and reads them.

export interface Ctx<Out extends Said = AppMsg> {
    layer: HTMLElement; // the window's inside
    send(m: Out): void; // to the app on the host
    me(): { id: number | null; name: string | null };
    videoBox(): Box;
    base: string; // the session's path: pictures (img/), the documents' editors (office/)
    open(name: string): void; // another app, for everyone
}

// a box in the window, in its pixels
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface App<V = unknown, E = unknown> {
    view?(v: V): void;
    message?(m: E): void;
    said?(name: string, text: string): void;
    resize?(): void;
    stop?(): void;
}

export type Start<V = unknown, E = unknown, Out extends Said = AppMsg> = (ctx: Ctx<Out>, view: V) => App<V, E> | undefined;
