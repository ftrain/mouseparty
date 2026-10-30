// Built from web/viewer/apps/office.ts by `npm run build` (vite.config.ts): change it there.
import { h } from "./lib.js";
let loading = null;
const grabbed = /* @__PURE__ */ new Map();
const library = (base) => loading = loading || (async () => {
	const css = document.createElement("link");
	css.rel = "stylesheet";
	css.href = `${base}/office/editors.css`;
	document.head.appendChild(css);
	const [editors, kernel] = await Promise.all([import(
		/* @vite-ignore */
		`${base}/office/editors.js`
), import(
		/* @vite-ignore */
		`${base}/office/doc.js`
)]);
	const images = {
		maxBytes: 10485760,
		url: (ref) => `${base}/img/${encodeURIComponent(String(ref).replace(/^asset:/, ""))}`,
		bytes: async (ref) => new Uint8Array(await (await fetch(images.url(ref))).arrayBuffer()),
		put: async (file) => {
			const kept = grabbed.get(file.lastModified);
			if (kept && file.size === kept.size) return kept.pic;
			const r = await fetch(`${base}/img`, {
				method: "POST",
				body: file
			});
			if (!r.ok) throw new Error(await r.text());
			const p = await r.json();
			return {
				ref: p.ref,
				w: p.w || void 0,
				h: p.h || void 0
			};
		}
	};
	Object.assign(editors.host, {
		link: () => "",
		read: () => null,
		images
	});
	editors.setTheme("dark");
	return {
		editors,
		kernel
	};
})();
const css = () => {
	if (document.getElementById("office-css")) return;
	document.head.append(h("style", { id: "office-css" }, `
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
.office-page to-bar { flex-wrap: wrap; overflow: visible; height: auto; }   /* a window is narrower than the page the bar measures */`));
};
let seed = null;
const seedNext = (name, text) => {
	seed = {
		name,
		text
	};
};
const clock = (s) => {
	const t = Math.floor(s), hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = String(t % 60).padStart(2, "0");
	return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};
const newClient = () => Math.random().toString(36).slice(2, 10);
const TAKES_PICTURES = /* @__PURE__ */ new Set([
	"write",
	"deck",
	"pinboard"
]);
const APPENDS_PICTURES = /* @__PURE__ */ new Set(["write", "deck"]);
const CAMERA = [["path", { d: "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" }], ["circle", {
	cx: "12",
	cy: "13",
	r: "3"
}]];
const READS = /* @__PURE__ */ new Set([
	"write",
	"deck",
	"sheet"
]);
const READABLE = [
	".docx",
	".odt",
	".rtf",
	".epub",
	".fb2",
	".html",
	".htm",
	".xhtml",
	".tex",
	".latex",
	".typ",
	".md",
	".markdown",
	".txt",
	".rst",
	".org",
	".textile",
	".wiki",
	".adoc",
	".dbk",
	".opml",
	".ipynb",
	".pptx",
	".xlsx",
	".csv",
	".tsv"
];
const readable = (f) => READABLE.includes(`.${f.name.split(".").pop()}`.toLowerCase());
const FILE_UP = [
	["path", { d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" }],
	["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }],
	["path", { d: "M12 12v6" }],
	["path", { d: "m15 15-3-3-3 3" }]
];
const office = (ctx, view) => {
	const box = h("div", { class: "office" });
	const page = h("div", { class: "office-page" });
	box.append(page);
	ctx.layer.append(box);
	css();
	let lib = null, mounted = null, stopped = false;
	let app = view.app, doc = null, seq = 0, pending = [], inflight = null, client = newClient(), n = 0;
	let seeding = false;
	let latest = view;
	const say = (text) => lib && lib.editors.toast(text);
	const opsOf = (text) => {
		try {
			const ops = JSON.parse(text);
			return Array.isArray(ops) ? ops : [];
		} catch (e) {
			return [];
		}
	};
	const applied = (d, ops) => {
		try {
			const next = lib.kernel.applyAll(d, ops);
			lib.kernel.keptDoc(next);
			return next;
		} catch (e) {
			return null;
		}
	};
	const load = (state) => {
		let d = lib.kernel.parse(state.text || "");
		for (const e of state.edits || []) d = applied(d, opsOf(e.ops)) || d;
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
		inflight = {
			eid: `${client}:${++n}`,
			count: ops.length
		};
		ctx.send({
			kind: "edit",
			base: seq,
			eid: inflight.eid,
			ops: JSON.stringify(ops)
		});
	};
	const sync = () => {
		inflight = null;
		ctx.send({ kind: "sync" });
	};
	const changed = (ops) => {
		if (!ops.length) return;
		pending = pending.concat(ops);
		flush();
	};
	let grabbing = false;
	const grabCommand = () => lib.editors.command({
		id: "host.grab",
		scope: "host",
		where: ["bar"],
		icon: CAMERA,
		label: () => "Grab frame",
		hint: () => "Put the frame on screen now into the document",
		disabled: () => grabbing,
		does: () => grab()
	});
	const mount = async () => {
		page.textContent = "";
		page.classList.toggle("scrolls", app === "write");
		const commands = [...TAKES_PICTURES.has(app) ? [grabCommand()] : [], ...READS.has(app) ? [readCommand()] : []];
		mounted = await lib.editors.mount(app, lib.kernel.write(doc), page, () => {}, {
			onOps: changed,
			fill: true,
			commands,
			context: {}
		});
	};
	const putPicture = async (file) => {
		const editor = mounted.editor;
		const heard = { n: 0 };
		const count = () => heard.n++;
		editor.addEventListener("docops", count);
		const dt = new DataTransfer();
		dt.items.add(file);
		if (!editor.contains(document.activeElement) || document.activeElement.closest("to-bar")) {
			const surface = editor.querySelector(".pin-wrap") || editor.querySelector("[contenteditable=\"true\"]");
			if (surface) surface.focus();
		}
		const target = editor.contains(document.activeElement) ? document.activeElement : editor;
		try {
			target.dispatchEvent(new ClipboardEvent("paste", {
				clipboardData: dt,
				bubbles: true,
				cancelable: true,
				composed: true
			}));
		} catch (e) {}
		await new Promise((r) => setTimeout(r, 1200));
		editor.removeEventListener("docops", count);
		if (heard.n || stopped || !APPENDS_PICTURES.has(app)) return;
		const pic = await lib.editors.host.images.put(file);
		const K = lib.kernel;
		const op = {
			op: "splice",
			at: K.applyAll(doc, pending).blocks.length,
			n: 0,
			blocks: [K.imageBlock(pic.ref, file.name.replace(/\.\w+$/, ""), pic.w, pic.h)]
		};
		mounted.applyRemote([op]);
		changed([op]);
	};
	const grab = async () => {
		if (grabbing) return;
		grabbing = true;
		try {
			const r = await fetch(`${ctx.base}/grab`, { method: "POST" });
			if (!r.ok) {
				say(r.status === 409 ? "No movie is playing" : "No frame");
				return;
			}
			const pic = await r.json();
			const blob = await (await fetch(lib.editors.host.images.url(pic.ref))).blob();
			const stamp = Date.now();
			const name = `${pic.title ? pic.title + ", " : ""}${clock(pic.at)}`;
			const file = new File([blob], `${name}.png`, {
				type: "image/png",
				lastModified: stamp
			});
			grabbed.set(stamp, {
				size: blob.size,
				pic: {
					ref: pic.ref,
					w: pic.w,
					h: pic.h
				}
			});
			await putPicture(file);
			say(`Frame at ${clock(pic.at)}`);
		} finally {
			grabbing = false;
		}
	};
	let reading = false;
	const readCommand = () => lib.editors.command({
		id: "host.read",
		scope: "host",
		where: ["bar"],
		icon: FILE_UP,
		label: () => "Bring in a document",
		hint: () => app === "sheet" ? "An Excel or CSV file (or any document with a table): its first table, into this Sheet while it’s empty" : "A Word, OpenOffice or PowerPoint file, an EPUB, a web page, LaTeX…, added at the end",
		disabled: () => reading,
		does: () => choose()
	});
	const choose = () => {
		const input = h("input", {
			type: "file",
			accept: READABLE.join(",")
		});
		input.addEventListener("change", () => input.files[0] && bringIn(input.files[0]));
		input.click();
	};
	const bringIn = async (file) => {
		if (reading || !mounted) return;
		reading = true;
		say(`Reading ${file.name}…`);
		try {
			const r = await fetch(`${ctx.base}/read?name=${encodeURIComponent(file.name)}&app=${app}`, {
				method: "POST",
				body: file
			});
			if (!r.ok) {
				say(r.status === 413 ? "That file is too big" : (await r.text()).trim() || "That file could not be read");
				return;
			}
			const { text } = await r.json();
			const K = lib.kernel, now = K.applyAll(doc, pending);
			let blocks = K.parse(text).blocks;
			if (!blocks.length) {
				say(app === "sheet" ? `No table in ${file.name}` : `Nothing in ${file.name} to bring in`);
				return;
			}
			const filled = now.blocks.some((b) => b.k === "table" && b.rows.some((row) => row.some((cell) => cell.trim())));
			if (app === "sheet" && filled) {
				say("This Sheet has its own table: bring the file into a Document, or a new Sheet");
				return;
			}
			if (app === "deck" && now.blocks.length) blocks = [K.parse("x\n\n---\n\nx").blocks[1], ...blocks];
			const op = app === "sheet" ? {
				op: "splice",
				at: 0,
				n: now.blocks.length,
				blocks
			} : {
				op: "splice",
				at: now.blocks.length,
				n: 0,
				blocks
			};
			if (JSON.stringify([op]).length > 1 << 20 || !applied(now, [op])) {
				say(`${file.name} is too long to bring in`);
				return;
			}
			mounted.applyRemote([op]);
			changed([op]);
			say(`Brought in ${file.name}`);
		} catch (e) {
			say("That file could not be read");
		} finally {
			reading = false;
		}
	};
	box.addEventListener("dragover", (e) => {
		if (READS.has(app) && [...e.dataTransfer?.items || []].some((i) => i.kind === "file" && !i.type.startsWith("image/"))) e.preventDefault();
	}, true);
	box.addEventListener("drop", (e) => {
		const file = [...e.dataTransfer?.files || []].find(readable);
		if (!file || !READS.has(app) || !mounted) return;
		e.preventDefault();
		e.stopPropagation();
		bringIn(file);
	}, true);
	(async () => {
		lib = await library(ctx.base);
		if (stopped) return;
		load(latest);
		if (latest.seq === 0 && !latest.text) {
			const seeded = seed && seed.name === app ? seed.text : null;
			if (seeded !== null) seed = null;
			const text = seeded !== null ? seeded : await lib.editors.appOf(app)?.blank?.();
			if (text && latest.seq === 0 && !latest.text) {
				seeding = true;
				ctx.send({
					kind: "seed",
					text
				});
				return;
			}
			load(latest);
		}
		await mount();
	})();
	return {
		view(v) {
			latest = v;
			if (lib && seeding && v.text) {
				seeding = false;
				load(v);
				mount();
				return;
			}
			if (!lib || !mounted || v.seq !== 0 || seq !== 0 || pending.length || (v.text || "") === shown()) return;
			load(v);
			mount();
		},
		message(m) {
			if (lib && seeding && m.kind === "state") {
				seeding = false;
				load(m.state);
				mount();
				return;
			}
			if (!lib || !mounted) return;
			if (m.kind === "ops") {
				if (m.seq <= seq) return;
				if (m.seq !== seq + 1) return sync();
				const ops = opsOf(m.ops);
				const next = applied(doc, ops);
				if (inflight && m.eid === inflight.eid) {
					if (!next) return sync();
					pending = pending.slice(inflight.count);
					inflight = null;
					doc = next;
					seq = m.seq;
					if (m.snap) ctx.send({
						kind: "snap",
						seq,
						text: lib.kernel.write(doc)
					});
					flush();
					return;
				}
				if (next) try {
					const [mine, passed] = lib.kernel.cross(pending, ops);
					pending = mine;
					mounted.applyRemote(passed);
				} catch (e) {
					doc = next;
					seq = m.seq;
					return sync();
				}
				doc = next || doc;
				seq = m.seq;
			} else if (m.kind === "retry") {
				if (inflight && m.eid === inflight.eid) {
					inflight = null;
					flush();
				}
			} else if (m.kind === "refused") {
				say("That change could not be shared");
				sync();
			} else if (m.kind === "state") {
				load(m.state);
				mounted.editor.value = lib.kernel.write(doc);
			}
		},
		stop() {
			stopped = true;
		}
	};
};
export { css, office as default, library, seedNext };
