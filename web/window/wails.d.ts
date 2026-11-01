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
    length: string;
    now: boolean; // playing
    played: boolean; // above the one playing, or next to play
    off: boolean; // can't play: its file is gone (a drive unplugged) or unreadable
}

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
    // the party file (party.go): each "" when it worked, or why not
    Unlock(passcode: string): Promise<string>;
    StartOver(): Promise<string>;
    SetPasscode(current: string, next: string): Promise<string>;
    SettingsText(): Promise<string>;
    SetSettingsText(text: string): Promise<string>;
}

// what the Party menu asks the window for (party.go's ask)
export type Ask = 'on' | 'change' | 'off' | 'settings';

// as much of the Wails runtime as the window uses
export interface Runtime {
    OnFileDrop(callback: (x: number, y: number, paths: string[]) => void, useDropTarget: boolean): void;
    EventsOn(name: 'view', callback: (v: View) => void): () => void;
    EventsOn(name: 'ask', callback: (mode: Ask) => void): () => void;
}
