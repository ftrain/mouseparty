// What every app's script shares (apps/lib.go is the host's half): a box to draw
// in, the lobby, scores, countdowns, text boxes that survive redraws, buttons,
// little notes, and drawing (Graffiti and Sketch). Wireframe on purpose.
//
// An app script sets TubeYap.apps[name] = (ctx, view) => ({view, message, said,
// resize, stop}), any of them. L.mount does most of that: give it a render(view)
// that returns elements, and it redraws on every new view.
(() => {
    const L = TubeYap.lib = {};

    const css = `
.ty { position: absolute; background: #fff; color: #000; font: 14px/1.4 ui-monospace, Menlo, monospace;
      border: 1px solid #000; padding: 10px; box-sizing: border-box; overflow: auto; }
.ty.cover { inset: 0; border: 0; padding: 16px; }
.ty.tl { left: 8px; top: 8px; max-width: min(360px, 60%); max-height: calc(100% - 60px); }
.ty.tr { right: 8px; top: 8px; max-width: min(360px, 60%); max-height: calc(100% - 60px); }
.ty.tc { left: 50%; top: 8px; transform: translateX(-50%); max-width: 90%; text-align: center; }
.ty h2 { font-size: 16px; margin: 0 0 8px; }
.ty h3 { font-size: 14px; margin: 10px 0 4px; }
.ty p { margin: 4px 0; }
.ty button { font: inherit; background: #fff; color: #000; border: 1px solid #000; padding: 2px 8px; margin: 2px; cursor: pointer; }
.ty button:disabled { color: #999; border-color: #ccc; cursor: default; }
.ty button.on { background: #000; color: #fff; }
.ty input { font: inherit; border: 1px solid #000; padding: 2px 6px; margin: 2px; }
.ty table { border-collapse: collapse; }
.ty td { padding: 1px 8px 1px 0; }
.ty .muted { color: #777; }
.ty .note { position: sticky; top: 0; background: #000; color: #fff; padding: 2px 8px; margin: -4px 0 6px; }
.ty .cols { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
.ty .grid { display: grid; gap: 4px; }
.ty .cell { border: 1px solid #000; display: flex; align-items: center; justify-content: center; text-align: center;
            overflow: hidden; }
.ty-timer { font-variant-numeric: tabular-nums; }`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // h('div', {class: 'x', on: {click}}, 'text', child, [more]) -> an element
    L.h = (tag, props, ...kids) => {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(props || {})) {
            if (v === undefined || v === null || v === false) continue;
            if (k === 'on') for (const [e, f] of Object.entries(v)) el.addEventListener(e, f);
            else if (k === 'style') el.style.cssText = v;
            else if (k === 'class') el.className = v;
            else if (k in el && typeof v !== 'string') el[k] = v;
            else el.setAttribute(k, v === true ? '' : v);
        }
        for (const kid of kids.flat(Infinity)) {
            if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
        }
        return el;
    };
    const h = L.h;

    // mount: a box in the app layer ('cover', or a corner: 'tl', 'tr', 'tc'), redrawn
    // by render(view, kit) on each view; kit.send talks to the host's half
    L.mount = (ctx, place, render) => {
        const box = h('div', { class: `ty ${place}` });
        ctx.layer.append(box);
        const kept = new Map();
        const kit = {
            send: ctx.send,
            me: ctx.me,
            // keep: the same element across redraws (a text box keeps what's typed, and focus)
            keep: (key, make) => { if (!kept.has(key)) kept.set(key, make()); return kept.get(key); },
            note: (text) => {
                const n = h('div', { class: 'note' }, text);
                box.prepend(n);
                setTimeout(() => n.remove(), 2500);
            },
        };
        let last = null;
        const draw = (v) => {
            last = v;
            const focused = document.activeElement;
            box.replaceChildren(...[render(v, kit)].flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
            if (focused && box.contains(focused)) focused.focus();
        };
        return { box, kit, draw, redraw: () => last && draw(last) };
    };

    // timer: a countdown from seconds left; one ticker updates them all
    L.timer = (left) => h('span', { class: 'ty-timer', 'data-until': Date.now() + left * 1000 }, clock(left));
    const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    setInterval(() => {
        for (const el of document.querySelectorAll('.ty-timer')) {
            el.textContent = clock(Math.max(0, (Number(el.dataset.until) - Date.now()) / 1000));
        }
    }, 500);

    L.button = (text, onclick, opts = {}) => h('button', { on: { click: onclick }, disabled: !!opts.disabled, class: opts.on ? 'on' : '' }, text);

    // input: a text box (kept across redraws) that sends on Enter and empties itself
    L.input = (kit, key, placeholder, onSubmit, opts = {}) => kit.keep(key, () => {
        const el = h('input', { placeholder, maxlength: opts.max || 40, size: opts.size || 20, autocomplete: 'off' });
        el.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && el.value.trim()) { onSubmit(el.value.trim()); el.value = ''; }
        });
        return el;
    });

    // field: a text box (kept across redraws) read when something else is pressed
    L.field = (kit, key, placeholder, opts = {}) => kit.keep(key, () => {
        const el = h('input', { placeholder, maxlength: opts.max || 40, size: opts.size || 20, autocomplete: 'off' });
        el.addEventListener('keydown', (e) => e.stopPropagation());
        return el;
    });

    // board: the scores
    L.board = (players, title = 'Scores') => players && players.length
        ? h('div', {}, h('h3', {}, title), h('table', {}, players.map((p) => h('tr', {}, h('td', {}, p.name), h('td', {}, p.score)))))
        : null;

    // lobby: who's in, join/leave/start, and the countdown to starting
    L.lobby = (lb, kit, title, rules) => {
        const n = lb.players.length, short = Math.max(0, lb.min - n);
        const big = 'font-size:20px;padding:10px 28px;margin:12px 0';
        return h('div', { style: 'max-width:560px;margin:8vh auto 0;text-align:center' },
            h('h2', { style: 'font-size:28px' }, title),
            h('p', {}, rules),
            !lb.named ? h('p', { style: 'font-size:18px;margin:20px 0' }, 'Type your name in the chat to play.')
                : lb.in ? h('div', {},
                    h('p', { style: 'font-size:18px' }, "You're in."),
                    L.button('Start now', () => kit.send({ kind: 'start' }), { disabled: short > 0 }), ' ',
                    L.button('Leave', () => kit.send({ kind: 'leave' })))
                    : lb.max && n >= lb.max ? h('p', {}, 'The game is full; you can watch.')
                        : h('button', { style: big, class: 'on', on: { click: () => kit.send({ kind: 'join' }) } }, `Join ${title}`),
            h('h3', {}, n ? `Playing: ${lb.players.map((p) => p.name).join(', ')}` : 'Nobody has joined yet.'),
            h('p', { class: 'muted' }, lb.left > 0 ? ['Starting in ', L.timer(lb.left), ' (or press Start now)']
                : short ? `Waiting for ${short} more player${short === 1 ? '' : 's'}${lb.max ? ` (up to ${lb.max})` : ''}.` : ''));
    };

    // ---------- drawing (Graffiti, Sketch) ----------
    // Lines are in the 16:9 picture's 0-1 coordinates (ctx.videoBox), so they
    // land in the same place for everyone. Strokes go to the host in pieces.
    L.COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#000000'];
    const WIDTHS = [3, 8, 20];   // in a 720-line picture; scaled with it
    L.sketch = (ctx, lines, opts = {}) => {
        const canvas = h('canvas');
        const bar = h('div', { class: 'ty tl', style: 'display:flex;gap:2px;padding:4px;flex-wrap:wrap' });
        let color = opts.color ?? Math.floor(Math.random() * 4), width = 1;
        L.COLORS.forEach((c, i) => bar.append(h('button', { style: `background:${c};width:22px;height:22px;padding:0`, on: { click: () => { color = i; } } })));
        ['thin', 'mid', 'fat'].forEach((w, i) => bar.append(L.button(w, () => { width = i; })));
        if (opts.clear) bar.append(L.button('clear', opts.clear));
        ctx.layer.append(canvas, bar);
        const g = canvas.getContext('2d');
        let box = ctx.videoBox(), all = lines.slice();

        const draw = (l) => {
            g.strokeStyle = L.COLORS[l.c];
            g.lineWidth = WIDTHS[l.w] * box.h / 720;
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
            if (opts.paper) { g.fillStyle = '#fff'; g.fillRect(box.x, box.y, box.w, box.h); g.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1); }
            all.forEach(draw);
        };

        let pending = null, timer = null;
        const at = (e) => {
            const r = canvas.getBoundingClientRect();
            const clamp = (v) => Math.round(Math.min(Math.max(v, 0), 1) * 10000) / 10000;
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
        canvas.onpointerup = canvas.onpointercancel = () => { flush(); clearInterval(timer); pending = null; };
        resize();
        return {
            canvas, bar,
            line(l) { all.push(l); draw(l); },
            clear() { all = []; resize(); },
            resize,
            stop() { clearInterval(timer); },
            showTools(on) { bar.style.display = on ? 'flex' : 'none'; },
        };
    };
})();
