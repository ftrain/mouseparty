// Documents (apps/office.go): a Tiny Little Office document everyone edits at
// once, drawn by the library's own editors (office/editors.js, built by
// scripts/vendor_office.sh), with its kernel (office/doc.js) to carry one
// person's changes over another's.
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
(() => {
    const office = OpenHouseParty.office = OpenHouseParty.office || {};

    // the library, once for the page: the editors, their stylesheet, the kernel
    office.load = (base) => office.loading = office.loading || (async () => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = `${base}/office/editors.css`;
        document.head.appendChild(css);
        const [editors, kernel] = await Promise.all([import(`${base}/office/editors.js`), import(`${base}/office/doc.js`)]);
        // where pictures live: the host's, never the web's (the library's docs/library.md, Images)
        const grabbed = new Map();   // a frame already kept, by its file's stamp: put again, it's the same picture
        Object.assign(editors.host, {
            link: () => '',          // a document opens nowhere else: it's here, for everyone
            read: () => null,
            images: {
                maxBytes: 10 * 1024 * 1024,
                url: (ref) => `${base}/img/${encodeURIComponent(String(ref).replace(/^asset:/, ''))}`,
                bytes: async (ref) => new Uint8Array(await (await fetch(editors.host.images.url(ref))).arrayBuffer()),
                put: async (file) => {
                    const kept = grabbed.get(file.lastModified);
                    if (kept && file.size === kept.size) return kept.pic;
                    const r = await fetch(`${base}/img`, { method: 'POST', body: file });
                    if (!r.ok) throw new Error(await r.text());
                    const p = await r.json();
                    return { ref: p.ref, w: p.w || undefined, h: p.h || undefined };
                },
            },
        });
        office.grabbed = grabbed;
        return { editors, kernel };
    })();

    // the window around an editor (and the reel's, with a bar of its own)
    office.css = (h) => {
        if (document.getElementById('office-css')) return;
        document.head.append(h('style', { id: 'office-css' }, `
.office { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--to-paper, #fff); }
.office-bar { display: flex; gap: 6px; align-items: center; padding: 4px 8px; font: 12px/1.2 ui-monospace, Menlo, monospace;
              background: #111; color: #ccc; flex: none; }
.office-bar button { font: inherit; color: #fff; background: #333; border: 1px solid #555; border-radius: 3px; padding: 3px 8px; cursor: pointer; }
.office-page { position: relative; flex: 1; min-height: 0; overflow: auto; }
.office-page > .to-editor { min-height: 100%; }
.office-page to-bar { flex-wrap: wrap; overflow: visible; height: auto; }   /* a window is narrower than the page the bar measures */`));
    };

    const clock = (s) => {
        const t = Math.floor(s), hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = String(t % 60).padStart(2, '0');
        return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
    };
    const newClient = () => Math.random().toString(36).slice(2, 10);
    // the kinds a frame can go into, as a picture where the caret is (or at the end)
    const TAKES_PICTURES = new Set(['write', 'deck', 'pinboard']);
    // Lucide's camera, as the library's icons are given (lucide 1.54, ISC)
    const CAMERA = [['path', { d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z' }],
        ['circle', { cx: '12', cy: '13', r: '3' }]];

    OpenHouseParty.apps.office = (ctx, view) => {
        const h = OpenHouseParty.lib.h;
        const box = h('div', { class: 'office' });
        const page = h('div', { class: 'office-page' });
        box.append(page);
        ctx.layer.append(box);
        office.css(h);

        let lib = null, mounted = null, stopped = false;
        let app = view.app, doc = null, seq = 0, pending = [], inflight = null, client = newClient(), n = 0;
        const say = (text) => lib && lib.editors.toast(text);

        // the document as every page takes an edit: null where its ops don't apply, or leave what the text wouldn't keep
        const applied = (d, ops) => {
            try {
                const next = lib.kernel.applyAll(d, ops);
                lib.kernel.keptDoc(next);
                return next;
            } catch (e) {
                return null;
            }
        };
        // the host's document: the text it wrote down, and the edits since
        const load = (state) => {
            const K = lib.kernel;
            let d = K.parse(state.text || '');
            for (const e of state.edits || []) d = applied(d, e.ops) || d;
            doc = d;
            seq = state.seq;
            pending = [];
            inflight = null;
            client = newClient();
        };
        const shown = () => lib.kernel.write(lib.kernel.applyAll(doc, pending));

        const flush = () => {
            if (inflight || !pending.length || stopped) return;
            const ops = pending.slice();
            if (!applied(doc, ops)) return sync();
            inflight = { eid: `${client}:${++n}`, count: ops.length };
            ctx.send({ kind: 'edit', base: seq, eid: inflight.eid, ops });
        };
        const sync = () => { inflight = null; ctx.send({ kind: 'sync' }); };
        const changed = (ops) => {
            if (!ops.length) return;
            pending = pending.concat(ops);
            flush();
        };

        // the camera in the editor's own bar (the library's "a page's own commands"), for the kinds that take pictures
        let grabbing = false;
        const grabCommand = () => lib.editors.command({
            id: 'host.grab', scope: 'host', where: ['bar'], icon: CAMERA,
            label: () => 'Grab frame', hint: () => 'Put the frame on screen now into the document',
            disabled: () => grabbing, does: () => grab(),
        });
        const mount = async () => {
            page.textContent = '';
            const commands = TAKES_PICTURES.has(app) ? [grabCommand()] : [];
            mounted = await lib.editors.mount(app, lib.kernel.write(doc), page, () => {}, { onOps: changed, fill: true, commands, context: {} });
        };

        // a picture into the document: as if it were pasted where the caret is; where the editor takes no paste, at the end
        const putPicture = async (file) => {
            const editor = mounted.editor;
            const heard = { n: 0 };
            const count = () => heard.n++;
            editor.addEventListener('docops', count);
            const dt = new DataTransfer();
            dt.items.add(file);
            const target = editor.contains(document.activeElement) ? document.activeElement : (editor.querySelector('[contenteditable]') || editor);
            try { target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true })); } catch (e) {}
            await new Promise((r) => setTimeout(r, 1200));
            editor.removeEventListener('docops', count);
            if (heard.n || stopped) return;
            const pic = await lib.editors.host.images.put(file);
            const K = lib.kernel, now = K.applyAll(doc, pending);
            const op = { op: 'splice', at: now.blocks.length, n: 0, blocks: [K.imageBlock(pic.ref, file.name.replace(/\.\w+$/, ''), pic.w, pic.h)] };
            mounted.applyRemote([op]);
            changed([op]);
        };
        const grab = async () => {
            if (grabbing) return;
            grabbing = true;
            try {
                const r = await fetch(`${ctx.base}/grab`, { method: 'POST' });
                if (!r.ok) { say(r.status === 409 ? 'No movie is playing' : 'No frame'); return; }
                const pic = await r.json();
                const blob = await (await fetch(lib.editors.host.images.url(pic.ref))).blob();
                const stamp = Date.now();
                const name = `${pic.title ? pic.title + ', ' : ''}${clock(pic.at)}`;
                const file = new File([blob], `${name}.png`, { type: 'image/png', lastModified: stamp });
                office.grabbed.set(stamp, { size: blob.size, pic: { ref: pic.ref, w: pic.w, h: pic.h } });
                await putPicture(file);
                say(`Frame at ${clock(pic.at)}`);
            } finally {
                grabbing = false;
            }
        };

        (async () => {
            lib = await office.load(ctx.base);
            if (stopped) return;
            load(view);
            const seed = OpenHouseParty.seed;   // a copy someone asked for on this page (the reel's "Make it slides")
            if (seed && seed.name === app && view.seq === 0 && !view.text) {
                OpenHouseParty.seed = null;
                ctx.send({ kind: 'seed', text: seed.text });
            }
            await mount();
        })();

        return {
            view(v) {
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
                    const next = applied(doc, m.ops);
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
                            const [mine, passed] = lib.kernel.cross(pending, m.ops);
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
                    if (inflight && m.eid === inflight.eid) { inflight = null; flush(); }
                } else if (m.kind === 'refused') {
                    say('That change could not be shared');
                    sync();
                } else if (m.kind === 'state') {
                    load(m.state);
                    mounted.editor.value = lib.kernel.write(doc);
                }
            },
            stop() { stopped = true; },
        };
    };
})();
