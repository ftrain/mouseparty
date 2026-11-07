// What the window is given: the Go side's App (app.go, "what the window calls"),
// which Wails binds as window.go.main.App, each method a promise, and the
// Wails runtime's window.runtime. Bindings aren't generated (-skipbindings), so
// they are written here, and follow app.go by hand.

export {};

declare global {
    interface Window {
        go: { main: { App: App } };
        runtime: Runtime;
    }
}

// app.go View: what the window draws, sent as the "view" event after every change
export interface View {
    play: 'play' | 'stop';
    playOn: boolean; // in colour, and can be pressed
    link: 'copy' | 'spinner';
    linkOn: boolean; // in colour
    linkPress: boolean; // can be pressed
    linkNote: string; // under the icon: "Making link", "Copied", "Wi-Fi only"...
    rows: Row[];
    selected: number; // -1: none
    slider: Slider;
    locked: boolean; // the party is sealed: the window asks for its passcode, and shows nothing else
    sealed: boolean; // the party is kept encrypted
}

export interface Row {
    title: string;
    icon: Icon; // what it is, for the icon column
    length: string; // how long, how many pages, how big; a download's progress
    now: boolean; // playing
    played: boolean; // above the one playing, or next to play
    off: boolean; // can't play: its file is gone (a drive unplugged) or unreadable
}

// what a row is: a movie, a song, a PDF, another document, a database, or a download link not yet down
export type Icon = 'video' | 'audio' | 'pdf' | 'text' | 'db' | 'download';

// the playhead (seconds into the movie), or a PDF's pages
export interface Slider {
    on: boolean;
    min: number;
    max: number;
    value: number;
    label: string;
    pages: boolean;
}

export interface App {
    GetView(): Promise<View>;
    PlayClicked(): Promise<void>;
    LinkClicked(): Promise<void>;
    Select(i: number): Promise<void>;
    Move(from: number, to: number): Promise<void>;
    PlayRow(i: number): Promise<void>;
    Remove(): Promise<void>;
    Seek(seconds: number): Promise<void>;
    ShowPage(page: number): Promise<void>;
    TurnPage(step: number): Promise<void>;
    AddPaths(paths: string[], row: number, at: number): Promise<void>;
    AddURL(link: string, user: string, pass: string, save: boolean): Promise<string>; // Party > Add Download Link: "" when it's in the list, or why not; a username is the login for the link's site, saved, or only until the app quits
    LoginFor(link: string): Promise<LinkLogin>; // the login the sheet fills in for a link
    CacheText(): Promise<string>; // what the download cache holds: "3 downloads, 4.2 GB" ("" for nothing)
    ClearCache(): Promise<string>; // Party > Clear Download Cache: every download deleted, the rows kept; "" or why not
    // the party file (party.go): each "" when it worked, or why not
    Unlock(passcode: string): Promise<string>;
    StartOver(): Promise<string>;
    SetPasscode(current: string, next: string): Promise<string>;
    SettingsText(): Promise<string>;
    SetSettingsText(text: string): Promise<string>;
    // the Settings window (prefs.go): each change kept as it's made
    Prefs(): Promise<Prefs>;
    SetPrefs(p: Prefs): Promise<string>;
    SaveAccount(site: string, user: string, pass: string): Promise<string>; // site: its name, or a link to it
    RemoveAccount(site: string): Promise<string>;
}

// prefs.go's Prefs: the settings, as the Settings window shows them
export interface Prefs {
    countdown: number; // seconds of "up next" card before each movie
    skip: number; // minutes into the first movie played
    bitrate: number; // kbit/s
    preset: string; // x264's preset
    openRouterPorts: boolean;
    cacheGB: number; // 0: no limit
    cache: string; // only shown: what the cache holds now ("" for nothing)
    accounts: Account[]; // only shown
    sealed: boolean; // only shown
}

export interface Account {
    site: string;
    user: string;
}

// prefs.go's LinkLogin: what the Add Download Link sheet fills in
export interface LinkLogin {
    site: string; // "" while it isn't a link
    user: string;
    pass: string;
    saved: boolean;
}

// what the Party menu asks the window for (party.go's ask)
export type Ask = 'on' | 'change' | 'off' | 'settings' | 'link' | 'clear' | 'prefs';

// as much of the Wails runtime as the window uses
export interface Runtime {
    OnFileDrop(callback: (x: number, y: number, paths: string[]) => void, useDropTarget: boolean): void;
    EventsOn(name: 'view', callback: (v: View) => void): () => void;
    EventsOn(name: 'ask', callback: (mode: Ask) => void): () => void;
}
