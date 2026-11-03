// Stickies (apps/stickies.go): notes stuck on what's playing, signed with your
// chat name, in the colour you pick as you go. Each is anchored where it was
// written: a moment of a movie or a song (it shows for a few seconds from there,
// every time it plays), or a page of a document (it shows while that page is up
// here: your own page, wherever you've slid to). No window: the notes sit on the
// picture, lined up with it, and a little bar in its corner writes them, picks
// their colour, hides them (for you) and closes Stickies (for everyone). Your
// own notes you can drag, recolour (pick one, then a colour) and take off.
import type { Start } from '../types.ts';

// apps/stickies.go View
interface Note {
    id: number;
    by: string;
    text: string;
    c: number;
    x: number;
    y: number;
    at?: number;
    page?: number;
    when: number;
}
interface View {
    on: boolean; // something's playing to stick notes on
    key: string;
    title: string;
    paged: boolean; // a document: notes go on pages
    notes: Note[];
}
type Out =
    | { kind: 'add'; text: string; c: number; x: number; y: number; at?: number; page?: number }
    | { kind: 'move' | 'color'; sid: number; x?: number; y?: number; c?: number }
    | { kind: 'remove'; sid: number };

const PALETTE = ['#ffe066', '#ff9ebb', '#8ce99a', '#8fd3ff', '#ffc078', '#d0bfff']; // stickyColors, by index
const SHOW_S = 8; // a note on a moment shows this long from it
const TEXT_MAX = 280;

const CSS = `
.stk { position: absolute; inset: 0; pointer-events: none; font: 13px/1.3 system-ui, -apple-system, sans-serif; }
.stk-bar { position: absolute; display: flex; gap: 4px; align-items: center; padding: 4px; pointer-events: auto;
  background: rgb(0 0 0 / 0.55); border-radius: 6px; color: #fff; user-select: none; }
.stk-bar button { font: inherit; color: #fff; background: rgb(255 255 255 / 0.12); border: 1px solid rgb(255 255 255 / 0.25);
  border-radius: 4px; padding: 2px 7px; cursor: pointer; }
.stk-bar button:hover { background: rgb(255 255 255 / 0.25); }
.stk-sw { width: 18px; height: 18px; padding: 0 !important; border-radius: 50% !important; }
.stk-sw.on { outline: 2px solid #fff; outline-offset: 1px; }
.stk-hint { font-size: 12px; opacity: 0.85; padding: 0 4px; }
.stk-place { position: absolute; pointer-events: auto; cursor: crosshair; background: rgb(255 255 255 / 0.04); outline: 1px dashed rgb(255 255 255 / 0.5); }
.stk-note { position: absolute; pointer-events: auto; max-width: 15em; min-width: 7em; padding: 6px 8px 5px; color: #222;
  border-radius: 2px 2px 8px 2px; box-shadow: 0 3px 10px rgb(0 0 0 / 0.45); transform: rotate(-1.2deg);
  transition: opacity 0.35s; white-space: pre-wrap; overflow-wrap: anywhere; }
.stk-note.mine { cursor: grab; }
.stk-note.picked { outline: 2px solid #fff; outline-offset: 2px; }
.stk-note.gone { opacity: 0; pointer-events: none; }
.stk-by { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; font-size: 0.82em; opacity: 0.75; }
.stk-x { border: none; background: none; padding: 0 0 0 4px; font: inherit; color: inherit; cursor: pointer; }
.stk-edit { position: absolute; pointer-events: auto; width: 15em; padding: 6px; border-radius: 3px; box-shadow: 0 3px 10px rgb(0 0 0 / 0.5); }
.stk-edit textarea { width: 100%; box-sizing: border-box; height: 5em; border: none; resize: none; background: transparent; color: #222; font: inherit; outline: none; }
.stk-edit .stk-by { opacity: 0.6; }
`;

const clockText = (s: number) => {
    const t = Math.floor(s),
        h = Math.floor(t / 3600),
        m = Math.floor((t % 3600) / 60),
        sec = String(t % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

const stickies: Start<View, never, Out> = (ctx, first) => {
    let view = first;
    let color = 0;
    let hidden = false;
    let picked: number | null = null; // a note of mine, chosen to recolour
    const root = document.createElement('div');
    root.className = 'stk';
    root.append(Object.assign(document.createElement('style'), { textContent: CSS }));
    ctx.layer.append(root);
    const notesEl = document.createElement('div');
    root.append(notesEl);

    // the bar: a note, its colour, hide, close
    const bar = document.createElement('div');
    bar.className = 'stk-bar';
    const add = Object.assign(document.createElement('button'), { textContent: '+ Note', title: 'Stick a note here (then click where)' });
    const swatches = PALETTE.map((p, i) => {
        const b = Object.assign(document.createElement('button'), { className: 'stk-sw', title: 'This colour (and a note of yours you picked)' });
        b.style.background = p;
        b.setAttribute('aria-label', `Colour ${i + 1}`);
        b.onclick = () => {
            color = i;
            if (picked != null) ctx.send({ kind: 'color', sid: picked, c: i });
            drawBar();
        };
        return b;
    });
    const hide = Object.assign(document.createElement('button'), { title: 'Hide the notes (for you)' });
    const hint = Object.assign(document.createElement('span'), { className: 'stk-hint' });
    const close = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Close Stickies for everyone (the notes are kept)' });
    bar.append(add, ...swatches, hide, hint, close);
    root.append(bar);
    hide.onclick = () => {
        hidden = !hidden;
        draw();
    };
    close.onclick = () => ctx.close();

    function drawBar() {
        swatches.forEach((b, i) => b.classList.toggle('on', i === color));
        hide.textContent = hidden ? 'Show' : 'Hide';
        const me = ctx.me().name;
        add.disabled = !view.on || !me;
        hint.textContent = !view.on ? 'Nothing playing' : !me ? 'Join the chat to sign notes' : '';
        hint.hidden = !hint.textContent;
    }

    // where a note is now: on this moment, or this page
    const showing = (n: Note) => {
        const now = ctx.now();
        if (view.paged) return now.page != null && n.page === now.page;
        return now.position != null && n.at != null && now.position >= n.at && now.position < n.at + SHOW_S;
    };

    const els = new Map<number, HTMLElement>();
    function place(el: HTMLElement, x: number, y: number) {
        const b = ctx.videoBox();
        el.style.left = `${b.x + x * b.w}px`;
        el.style.top = `${b.y + y * b.h}px`;
    }
    function draw() {
        drawBar();
        const b = ctx.videoBox();
        bar.style.left = `${b.x + 8}px`;
        bar.style.top = `${b.y + 8}px`;
        root.style.fontSize = `${Math.max(11, Math.min(16, b.w / 80))}px`;
        const me = ctx.me().name;
        const ids = new Set(view.notes.map((n) => n.id));
        for (const [id, el] of els)
            if (!ids.has(id)) {
                el.remove();
                els.delete(id);
            }
        for (const n of view.notes) {
            let el = els.get(n.id);
            if (!el) {
                el = document.createElement('div');
                el.className = 'stk-note gone';
                els.set(n.id, el);
                notesEl.append(el);
            }
            const key = `${n.text}|${n.c}|${n.by}|${me}`;
            if (el.dataset.key !== key) {
                el.dataset.key = key;
                el.style.background = PALETTE[n.c] || PALETTE[0]!;
                const sig = document.createElement('div');
                sig.className = 'stk-by';
                const where = view.paged ? `p. ${n.page}` : clockText(n.at || 0);
                sig.append(Object.assign(document.createElement('span'), { textContent: `— ${n.by}` }), Object.assign(document.createElement('span'), { textContent: where }));
                if (n.by === me) {
                    const x = Object.assign(document.createElement('button'), { className: 'stk-x', textContent: '✕', title: 'Take it off' });
                    x.onpointerdown = (e) => e.stopPropagation();
                    x.onclick = () => ctx.send({ kind: 'remove', sid: n.id });
                    sig.append(x);
                }
                el.replaceChildren(document.createTextNode(n.text), sig); // never innerHTML: notes are other people's
                el.classList.toggle('mine', n.by === me);
                el.title = new Date(n.when * 1000).toLocaleString();
                if (n.by === me) dragging(el, n);
            }
            el.classList.toggle('picked', picked === n.id);
            if (!el.dataset.dragging) place(el, n.x, n.y);
            el.classList.toggle('gone', hidden || !showing(n));
        }
    }

    // a note of mine: drag it to move it; a click picks it, for the colours
    function dragging(el: HTMLElement, n: Note) {
        el.onpointerdown = (e) => {
            if (e.button > 0) return;
            e.preventDefault();
            const b = ctx.videoBox(),
                r = el.getBoundingClientRect(),
                lr = ctx.layer.getBoundingClientRect();
            const dx = e.clientX - r.left,
                dy = e.clientY - r.top;
            let moved = false;
            el.setPointerCapture(e.pointerId);
            el.dataset.dragging = '1';
            const at = (ev: PointerEvent) => ({
                x: Math.min(1, Math.max(0, (ev.clientX - dx - lr.left - b.x) / b.w)),
                y: Math.min(1, Math.max(0, (ev.clientY - dy - lr.top - b.y) / b.h)),
            });
            el.onpointermove = (ev) => {
                moved = moved || Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 4;
                if (moved) place(el, at(ev).x, at(ev).y);
            };
            el.onpointerup = (ev) => {
                el.onpointermove = el.onpointerup = null;
                delete el.dataset.dragging;
                if (moved) ctx.send({ kind: 'move', sid: n.id, ...at(ev) });
                else picked = picked === n.id ? null : n.id;
                draw();
            };
        };
    }

    // + Note: click where, then write it; Enter sticks it, Escape doesn't
    let placing: HTMLElement | null = null,
        editing: HTMLElement | null = null;
    function stopWriting() {
        placing?.remove();
        editing?.remove();
        placing = editing = null;
    }
    add.onclick = () => {
        stopWriting();
        const b = ctx.videoBox();
        placing = document.createElement('div');
        placing.className = 'stk-place';
        Object.assign(placing.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
        placing.title = 'Click where the note goes (Escape: none)';
        root.insertBefore(placing, bar);
        placing.onpointerdown = (e) => {
            e.preventDefault();
            const lr = ctx.layer.getBoundingClientRect();
            const x = Math.min(0.95, Math.max(0, (e.clientX - lr.left - b.x) / b.w)),
                y = Math.min(0.95, Math.max(0, (e.clientY - lr.top - b.y) / b.h));
            const now = ctx.now(); // the moment, or the page, it was put at
            placing!.remove();
            placing = null;
            write(x, y, now.position, now.page);
        };
    };
    function write(x: number, y: number, at: number | null, page: number | null) {
        const box = (editing = document.createElement('div'));
        box.className = 'stk-edit';
        box.style.background = PALETTE[color]!;
        const ta = Object.assign(document.createElement('textarea'), { maxLength: TEXT_MAX, placeholder: 'Your note…' });
        const sig = document.createElement('div');
        sig.className = 'stk-by';
        sig.append(
            Object.assign(document.createElement('span'), { textContent: `— ${ctx.me().name}` }),
            Object.assign(document.createElement('span'), { textContent: view.paged ? `p. ${page ?? '?'}` : at != null ? clockText(at) : '' }),
        );
        box.append(ta, sig);
        root.append(box);
        place(box, x, y);
        ta.focus();
        ta.onkeydown = (e) => {
            e.stopPropagation(); // the page's own keys (the document's arrows) leave it alone
            if (e.key === 'Escape') stopWriting();
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = ta.value.trim();
                if (text && (view.paged ? page != null : at != null)) {
                    ctx.send(view.paged ? { kind: 'add', text, c: color, x, y, page: page! } : { kind: 'add', text, c: color, x, y, at: at! });
                }
                stopWriting();
            }
        };
        ta.onblur = () => setTimeout(() => editing === box && !ta.value.trim() && stopWriting(), 150);
    }
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && placing) stopWriting();
    };
    document.addEventListener('keydown', onKey);

    // the moment moves on, and pages turn: what shows changes without a word from the host
    const timer = setInterval(draw, 250);
    draw();
    return {
        view(v) {
            if (v.key !== view.key) {
                stopWriting();
                picked = null;
            }
            view = v;
            draw();
        },
        resize: draw,
        stop() {
            clearInterval(timer);
            document.removeEventListener('keydown', onKey);
            root.remove();
        },
    };
};
export default stickies;
