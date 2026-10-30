// What every app's script shares (apps/lib.go is the host's half): a box in its
// window to draw in (ctx.layer, the window's inside), the lobby, scores, countdowns, text boxes that survive redraws, buttons,
// little notes, confetti, and drawing (Graffiti and Sketch). Glass over the movie: light
// text on the window's tint (--glass, each viewer's slider), everything in em of
// a type size that follows the window's (cqmin), so a game grows with its window.
//
// An app script's default export is a Start (../types.ts): (ctx, view) => ({view,
// message, said, resize, stop}), any of them. mount does most of that: give it a
// render(view) that returns elements, and it redraws on every new view.
import type { AppMsg, Ctx, Said } from '../types.ts';

const css = `
.ty { --pink: #ff5fa2; --violet: #a78bfa; --cyan: #3ee0ff; --yellow: #ffd23f; --lime: #7cf27a;
      position: absolute; color: #fff; box-sizing: border-box; overflow: auto; padding: 0.8em;
      font: 600 clamp(12px, 2.4cqmin, 28px)/1.35 ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, sans-serif;
      text-shadow: 0 1px 3px rgb(0 0 0 / 0.55); }
.ty.cover { inset: 0; padding: 1em 1.2em; }
.ty.tl, .ty.tr, .ty.tc { background: rgb(18 14 32 / calc(0.3 + var(--glass, 0.6) * 0.55)); border: 1px solid rgb(255 255 255 / 0.16);
      border-radius: 0.8em; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.ty.tl { left: 0.6em; top: 0.6em; max-width: min(24em, 60%); max-height: calc(100% - 4em); }
.ty.tr { right: 0.6em; top: 0.6em; max-width: min(24em, 60%); max-height: calc(100% - 4em); }
.ty.tc { left: 50%; top: 0.6em; transform: translateX(-50%); max-width: 90%; text-align: center; }
.ty h2 { font-size: 1.6em; font-weight: 800; letter-spacing: -0.01em; margin: 0 0 0.35em; text-shadow: none;
         background: linear-gradient(90deg, var(--pink), var(--yellow)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.ty h3 { font-size: 0.78em; margin: 0.9em 0 0.3em; color: var(--cyan); text-transform: uppercase; letter-spacing: 0.08em; }
.ty p { margin: 0.3em 0; }
.ty b { color: var(--yellow); }
.ty button { font: inherit; color: #fff; background: rgb(255 255 255 / 0.12); border: 1px solid rgb(255 255 255 / 0.28);
             border-radius: 999px; padding: 0.3em 0.95em; margin: 0.15em; cursor: pointer; text-shadow: inherit;
             transition: transform 0.1s, background 0.15s, box-shadow 0.15s; }
.ty button:hover:not(:disabled) { background: rgb(255 255 255 / 0.24); transform: translateY(-1px); }
.ty button:active:not(:disabled) { transform: scale(0.95); }
.ty button.on { background: linear-gradient(135deg, var(--pink), var(--violet)); border-color: transparent; box-shadow: 0 0 0.9em rgb(255 95 162 / 0.55); }
.ty button:disabled { opacity: 0.4; cursor: default; }
.ty input { font: inherit; color: #fff; background: rgb(0 0 0 / 0.35); border: 1px solid rgb(255 255 255 / 0.3); border-radius: 0.55em;
            padding: 0.3em 0.6em; margin: 0.15em; outline: none; max-width: 100%; box-sizing: border-box; }
.ty input:focus { border-color: var(--cyan); box-shadow: 0 0 0 2px rgb(62 224 255 / 0.35); }
.ty input::placeholder { color: rgb(255 255 255 / 0.5); }
.ty table { border-collapse: collapse; }
.ty td { padding: 0.1em 0.8em 0.1em 0; }
.ty tr:first-child td { color: var(--yellow); }
.ty .muted { color: rgb(255 255 255 / 0.62); font-weight: 500; }
.ty .note { position: sticky; top: 0; z-index: 5; display: table; margin: 0 auto 0.5em; padding: 0.3em 1em; border-radius: 999px;
            background: linear-gradient(90deg, var(--pink), var(--violet)); color: #fff; animation: ty-pop 0.35s cubic-bezier(.3, 1.6, .5, 1); }
.ty .cols { display: flex; gap: 1.5em; flex-wrap: wrap; align-items: flex-start; }
.ty .grid { display: grid; gap: 0.3em; }
.ty .cell { background: rgb(255 255 255 / 0.1); border: 1px solid rgb(255 255 255 / 0.22); border-radius: 0.45em; display: flex;
            align-items: center; justify-content: center; text-align: center; overflow: hidden; transition: background 0.2s, transform 0.15s; }
.ty .cell.lit { background: linear-gradient(135deg, var(--pink), var(--violet)); border-color: transparent; transform: scale(1.04);
                box-shadow: 0 0 0.8em rgb(255 95 162 / 0.45); }
.ty-timer { font-variant-numeric: tabular-nums; color: var(--cyan); }
@keyframes ty-pop { from { transform: scale(0.6); opacity: 0; } }
.ty-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 50; }
.ty-confetti i { position: absolute; top: -4%; width: 0.6em; height: 0.9em; border-radius: 2px; animation: ty-fall var(--t) cubic-bezier(.2, .6, .4, 1) forwards; }
@keyframes ty-fall { to { transform: translate(var(--dx), 115cqh) rotate(var(--r)); opacity: 0.2; } }`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

// what h takes as children: false, null and undefined are left out, arrays are flattened
export type Kid = Node | string | number | boolean | null | undefined | Kid[];
type Leaf = Exclude<Kid, Kid[]>;
const leaves = (kids: Kid[]) => (kids as unknown[]).flat(Infinity) as Leaf[];

// an element's attributes and properties: on is its listeners, style its CSS text
export interface Props {
    on?: Record<string, (e: Event) => void>;
    style?: string;
    class?: string;
    [attr: string]: unknown;
}

// h('div', {class: 'x', on: {click}}, 'text', child, [more]) -> an element
export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...kids: Kid[]): HTMLElementTagNameMap[K] => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'on') for (const [e, f] of Object.entries(v as Props['on'] & object)) el.addEventListener(e, f);
        else if (k === 'style') el.style.cssText = v as string;
        else if (k === 'class') el.className = v as string;
        else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of leaves(kids)) {
        if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
};

// what a mounted box's render is given: kit.send talks to the host's half
export interface Kit<Out extends Said = AppMsg> {
    send(m: Out): void;
    me: Ctx['me'];
    // keep: the same element across redraws (a text box keeps what's typed, and focus)
    keep<T extends HTMLElement = HTMLInputElement>(key: string, make?: () => T): T;
    note(text: string): void;
}

// mount: a box in the app's window ('cover' fills it; or a corner: 'tl', 'tr', 'tc'), redrawn
// by render(view, kit) on each view; kit.send talks to the host's half
export const mount = <V, Out extends Said = AppMsg>(ctx: Ctx<Out>, place: 'cover' | 'tl' | 'tr' | 'tc', render: (v: V, kit: Kit<Out>) => Kid) => {
    const box = h('div', { class: `ty ${place}` });
    ctx.layer.append(box);
    const kept = new Map<string, HTMLElement>();
    const kit: Kit<Out> = {
        send: ctx.send,
        me: ctx.me,
        keep: <T extends HTMLElement>(key: string, make?: () => T) => {
            if (!kept.has(key)) kept.set(key, make!());
            return kept.get(key) as T;
        },
        note: (text) => {
            const n = h('div', { class: 'note' }, text);
            box.prepend(n);
            setTimeout(() => n.remove(), 2500);
        },
    };
    let last: V | null = null;
    const draw = (v: V) => {
        last = v;
        const focused = document.activeElement as HTMLElement | null;
        box.replaceChildren(
            ...leaves([render(v, kit)])
                .filter((k) => k !== null && k !== undefined && k !== false)
                .map((k) => (k instanceof Node ? k : String(k))),
        );
        if (focused && box.contains(focused)) focused.focus();
    };
    return { box, kit, draw, redraw: () => last && draw(last) };
};

// timer: a countdown from seconds left; one ticker updates them all
export const timer = (left: number) => h('span', { class: 'ty-timer', 'data-until': Date.now() + left * 1000 }, clock(left));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
setInterval(() => {
    for (const el of document.querySelectorAll<HTMLElement>('.ty-timer')) {
        el.textContent = clock(Math.max(0, (Number(el.dataset.until) - Date.now()) / 1000));
    }
}, 500);

// confetti: a burst over the app's window, for a win (n pieces; a few for a small one)
export const confetti = (ctx: Ctx, n = 80) => {
    const box = h('div', { class: 'ty ty-confetti' });
    const colors = ['#ff5fa2', '#ffd23f', '#7cf27a', '#3ee0ff', '#a78bfa', '#fff'];
    for (let i = 0; i < n; i++) {
        box.append(
            h('i', {
                style:
                    `left:${Math.random() * 100}%;background:${colors[i % colors.length]};--t:${1.2 + Math.random() * 1.4}s;` +
                    `--dx:${(Math.random() - 0.5) * 30}cqw;--r:${Math.random() * 1080 - 540}deg;animation-delay:${Math.random() * 0.3}s`,
            }),
        );
    }
    ctx.layer.append(box);
    setTimeout(() => box.remove(), 3200);
};

export const button = (text: Kid, onclick: (e: Event) => void, opts: { disabled?: boolean; on?: boolean } = {}) =>
    h('button', { on: { click: onclick }, disabled: !!opts.disabled, class: opts.on ? 'on' : '' }, text);

// input: a text box (kept across redraws) that sends on Enter and empties itself
export const input = (kit: Kit<Said>, key: string, placeholder: string, onSubmit: (text: string) => void, opts: { max?: number; size?: number } = {}) =>
    kit.keep(key, () => {
        const el = h('input', { placeholder, maxlength: opts.max || 40, size: opts.size || 20, autocomplete: 'off' });
        el.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && el.value.trim()) {
                onSubmit(el.value.trim());
                el.value = '';
            }
        });
        return el;
    });

// field: a text box (kept across redraws) read when something else is pressed
export const field = (kit: Kit<Said>, key: string, placeholder: string, opts: { max?: number; size?: number } = {}) =>
    kit.keep(key, () => {
        const el = h('input', { placeholder, maxlength: opts.max || 40, size: opts.size || 20, autocomplete: 'off' });
        el.addEventListener('keydown', (e) => e.stopPropagation());
        return el;
    });

// someone playing, and their score (apps/lib.go Player)
export interface Player {
    id: number;
    name: string;
    score: number;
}

// board: the scores
export const board = (players: Player[] | null | undefined, title = 'Scores') =>
    players && players.length
        ? h(
              'div',
              {},
              h('h3', {}, title),
              h(
                  'table',
                  {},
                  players.map((p) => h('tr', {}, h('td', {}, p.name), h('td', {}, p.score))),
              ),
          )
        : null;

// a lobby as this viewer sees it (apps/lib.go Lobby.View), and what it's told
export interface Lobby {
    players: Player[];
    min: number;
    max: number; // 0: no limit
    left: number; // seconds to starting, once enough are in
    in: boolean;
    named: boolean;
}
export type LobbyMsg = { kind: 'join' } | { kind: 'leave' } | { kind: 'start' };

// lobby: who's in, join/leave/start, and the countdown to starting
export const lobby = (lb: Lobby, kit: Kit<LobbyMsg>, title: string, rules: string) => {
    const n = lb.players.length,
        short = Math.max(0, lb.min - n);
    const big = 'font-size:1.35em;padding:0.5em 1.6em;margin:0.6em 0';
    return h(
        'div',
        { style: 'max-width:32em;margin:6cqh auto 0;text-align:center' },
        h('h2', { style: 'font-size:2.4em' }, title),
        h('p', {}, rules),
        !lb.named
            ? h('p', { style: 'font-size:1.2em;margin:1em 0' }, 'Type your name in the chat to play.')
            : lb.in
              ? h(
                    'div',
                    {},
                    h('p', { style: 'font-size:1.2em' }, "You're in."),
                    button('Start now', () => kit.send({ kind: 'start' }), { disabled: short > 0 }),
                    ' ',
                    button('Leave', () => kit.send({ kind: 'leave' })),
                )
              : lb.max && n >= lb.max
                ? h('p', {}, 'The game is full; you can watch.')
                : h('button', { style: big, class: 'on', on: { click: () => kit.send({ kind: 'join' }) } }, `Join ${title}`),
        h('h3', {}, n ? `Playing: ${lb.players.map((p) => p.name).join(', ')}` : 'Nobody has joined yet.'),
        h(
            'p',
            { class: 'muted' },
            lb.left > 0 ? ['Starting in ', timer(lb.left), ' (or press Start now)'] : short ? `Waiting for ${short} more player${short === 1 ? '' : 's'}${lb.max ? ` (up to ${lb.max})` : ''}.` : '',
        ),
    );
};

// ---------- drawing (Graffiti, Sketch) ----------
// Lines are in the 16:9 picture's 0-1 coordinates (ctx.videoBox), so they
// land in the same place for everyone. Strokes go to the host in pieces.
export const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#000000'];
const WIDTHS = [3, 8, 20]; // in a 720-line picture; scaled with it

// a line (apps/graffiti.go Stroke): its colour and width by number, its points
export interface Stroke {
    c: number;
    w: number;
    p: [number, number][];
}
export type StrokeMsg = { kind: 'line' } & Stroke;

export const sketch = (ctx: Ctx<StrokeMsg>, lines: Stroke[], opts: { color?: number; paper?: boolean; canDraw?: () => boolean; clear?: () => void } = {}) => {
    const canvas = h('canvas');
    const bar = h('div', { class: 'ty tl', style: 'display:flex;gap:0.15em;padding:0.3em;flex-wrap:wrap;align-items:center' });
    let color = opts.color ?? Math.floor(Math.random() * 4),
        width = 1;
    const pick = (group: string, el: EventTarget | null) => {
        for (const b of bar.querySelectorAll(`[data-g="${group}"]`)) b.classList.toggle('on', b === el);
    };
    COLORS.forEach((c, i) =>
        bar.append(
            h('button', {
                'data-g': 'c',
                class: i === color ? 'on' : '',
                style: `background:${c};width:1.6em;height:1.6em;padding:0`,
                on: {
                    click: (e) => {
                        color = i;
                        pick('c', e.currentTarget);
                    },
                },
            }),
        ),
    );
    ['thin', 'mid', 'fat'].forEach((w, i) =>
        bar.append(
            h(
                'button',
                {
                    'data-g': 'w',
                    class: i === width ? 'on' : '',
                    on: {
                        click: (e) => {
                            width = i;
                            pick('w', e.currentTarget);
                        },
                    },
                },
                w,
            ),
        ),
    );
    if (opts.clear) bar.append(button('clear', opts.clear));
    ctx.layer.append(canvas, bar);
    const g = canvas.getContext('2d')!;
    let box = ctx.videoBox(),
        all = lines.slice();

    const draw = (l: Stroke) => {
        g.strokeStyle = COLORS[l.c];
        g.lineWidth = (WIDTHS[l.w] * box.h) / 720;
        g.lineCap = g.lineJoin = 'round';
        g.beginPath();
        l.p.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, box.x + x * box.w, box.y + y * box.h));
        g.stroke();
    };
    const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = ctx.layer.clientWidth * dpr;
        canvas.height = ctx.layer.clientHeight * dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        box = ctx.videoBox();
        g.clearRect(0, 0, canvas.width, canvas.height);
        if (opts.paper) {
            // as solid as the window: never so faint the drawing is lost
            const glass = Number(getComputedStyle(ctx.layer).getPropertyValue('--glass')) || 0.6;
            g.fillStyle = `rgba(255,255,255,${Math.max(0.35, glass)})`;
            g.fillRect(box.x, box.y, box.w, box.h);
        }
        all.forEach(draw);
    };

    let pending: [number, number][] | null = null,
        timer: ReturnType<typeof setInterval> | undefined;
    const at = (e: PointerEvent): [number, number] => {
        const r = canvas.getBoundingClientRect();
        const clamp = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 10000) / 10000;
        return [clamp((e.clientX - r.left - box.x) / box.w), clamp((e.clientY - r.top - box.y) / box.h)];
    };
    const flush = () => {
        if (pending && pending.length > 1) {
            ctx.send({ kind: 'line', c: color, w: width, p: pending });
            pending = [pending[pending.length - 1]];
        }
    };
    const can = () => !opts.canDraw || opts.canDraw();
    canvas.onpointerdown = (e) => {
        if (!can()) return;
        canvas.setPointerCapture(e.pointerId);
        pending = [at(e)];
        timer = setInterval(flush, 60);
    };
    canvas.onpointermove = (e) => {
        if (!pending) return;
        const p = at(e);
        draw({ c: color, w: width, p: [pending[pending.length - 1], p] });
        pending.push(p);
        if (pending.length >= 60) flush();
    };
    canvas.onpointerup = canvas.onpointercancel = () => {
        flush();
        clearInterval(timer);
        pending = null;
    };
    resize();
    return {
        canvas,
        bar,
        line(l: Stroke) {
            all.push(l);
            draw(l);
        },
        clear() {
            all = [];
            resize();
        },
        resize,
        stop() {
            clearInterval(timer);
        },
        showTools(on: boolean) {
            bar.style.display = on ? 'flex' : 'none';
        },
    };
};
