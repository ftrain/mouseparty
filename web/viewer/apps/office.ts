// Documents (apps/office.go): a Tiny Little Office document everyone edits at
// once, drawn by the library's own editors (office/editors.js, built by
// scripts/vendor_office.sh), with its kernel (office/doc.js) to carry one
// person's changes over another's. Both are typed by the library's own
// declarations (web/office/editors.d.ts and kernel.d.ts, vendored with them).
//
// The host only puts edits in one order. This page keeps the document as the
// host has ordered it (doc, at version seq) and its own changes the host hasn't
// taken yet (pending), which the editor already shows, as the library's own
// shared documents do (its src/kit/share/multiparty.ts, followed here step by
// step): what's pending goes as one edit made against seq; it comes back as the
// next version (then it's no longer pending) or as a retry, after the versions
// that beat it, over which it has been carried (cross), so it goes again. Ops
// that don't apply are passed over by every page alike; a crossing the kernel
// can't settle, or ops of ours that won't apply, mean this page has lost its
// way, and it takes the host's document whole again (sync).
//
// Pictures are the host's (img/): put in, dropped, pasted, or grabbed from the
// movie with the camera, at the moment everyone is watching.
import type * as Editors from '../../office/editors.d.ts';
import type * as Kernel from '../../office/kernel.d.ts';
import type { Picture, Start } from '../types.ts';
import { h } from './lib.ts';

export interface Lib {
    editors: typeof Editors;
    kernel: typeof Kernel;
}

// the library, once for the page: the editors, their stylesheet, the kernel
let loading: Promise<Lib> | null = null;
// a frame already kept, by its file's stamp: put again, it's the same picture
const grabbed = new Map<number, { size: number; pic: { ref: string; w: number; h: number } }>();
export const library = (base: string) =>
    (loading =
        loading ||
        (async () => {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = `${base}/office/editors.css`;
            document.head.appendChild(css);
            const [editors, kernel] = await Promise.all([
                import(/* @vite-ignore */ `${base}/office/editors.js`) as Promise<typeof Editors>,
                import(/* @vite-ignore */ `${base}/office/doc.js`) as Promise<typeof Kernel>,
            ]);
            // where pictures live: the host's, never the web's (the library's docs/library.md, Images)
            const images: Editors.HostImages = {
                maxBytes: 10 * 1024 * 1024,
                url: (ref) => `${base}/img/${encodeURIComponent(String(ref).replace(/^asset:/, ''))}`,
                bytes: async (ref) => new Uint8Array(await (await fetch(images.url(ref))).arrayBuffer()),
                put: async (file) => {
                    const kept = grabbed.get((file as File).lastModified);
                    if (kept && file.size === kept.size) return kept.pic;
                    const r = await fetch(`${base}/img`, { method: 'POST', body: file });
                    if (!r.ok) throw new Error(await r.text());
                    const p = (await r.json()) as Picture;
                    return { ref: p.ref, w: p.w || undefined, h: p.h || undefined };
                },
            };
            Object.assign(editors.host, {
                link: () => '', // a document opens nowhere else: it's here, for everyone
                read: () => null,
                images,
            });
            editors.setTheme('dark'); // their own dark colours, whatever the device's: the page around them is dark
            return { editors, kernel };
        })());

// the window around an editor (and the reel's, with a bar of its own)
export const css = () => {
    if (document.getElementById('office-css')) return;
    document.head.append(
        h(
            'style',
            { id: 'office-css' },
            `
.office { position: absolute; inset: 0; display: flex; flex-direction: column; }
/* glass like every window: the page and the paper as solid as the slider says, menus and bars nearly solid */
.win.office { --to-bg: rgb(19 19 22 / var(--glass)); --to-paper: rgb(30 30 34 / var(--glass)); --to-paper-shade: rgb(45 45 50 / var(--glass));
              --to-surface: rgb(36 36 40 / calc(0.55 + var(--glass) * 0.45)); --to-surface-2: rgb(44 44 49 / calc(0.55 + var(--glass) * 0.45));
              --to-input-bg: rgb(26 26 30 / calc(0.5 + var(--glass) * 0.5)); }
.win.office .win-body { color: var(--to-ink); }
.office-bar { display: flex; gap: 6px; align-items: center; padding: 4px 8px; font: 12px/1.2 ui-monospace, Menlo, monospace;
              background: #111; color: #ccc; flex: none; }
.office-bar button { font: inherit; color: #fff; background: #333; border: 1px solid #555; border-radius: 3px; padding: 3px 8px; cursor: pointer; }
/* the editor fits the window exactly: anything taller let a focused thing scroll the page, and the bar went up out of
   sight with nothing to scroll it back (a board takes the wheel); a Document, which runs on, scrolls under its bar */
.office-page { position: relative; flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.office-page > .to-editor { flex: 1 1 0; min-height: 0; }
.office-page.scrolls { overflow: auto; display: block; }
.office-page.scrolls > .to-editor { min-height: 100%; }
.office-page.scrolls to-bar { position: sticky; top: 0; z-index: 5; }
.office-page to-bar { flex-wrap: wrap; overflow: visible; height: auto; }   /* a window is narrower than the page the bar measures */`,
        ),
    );
};

// a new document's text, asked for on this page (the reel's "Make it slides"): the next of its kind to open empty starts as it
let seed: { name: string; text: string } | null = null;
export const seedNext = (name: string, text: string) => {
    seed = { name, text };
};

const clock = (s: number) => {
    const t = Math.floor(s),
        hh = Math.floor(t / 3600),
        mm = Math.floor(t / 60) % 60,
        ss = String(t % 60).padStart(2, '0');
    return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};
const newClient = () => Math.random().toString(36).slice(2, 10);
// the kinds a frame can go into, as a picture where the caret is (or at the end)
const TAKES_PICTURES = new Set(['write', 'deck', 'pinboard']);
const APPENDS_PICTURES = new Set(['write', 'deck']); // a picture block at the end is one of their pages' too
// Lucide's camera, as the library's icons are given (lucide 1.54, ISC)
const CAMERA: Editors.IconNode = [
    [
        'path',
        { d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z' },
    ],
    ['circle', { cx: '12', cy: '13', r: '3' }],
];
// documents the host reads (pandoc.go's readFormats), into the kinds that take one: its words at the end, or its slides after these
const READS = new Set(['write', 'deck']);
const READABLE = [
    '.docx',
    '.odt',
    '.rtf',
    '.epub',
    '.fb2',
    '.html',
    '.htm',
    '.xhtml',
    '.tex',
    '.latex',
    '.typ',
    '.md',
    '.markdown',
    '.txt',
    '.rst',
    '.org',
    '.textile',
    '.wiki',
    '.adoc',
    '.dbk',
    '.opml',
    '.ipynb',
    '.pptx',
    '.xlsx',
    '.csv',
    '.tsv',
];
const readable = (f: File) => READABLE.includes(`.${f.name.split('.').pop()}`.toLowerCase());
// Lucide's file-up (lucide 1.54, ISC)
const FILE_UP: Editors.IconNode = [
    ['path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' }],
    ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
    ['path', { d: 'M12 12v6' }],
    ['path', { d: 'm15 15-3-3-3 3' }],
];

// the host's document (apps/office.go state): the text a page last wrote down, and the edits since
export interface State {
    app: string;
    text: string;
    from: number;
    edits: { seq: number; by: number; eid: string; ops: string }[];
    seq: number;
}
type Event = { kind: 'ops'; seq: number; by: number; eid: string; ops: string; snap?: true } | { kind: 'retry'; eid: string } | { kind: 'refused'; eid: string } | { kind: 'state'; state: State };
type Out = { kind: 'edit'; base: number; eid: string; ops: string } | { kind: 'snap'; seq: number; text: string } | { kind: 'seed'; text: string } | { kind: 'sync' };

const office: Start<State, Event, Out> = (ctx, view) => {
    const box = h('div', { class: 'office' });
    const page = h('div', { class: 'office-page' });
    box.append(page);
    ctx.layer.append(box);
    css();

    let lib: Lib | null = null,
        mounted: Editors.Mounted | null = null,
        stopped = false;
    let app = view.app,
        doc: Kernel.Doc | null = null,
        seq = 0,
        pending: Kernel.Op[] = [],
        inflight: { eid: string; count: number } | null = null,
        client = newClient(),
        n = 0;
    let seeding = false; // an empty document, given its first text: nothing is drawn until the host says what it is
    const say = (text: string) => lib && lib.editors.toast(text);
    // ops travel as the JSON this page or another wrote, which the host passes on untouched
    const opsOf = (text: string): Kernel.Op[] => {
        try {
            const ops: unknown = JSON.parse(text);
            return Array.isArray(ops) ? ops : [];
        } catch (e) {
            return [];
        }
    };

    // the document as every page takes an edit: null where its ops don't apply, or leave what the text wouldn't keep
    const applied = (d: Kernel.Doc, ops: Kernel.Op[]) => {
        try {
            const next = lib!.kernel.applyAll(d, ops);
            lib!.kernel.keptDoc(next);
            return next;
        } catch (e) {
            return null;
        }
    };
    // the host's document: the text it wrote down, and the edits since
    const load = (state: State) => {
        const K = lib!.kernel;
        let d = K.parse(state.text || '');
        for (const e of state.edits || []) d = applied(d, opsOf(e.ops)) || d;
        doc = d;
        seq = state.seq;
        pending = [];
        inflight = null;
        client = newClient();
    };
    const shown = () => lib!.kernel.write(lib!.kernel.applyAll(doc!, pending));

    const flush = () => {
        if (inflight || !pending.length || stopped) return;
        const ops = pending.slice();
        if (!applied(doc!, ops)) return sync();
        inflight = { eid: `${client}:${++n}`, count: ops.length };
        ctx.send({ kind: 'edit', base: seq, eid: inflight.eid, ops: JSON.stringify(ops) });
    };
    const sync = () => {
        inflight = null;
        ctx.send({ kind: 'sync' });
    };
    const changed = (ops: Kernel.Op[]) => {
        if (!ops.length) return;
        pending = pending.concat(ops);
        flush();
    };

    // the camera in the editor's own bar (the library's "a page's own commands"), for the kinds that take pictures
    let grabbing = false;
    const grabCommand = () =>
        lib!.editors.command({
            id: 'host.grab',
            scope: 'host',
            where: ['bar'],
            icon: CAMERA,
            label: () => 'Grab frame',
            hint: () => 'Put the frame on screen now into the document',
            disabled: () => grabbing,
            does: () => grab(),
        });
    const mount = async () => {
        page.textContent = '';
        page.classList.toggle('scrolls', app === 'write');
        const commands = [...(TAKES_PICTURES.has(app) ? [grabCommand()] : []), ...(READS.has(app) ? [readCommand()] : [])];
        mounted = await lib!.editors.mount(app, lib!.kernel.write(doc!), page, () => {}, { onOps: changed, fill: true, commands, context: {} });
    };

    // a picture into the document: as if it were pasted where the caret is; where the editor takes no paste, at the end
    const putPicture = async (file: File) => {
        const editor = mounted!.editor;
        const heard = { n: 0 };
        const count = () => heard.n++;
        editor.addEventListener('docops', count);
        const dt = new DataTransfer();
        dt.items.add(file);
        // where the editor takes a paste: its words where the caret was, or a board (which takes one only while focused)
        if (!editor.contains(document.activeElement) || document.activeElement!.closest('to-bar')) {
            const surface = editor.querySelector<HTMLElement>('.pin-wrap') || editor.querySelector<HTMLElement>('[contenteditable="true"]');
            if (surface) surface.focus();
        }
        const target = editor.contains(document.activeElement) ? document.activeElement! : editor;
        try {
            target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }));
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 1200));
        editor.removeEventListener('docops', count);
        if (heard.n || stopped || !APPENDS_PICTURES.has(app)) return;
        const pic = await lib!.editors.host.images!.put(file);
        const K = lib!.kernel,
            now = K.applyAll(doc!, pending);
        const op: Kernel.Op = { op: 'splice', at: now.blocks.length, n: 0, blocks: [K.imageBlock(pic.ref, file.name.replace(/\.\w+$/, ''), pic.w, pic.h)] };
        mounted!.applyRemote([op]);
        changed([op]);
    };
    const grab = async () => {
        if (grabbing) return;
        grabbing = true;
        try {
            const r = await fetch(`${ctx.base}/grab`, { method: 'POST' });
            if (!r.ok) {
                say(r.status === 409 ? 'No movie is playing' : 'No frame');
                return;
            }
            const pic = (await r.json()) as Picture;
            const blob = await (await fetch(lib!.editors.host.images!.url(pic.ref))).blob();
            const stamp = Date.now();
            const name = `${pic.title ? pic.title + ', ' : ''}${clock(pic.at!)}`;
            const file = new File([blob], `${name}.png`, { type: 'image/png', lastModified: stamp });
            grabbed.set(stamp, { size: blob.size, pic: { ref: pic.ref, w: pic.w, h: pic.h } });
            await putPicture(file);
            say(`Frame at ${clock(pic.at!)}`);
        } finally {
            grabbing = false;
        }
    };

    // a document brought in, by the bar's button or dropped on the window: the host reads it (pandoc.go), and its
    // words, tables and pictures go at the end of this one, for everyone (Slides: as slides after these)
    let reading = false;
    const readCommand = () =>
        lib!.editors.command({
            id: 'host.read',
            scope: 'host',
            where: ['bar'],
            icon: FILE_UP,
            label: () => 'Bring in a document',
            hint: () => 'A Word, OpenOffice or PowerPoint file, an EPUB, a web page, LaTeX…, added at the end',
            disabled: () => reading,
            does: () => choose(),
        });
    const choose = () => {
        const input = h('input', { type: 'file', accept: READABLE.join(',') });
        input.addEventListener('change', () => input.files![0] && bringIn(input.files![0]));
        input.click();
    };
    const bringIn = async (file: File) => {
        if (reading || !mounted) return;
        reading = true;
        say(`Reading ${file.name}…`);
        try {
            const r = await fetch(`${ctx.base}/read?name=${encodeURIComponent(file.name)}&app=${app}`, { method: 'POST', body: file });
            if (!r.ok) {
                say(r.status === 413 ? 'That file is too big' : (await r.text()).trim() || 'That file could not be read');
                return;
            }
            const { text } = (await r.json()) as { text: string };
            const K = lib!.kernel,
                now = K.applyAll(doc!, pending);
            let blocks = K.parse(text).blocks;
            if (!blocks.length) {
                say(`Nothing in ${file.name} to bring in`);
                return;
            }
            if (app === 'deck' && now.blocks.length) blocks = [K.parse('x\n\n---\n\nx').blocks[1], ...blocks]; // the next slide
            const op: Kernel.Op = { op: 'splice', at: now.blocks.length, n: 0, blocks };
            if (JSON.stringify([op]).length > 1 << 20 || !applied(now, [op])) {
                say(`${file.name} is too long to bring in`);
                return;
            }
            mounted.applyRemote([op]);
            changed([op]);
            say(`Brought in ${file.name}`);
        } catch (e) {
            say('That file could not be read');
        } finally {
            reading = false;
        }
    };
    // dropped: a picture is the editor's own, any other document the host's to read
    box.addEventListener(
        'dragover',
        (e) => {
            if (READS.has(app) && [...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file' && !i.type.startsWith('image/'))) e.preventDefault();
        },
        true,
    );
    box.addEventListener(
        'drop',
        (e) => {
            const file = [...(e.dataTransfer?.files || [])].find(readable);
            if (!file || !READS.has(app) || !mounted) return;
            e.preventDefault();
            e.stopPropagation();
            bringIn(file);
        },
        true,
    );

    (async () => {
        lib = await library(ctx.base);
        if (stopped) return;
        load(view);
        if (view.seq === 0 && !view.text) {
            // a new document starts as a copy someone asked for on this page (the reel's "Make it slides"), or
            // as its app's own blank (a pinboard's empty table, which everyone's first things must share)
            const seeded = seed && seed.name === app ? seed.text : null;
            if (seeded !== null) seed = null;
            const text = seeded !== null ? seeded : await lib.editors.appOf(app)?.blank?.();
            if (text) {
                seeding = true;
                ctx.send({ kind: 'seed', text });
                return; // drawn when the host's view comes back with it (or another page's seed)
            }
        }
        await mount();
    })();

    return {
        view(v) {
            if (lib && seeding && v.text) {
                seeding = false;
                load(v);
                mount();
                return;
            }
            // every page gets the whole state again when someone arrives: only a document still at its start takes it
            if (!lib || !mounted || v.seq !== 0 || seq !== 0 || pending.length || (v.text || '') === shown()) return;
            load(v);
            mount();
        },
        message(m) {
            if (!lib || !mounted) return;
            if (m.kind === 'ops') {
                if (m.seq <= seq) return;
                if (m.seq !== seq + 1) return sync();
                const ops = opsOf(m.ops);
                const next = applied(doc!, ops);
                if (inflight && m.eid === inflight.eid) {
                    // ours, taken: already shown here, and checked before it went
                    if (!next) return sync();
                    pending = pending.slice(inflight.count);
                    inflight = null;
                    doc = next;
                    seq = m.seq;
                    if (m.snap) ctx.send({ kind: 'snap', seq, text: lib.kernel.write(doc) });
                    flush();
                    return;
                }
                if (next) {
                    try {
                        const [mine, passed] = lib.kernel.cross(pending, ops);
                        pending = mine;
                        mounted.applyRemote(passed);
                    } catch (e) {
                        doc = next;
                        seq = m.seq;
                        return sync();
                    }
                }
                doc = next || doc;
                seq = m.seq;
            } else if (m.kind === 'retry') {
                if (inflight && m.eid === inflight.eid) {
                    inflight = null;
                    flush();
                }
            } else if (m.kind === 'refused') {
                say('That change could not be shared');
                sync();
            } else if (m.kind === 'state') {
                load(m.state);
                mounted.editor.value = lib.kernel.write(doc!);
            }
        },
        stop() {
            stopped = true;
        },
    };
};
export default office;
