/** The words alone, marks and all taken away. */
var plainText = (runs) => runs.map((r) => r.t).join("");
/** Whether a block holds words. */
var isText = (b) => b.k === "h" || b.k === "p" || b.k === "li" || b.k === "quote";
/** A run with no words of its own: an icon or a footnote mark. It counts as one character. */
var isAtomic = (r) => !!r.ic || r.fn !== void 0;
/** Whether two runs carry the same marks, so their words may sit in one run. Atomic runs never merge. */
var sameMarks = (a, b) => !isAtomic(a) && !isAtomic(b) && a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s && a.h === b.h && a.c === b.c && a.href === b.href;
/** Runs as the parser would give them: no empty run of words, and no two neighbours with the same marks. */
function normalRuns(runs) {
	const out = [];
	for (const r of runs) {
		if (!r.t && !isAtomic(r)) continue;
		const last = out[out.length - 1];
		if (last && sameMarks(last, r)) out[out.length - 1] = {
			...last,
			t: last.t + r.t
		};
		else out.push(r);
	}
	return out;
}
/** Whether a block carries a class in its attributes. */
var hasClass = (b, c) => !!b.a?.cls?.includes(c);
/** A key's value among a block's attributes, or undefined. */
var attr = (b, k) => b.a?.kv?.[k];
/** Whether a block is a horizontal rule: a break with the class rule, drawn as a line and never starting a page or slide. */
var isRule = (b) => b.k === "hr" && hasClass(b, "rule");
/** A horizontal rule: the kernel's break marked rule, so the plain break keeps its meaning. */
var rule = () => ({
	k: "hr",
	a: { cls: ["rule"] }
});
/** Whether a block is another document held in this one: a fence named for its app. */
var isInnerDoc = (b) => b.k === "fence" && !!b.lang;
/** The blocks between rules: a deck's slides, a booklet's pages. */
function pages(blocks) {
	const out = [[]];
	for (const b of blocks) b.k === "hr" ? out.push([]) : out[out.length - 1].push(b);
	return out;
}
/** The blocks under each heading of a level: [heading, or null for what comes before, blocks]. */
function sections(blocks, level) {
	const out = [[null, []]];
	for (const b of blocks) b.k === "h" && b.level <= level ? out.push([b, []]) : out[out.length - 1][1].push(b);
	return out[0][1].length ? out : out.slice(1);
}
/**
* TLO: every document is Markdown with a few additions, and this reads and
* writes it. The link holds this text (compressed), a .tlo file is this text,
* and every app reads its document through the blocks here. docs/tlo.md is
* the format as a person or a language model learns it.
*
* Blocks, one after another (a list item's depth says how it nests):
*
*   ---                      a header first: "key: value" lines between fences
*   # Heading                levels 1 to 6
*   Words                    a paragraph; its lines stay lines
*   - item / 1. item         list items, two spaces in per level; "- [ ]" and "- [x]" are tasks
*   > note                   a quote: a note, a speaker's note
*   ---                      a rule: a break between pages or slides
*   a | b                    a table: the header row names (and may type) the columns, "Price:money"
*   --- | ---
*   ```sheet                 a fenced block: another document inside this one, named by its app,
*   ...                      or text kept exactly as written
*   ```
*   ~ A -> B: label          an edge between two things in the document (->, <-, <->, --)
*
* An address may hold one pair of brackets, as Wikipedia's do; a lone bracket is written escaped (%28, %29).
* Any block may end with attributes, "{#id .kind key=value}".
* Inline: **bold**, *italic*, ++underline++, ~~strike~~, ==highlight==, [words](address), :icon:,
* ^[a footnote's words] (notes.ts says how notes are drawn).
*
* Read leniently, write canonically: and what is canonical is written back
* byte for byte (write(parse(x)) === x), which the inline writer keeps by
* escaping as little as it can and reading its own words back to check.
*/
var ATTRS = /\s*(?<!\\)\{((?:[#.][\w-]+|[\w-]+=(?:"[^"]*"|[^\s"{}]*))(?:\s+(?:[#.][\w-]+|[\w-]+=(?:"[^"]*"|[^\s"{}]*)))*)\}\s*$/;
/** Words and the attributes at their end, if any. */
function splitAttrs(line) {
	const m = ATTRS.exec(line);
	if (!m) return [unescapeTail(line), void 0];
	const a = {};
	for (const part of m[1].match(/[#.][\w-]+|[\w-]+=(?:"[^"]*"|[^\s"{}]*)/g)) if (part[0] === "#") a.id = part.slice(1);
	else if (part[0] === ".") (a.cls ??= []).push(part.slice(1));
	else {
		const eq = part.indexOf("=");
		(a.kv ??= {})[part.slice(0, eq)] = part.slice(eq + 1).replace(/^"(.*)"$/, "$1");
	}
	const words = line.slice(0, m.index);
	const gap = /^\s*/.exec(line.slice(m.index))[0];
	return [unescapeTail(gap.length > 1 && ODD.test(words) ? words + gap[0] : words), a];
}
/** Words that only look like attributes at their end were written with "\{". */
function unescapeTail(line) {
	const plain = line.replace(/\\\{(?=[^{]*$)/, "{");
	return plain !== line && ATTRS.test(plain) ? plain : line;
}
/** Attributes as they are written: " {#id .cls key=value}", or nothing. */
function attrsText(a) {
	if (!a) return "";
	const parts = [
		...a.id ? ["#" + a.id] : [],
		...(a.cls ?? []).map((c) => "." + c),
		...Object.entries(a.kv ?? {}).map(([k, v]) => `${k}=${/^[^\s"{}]*$/.test(v) && v ? v : `"${v.replace(/"/g, "'")}"`}`)
	];
	return parts.length ? ` {${parts.join(" ")}}` : "";
}
var FENCE = /^(`{3,}|~{3,})\s*([\w-]*)\s*(.*)$/;
var HEADING = /^(#{1,6})(?:\s+(.*?))?\s*(?:(?<!\\)#+)?\s*$/d;
var ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(?:\s+(.*))?$/;
var RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
/** Whether a line reads as a rule, attributes at its end or not: "***", "--- {.title}". */
var isRule$1 = (line) => RULE.test(((m) => m ? line.slice(0, m.index) : line)(ATTRS.exec(line)));
var SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
var EDGE = /^~\s+(.+?)\s+(<->|->|<-|--)\s+(.+?)(?::\s+(.*))?$/;
/** The cells of a table row: pipes split them, "\|" is a pipe in a cell. */
function cells(line) {
	let s = trimRaw(line);
	if (s.startsWith("|")) s = s.slice(1);
	if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
	const out = [];
	let cur = "";
	for (let i = 0; i < s.length; i++) if (s[i] === "\\" && i + 1 < s.length) cur += s[i] + s[i + 1], i++;
	else if (s[i] === "|") out.push(cur), cur = "";
	else cur += s[i];
	out.push(cur);
	return out.map((c) => trimRaw(c).replace(/\\([|\\]|[^\S\n])/g, "$1").replace(/<br\s*\/?>/gi, "\n"));
}
/** The header, if the text starts with one: "---", lines of "key: value", "---". */
function readHead(lines) {
	if (lines[0]?.trim() !== "---") return [{}, 0];
	const head = {};
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "---" || line.trim() === "...") return [head, i + 1];
		const m = /^([\w-]+):\s?(.*)$/.exec(line);
		if (!m) return [{}, 0];
		head[m[1].toLowerCase()] = m[2].trim().replace(/^"(.*)"$/, "$1");
	}
	return [{}, 0];
}
/** What a line may not open with and still be words: the guard `write` puts a backslash before. */
var GUARDED = /^(#{1,6}(\s|$)|[-*+](\s|$)|\d{1,9}[.)](\s|$)|>|~\s|```|~~~|\||\{)/;
/** Undo the guard that kept a line from being read as a block of another kind (and only that: "\`" is an escaped backtick). */
var unblock = (s) => s[0] === "\\" && !/\s/.test(s[1] ?? "") && (GUARDED.test(s.slice(1)) || isRule$1(s.slice(1))) && !(s[1] === "{" && ATTRS.test(s.slice(1))) ? s.slice(1) : s;
/** Inline Markdown, line by line, as runs: marks do not cross a line, and a line break is a '\n' among the words. */
function parseLines(s, blank = true) {
	const lines = s.replace(NUL, "").split("\n").map((line) => line === "\\" ? null : readLine(line, !blank));
	let end = lines.length;
	while (end && lines[end - 1]?.length === 0) end--;
	return normalRuns((blank ? lines.slice(0, end) : lines.filter((l) => l === null || l.length)).flatMap((l, i) => i ? [{ t: "\n" }, ...l ?? []] : l ?? []));
}
/** An odd run of backslashes at a string's end: the escape of what follows it. */
var ODD = /(?:^|[^\\])(?:\\\\)*\\$/;
/** The spaces at a line's end taken off up to an escaped one ("a\\ " keeps its space), never past it. */
function trimEnd(s) {
	const e = s.trimEnd();
	return e.length < s.length && ODD.test(e) ? s.slice(0, e.length + 1) : e;
}
/** A line's ends trimmed: at its start up to a backslash, at its end up to an escaped space. */
var trimRaw = (s) => trimEnd(s).trimStart();
/** One line of a block's words as runs: its ends trimmed up to an escaped space (and, `start` false, in a quote, only its end). */
function readLine(line, start) {
	const kept = [];
	const runs = trimLine(parseInline(line, kept), start);
	if (!kept.length) return unlinkEnds(runs, start);
	return unlinkEnds(normalRuns(runs.map((r) => r.t.includes("\0") ? {
		...r,
		t: r.t.replace(/\0/g, () => kept.shift())
	} : r).flatMap(unspaced)), start);
}
/**
* A link's spaces at a line's end (and, `start`, at its start) read as the writer writes them: outside the link,
* "[a\\ ](url)" as "[a](url)\\ ", and a link of spaces alone as its spaces (writeLine). The space is kept; the link on it is let go.
*/
function unlinkEnds(runs, start) {
	const linked = (r) => !!r && !r.ic && r.fn === void 0 && !!r.href;
	let out = runs;
	const last = out[out.length - 1];
	const tail = linked(last) ? /\s+$/.exec(last.t) : null;
	if (tail) out = normalRuns([
		...out.slice(0, -1),
		{
			...last,
			t: last.t.slice(0, tail.index)
		},
		{ t: tail[0] }
	]);
	const first = out[0];
	const head = start && linked(first) ? /^\s+/.exec(first.t) : null;
	if (head) out = normalRuns([
		{ t: head[0] },
		{
			...first,
			t: first.t.slice(head[0].length)
		},
		...out.slice(1)
	]);
	return out;
}
/** A line's runs without the spaces at its end (and, but in a quote, at its start), which no writing of it keeps: "`- `" is "-". */
function trimLine(runs, start) {
	const words = (r) => r && !r.ic && r.fn === void 0;
	const out = [...runs];
	while (words(out[out.length - 1]) && !out[out.length - 1].t.trimEnd()) out.pop();
	while (start && words(out[0]) && !out[0].t.trimStart()) out.shift();
	const last = out[out.length - 1];
	if (words(last)) out[out.length - 1] = {
		...last,
		t: last.t.trimEnd()
	};
	if (start && words(out[0])) out[0] = {
		...out[0],
		t: out[0].t.trimStart()
	};
	return out;
}
var NOTE_DEF = /^\[\^([^\]\s]+)\]:\s*([\s\S]*)$/;
var NOTE_REF = /\[\^([^\]\s]+)\]/g;
/**
* Markdown's reference footnotes folded into the inline form: a paragraph
* "[^id]: the note" is taken out, and each "[^id]" in the words becomes
* "^[the note]". A reference with no note stays as it was written.
*/
function foldNotes(blocks) {
	const defs = /* @__PURE__ */ new Map();
	const isDefs = (b) => b.k === "p" && NOTE_DEF.test(b.text);
	for (const b of blocks.filter(isDefs)) {
		let id = "";
		for (const line of b.text.split("\n")) {
			const m = NOTE_DEF.exec(line);
			if (m) defs.set(id = m[1], m[2].trim());
			else if (id) defs.set(id, `${defs.get(id)} ${line.trim()}`.trim());
		}
	}
	if (!defs.size) return blocks;
	const fold = (t) => t.replace(NOTE_REF, (ref, id) => defs.has(id) ? `^[${balanceNote(defs.get(id))}]` : ref);
	return blocks.filter((b) => !isDefs(b)).map((b) => "text" in b ? {
		...b,
		text: fold(b.text)
	} : b);
}
var finish = (b) => {
	if (!("text" in b)) return b;
	const { text, ...rest } = b;
	return {
		...rest,
		runs: parseLines(text, b.k === "quote")
	};
};
/** NUL (U+0000) never enters a document: no editor writes one, and the reader drops any it is given. */
var NUL = /\u0000/g;
/** A text as a document: its header and its blocks, read leniently. */
function parse(text) {
	const lines = text.replace(NUL, "").replace(/\r\n?/g, "\n").replace(/^﻿/, "").split("\n");
	const [head, start] = readHead(lines);
	const blocks = [];
	let indents = [];
	let para = [];
	let paraKind = "p";
	const flush = () => {
		if (para.length) {
			const [text, a] = splitAttrs(para.join("\n"));
			blocks.push({
				k: paraKind,
				text: paraKind === "p" && text.trim() === "<br>" ? "" : text,
				...a ? { a } : {}
			});
		}
		para = [];
	};
	for (let i = start; i < lines.length; i++) {
		const line = lines[i];
		const t = trimRaw(line);
		if (!t) {
			flush();
			continue;
		}
		const fence = FENCE.exec(t);
		if (fence && (fence[1][0] === "~" ? !fence[3] : !fence[3].includes("`"))) {
			flush();
			const close = new RegExp(`^\\s*${fence[1][0] === "`" ? "`" : "~"}{${fence[1].length},}\\s*$`);
			const body = [];
			let j = i + 1;
			while (j < lines.length && !close.test(lines[j])) body.push(lines[j++]);
			const [, a] = splitAttrs(" " + fence[3]);
			blocks.push({
				k: "fence",
				lang: fence[2].toLowerCase(),
				body: body.join("\n"),
				...a ? { a } : {}
			});
			i = j;
			continue;
		}
		if (isRule$1(line)) {
			flush();
			indents = [];
			const [, a] = splitAttrs(t.replace(/^[-*_\s]+/, " "));
			blocks.push({
				k: "hr",
				...a ? { a } : {}
			});
			continue;
		}
		const h = HEADING.exec(t);
		if (h) {
			flush();
			indents = [];
			const end = h.indices[2]?.[1] ?? 0;
			const [text, a] = splitAttrs(h[2] && ODD.test(h[2]) && /\s/.test(t[end] ?? "") ? h[2] + t[end] : h[2] ?? "");
			blocks.push({
				k: "h",
				level: h[1].length,
				text,
				...a ? { a } : {}
			});
			continue;
		}
		const carries = blocks[blocks.length - 1]?.k === "li" && /^\s/.test(line) && !!lines[i - 1]?.trim();
		if (t.includes("|") && !para.length && !carries && i + 1 < lines.length && SEP.test(lines[i + 1]) && lines[i + 1].includes("-") && !/^\s*[-*+](\s|$)/.test(lines[i + 1])) {
			flush();
			indents = [];
			const cols = cells(t).map(column);
			const rows = [];
			let j = i + 2;
			while (j < lines.length && lines[j].trim() && lines[j].includes("|")) rows.push(cells(lines[j++]));
			let a;
			if (j < lines.length && /^\s*\{.*\}\s*$/.test(lines[j])) [, a] = splitAttrs(" " + lines[j++].trim());
			blocks.push({
				k: "table",
				cols,
				rows: rows.map((r) => cols.map((_, c) => r[c] ?? "")),
				...a ? { a } : {}
			});
			i = j - 1;
			continue;
		}
		const [edgeLine, edgeA] = t.startsWith("~") ? splitAttrs(t) : [t, void 0];
		const edge = EDGE.exec(edgeLine);
		if (edge) {
			flush();
			const label = edge[4] ?? "";
			const a = edgeA;
			blocks.push({
				k: "edge",
				from: edge[1],
				to: edge[3],
				dir: edge[2],
				...label ? { label } : {},
				...a ? { a } : {}
			});
			continue;
		}
		const item = ITEM.exec(line);
		if (item && (item[3] !== void 0 || /^[-*+]$|^\d+[.)]$/.test(t))) {
			flush();
			const indent = item[1].replace(/\t/g, "    ").length;
			while (indents.length && indent < indents[indents.length - 1]) indents.pop();
			if (!indents.length || indent > indents[indents.length - 1]) indents.push(indent);
			let words = item[3] ?? "";
			let done;
			const task = /^\[( |x|X)\](?:\s+|$)(.*)$/.exec(words);
			if (task) done = task[1] !== " ", words = task[2];
			const [text, a] = splitAttrs(unblock(words));
			blocks.push({
				k: "li",
				depth: indents.length - 1,
				.../\d/.test(item[2]) ? { ord: true } : {},
				...done !== void 0 ? { done } : {},
				text,
				...a ? { a } : {}
			});
			continue;
		}
		const quote = /^\s*>\s?(.*)$/.exec(line);
		if (quote) {
			if (paraKind !== "quote") flush();
			paraKind = "quote";
			para.push(trimEnd(quote[1]));
			continue;
		}
		const last = blocks[blocks.length - 1];
		if (!para.length && last?.k === "li" && /^\s/.test(line) && lines[i - 1]?.trim()) {
			const [more, a] = splitAttrs(unblock(t));
			last.text += "\n" + more;
			if (a) last.a = a;
			continue;
		}
		if (paraKind !== "p") flush();
		paraKind = "p";
		indents = [];
		para.push(unblock(t));
	}
	flush();
	return {
		head,
		blocks: foldNotes(blocks).map(finish)
	};
}
/** Some keys taken out of a text's header: [those keys, the text without them]. The rest of the header stays. */
function takeHead(text, keys) {
	text = text.replace(NUL, "");
	const lines = text.split("\n");
	const [head, start] = readHead(lines);
	if (!start || !keys.some((k) => k in head)) return [{}, text];
	const took = {};
	const rest = {};
	for (const [k, v] of Object.entries(head)) (keys.includes(k) ? took : rest)[k] = v;
	return [took, writeHead(rest) + lines.slice(start).join("\n")];
}
/** A text with keys put in its header (an empty value takes the key out). */
function withHead(text, keys) {
	const lines = text.split("\n");
	const [head, start] = readHead(lines);
	const next = { ...head };
	for (const [k, v] of Object.entries(keys)) v ? next[k] = v : delete next[k];
	return writeHead(next) + lines.slice(start).join("\n");
}
/** A line as it must be written so it reads back as the same words, not as a block of another kind. */
function guard(line) {
	if (line === "|") return line;
	if (GUARDED.test(line) || isRule$1(line)) return "\\" + line;
	return line;
}
/** A block's first two lines that would read as a table's head and separator ("a | b", "--- | ---"): the second is written "\---", which reads as the same words. */
var unTable = (lines) => lines.length > 1 && lines[0].includes("|") && SEP.test(lines[1]) && lines[1].includes("-") && /^\s*[-:|]/.test(lines[1]) ? [
	lines[0],
	"\\" + lines[1].trimStart(),
	...lines.slice(2)
] : lines;
var guardEnd = (s) => ATTRS.test(s) ? s.replace(/\{(?=[^{]*$)/, "\\{") : s;
/** The header as its lines, or nothing when it holds nothing. */
function writeHead(head) {
	const keys = Object.keys(head).filter((k) => head[k] !== void 0 && head[k] !== "");
	if (!keys.length) return "";
	return [
		"---",
		...keys.map((k) => `${k}: ${String(head[k]).replace(/\n/g, " ")}`),
		"---",
		""
	].join("\n");
}
/** A cell as written: "\\|" a pipe, "\\\\" a backslash, "<br>" a line break, a space at either end "\\ ". */
var cell = (s) => ((c) => edges(c, /\s$/.test(c), /^\s/.test(c)))(s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, "<br>"));
/** Words written with the space at their end (`tail`) and the one at their start (`head`) escaped, so no trimming takes them. */
var edges = (s, tail, head) => {
	const o = tail ? s.slice(0, -1) + "\\" + s.slice(-1) : s;
	return head && !(tail && s.length === 1) ? "\\" + o : o;
};
/**
* Runs as lines of inline Markdown: a '\n' among the words is a line break, and each line is written on its own,
* a space at its ends escaped ("\\ ") and an empty one "\\", so every space and break typed is read back.
* A quote's lines keep their starts as they are, and an empty line between two is ">" alone.
*/
function writeLines(runs, quote = false) {
	const lines = [[]];
	for (const r of runs) {
		if (r.ic || r.fn !== void 0 || !r.t.includes("\n")) {
			lines[lines.length - 1].push(r);
			continue;
		}
		r.t.split("\n").forEach((t, i) => {
			if (i) lines.push([]);
			if (t) lines[lines.length - 1].push({
				...r,
				t
			});
		});
	}
	if (lines.length === 1 && !lines[0].length) return "";
	return lines.map((l, i) => l.length ? writeLine(l, !quote) : quote && i < lines.length - 1 ? "" : "\\").join("\n");
}
/** One block as text; `n` numbers an ordered item. */
function writeBlock(b, n = 1) {
	const at = attrsText(b.a);
	switch (b.k) {
		case "h": return trimEnd(`${"#".repeat(b.level)} ${guardEnd(writeLines(b.runs).replace(/#+$/, (m) => m.replace(/#/g, "\\#")))}${at}`);
		case "p": return (b.runs.length ? guardEnd(unTable(writeLines(b.runs).split("\n").map(guard)).join("\n")) : "<br>") + at;
		case "quote": return guardEnd(writeLines(b.runs, true)).split("\n").map((l) => trimEnd(`> ${l}`)).join("\n") + at;
		case "li": {
			const mark = b.ord ? `${n}.` : "-";
			const task = b.done === void 0 ? "" : b.done ? "[x] " : "[ ] ";
			const [first, ...more] = unTable(writeLines(b.runs).split("\n"));
			const pad = "  ".repeat(b.depth);
			return trimEnd(`${pad}${mark} ${task}${/^\[[ xX]\](\s|$)/.test(first) && b.done === void 0 || isRule$1(`- ${first}`) ? "\\" : ""}${guardEnd(first)}${more.length ? "" : at}`) + more.map((l, i) => `\n${pad}  ${guardEnd(guard(l))}${i === more.length - 1 ? at : ""}`).join("");
		}
		case "hr": return `---${at}`;
		case "table": {
			const head = b.cols.map((c) => columnText(c.name, c.type, c.currency));
			const edged = head.length < 2 || guard(cell(head[0])) !== cell(head[0]) || !head[head.length - 1];
			const row = (r) => trimEnd(edged ? `| ${r.map(cell).join(" | ")} |` : (r[0] ? "" : "|") + r.map(cell).join(" | "));
			return [
				row(head),
				row(head.map(() => "---")),
				...b.rows.map(row),
				...at ? [at.trim()] : []
			].join("\n");
		}
		case "fence": {
			const longest = Math.max(2, ...(b.body.match(/`{3,}/g) ?? []).map((m) => m.length));
			const ticks = "`".repeat(longest + 1);
			return `${ticks}${b.lang}${at}\n${b.body}${b.body ? "\n" : ""}${ticks}`;
		}
		case "edge": return `${guardEnd(`~ ${b.from} ${b.dir} ${b.to}${b.label ? ": " + b.label : ""}`)}${at}`;
	}
}
/** An address as a link writes it: a pair of brackets kept (the reader takes one), a space or a lone bracket escaped so as not to end it early. */
var addressText = (url) => url.replace(/^((?:[^()\s]|\([^()\s]*\))*)$|[\s()]/g, (c, whole) => whole ?? "%" + c.charCodeAt(0).toString(16).toUpperCase());
/** A document as text. Blocks that would run together are kept apart by a blank line; list items and edges sit line by line. */
function write(doc) {
	const out = [];
	const counts = [];
	let prev;
	for (const b of doc.blocks) {
		let n = 1;
		if (b.k === "li") {
			counts.length = b.depth + 1;
			n = counts[b.depth] = b.ord && prev?.k === "li" && (prev.depth > b.depth || prev.ord) && counts[b.depth] ? counts[b.depth] + 1 : 1;
			if (!b.ord) counts[b.depth] = 0;
		} else counts.length = 0;
		const tight = prev && (prev.k === "li" && b.k === "li" || prev.k === "edge" && b.k === "edge");
		if (prev) out.push(tight ? "\n" : "\n\n");
		out.push(writeBlock(b, n));
		prev = b;
	}
	const body = out.join("");
	return writeHead(doc.head) + (body ? body + "\n" : "");
}
var MARKS = [
	["**", "b"],
	["__", "b"],
	["~~", "s"],
	["==", "h"],
	["++", "u"],
	["*", "i"],
	["_", "i"]
];
var LINK = /^\[((?:\\.|[^\]\\\n])+)\]\(\s*<?((?:https?:\/\/|mailto:|tel:|#)(?:[^()\s>]|\([^()\s>]*\))*)>?\s*\)/;
var ICON = /^:([a-z][a-z0-9-]*):/;
/** A web or mail address, as far as it can go without taking in a mark that follows it (read at a line's start, after a space, a "(" or a link's "["). */
var URL = "(?:https?:\\/\\/|mailto:)(?:(?!\\*\\*|~~|==|\\+\\+|__|:[a-z][a-z0-9-]*:)[^\\s<`\\\\[\\]*])+";
/** The one way a string of inline Markdown becomes runs (parseInline by its short name, for a model built by hand). */
var text = (s) => parseInline(s);
/**
* One line of inline Markdown as runs of words with their marks. Lenient: what does not close is plain words.
* `kept`, given by a line's reader, takes each escaped space, read as a NUL until the line's ends are trimmed.
*/
function parseInline(s, kept) {
	const runs = [];
	const on = {};
	let href;
	let buf = "";
	const push = (t, extra = {}) => {
		const r = { t };
		if (extra.ic === void 0 && extra.fn === void 0) {
			for (const f of [
				"b",
				"i",
				"u",
				"s",
				"h"
			]) if (on[f]) r[f] = true;
		}
		if (href && extra.fn === void 0) r.href = href;
		Object.assign(r, extra);
		const last = runs[runs.length - 1];
		if (last && !r.ic && !last.ic && r.fn === void 0 && last.fn === void 0 && [
			"b",
			"i",
			"u",
			"s",
			"h",
			"c",
			"href"
		].every((k) => last[k] === r[k])) last.t += r.t;
		else runs.push(r);
	};
	const flush = () => {
		if (buf) push(buf);
		buf = "";
	};
	/** Whether a mark opening here has a closing partner later, as Markdown wants: no space inside either end. */
	const closes = (from, mark) => {
		for (let j = s.indexOf(mark, from); j > from; j = s.indexOf(mark, j + 1)) if (s[j - 1] !== " " && !escaped(j)) return true;
		return false;
	};
	/** Whether the character at j follows an odd run of backslashes, and so is escaped. */
	const escaped = (j) => {
		let n = 0;
		while (j - n - 1 >= 0 && s[j - n - 1] === "\\") n++;
		return n % 2 === 1;
	};
	let linkEnd = -1;
	let linkClose = -1;
	for (let i = 0; i < s.length;) {
		if (i === linkEnd) {
			flush();
			href = void 0;
			linkEnd = -1;
			i = linkClose;
			continue;
		}
		const c = s[i];
		if (c === "\\" && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|~=:<>^]|[^\S\n]/.test(s[i + 1])) {
			buf += kept && /\s/.test(s[i + 1]) ? (kept.push(s[i + 1]), "\0") : s[i + 1];
			i += 2;
			continue;
		}
		if (c === "`") {
			const end = s.indexOf("`", i + 1);
			if (end > i + 1 && (linkEnd < 0 || end < linkEnd)) {
				flush();
				push(s.slice(i + 1, end), { c: true });
				i = end + 1;
				continue;
			}
		}
		if (c === "^" && s[i + 1] === "[") {
			const end = noteEnd(s, i + 2);
			if (end >= 0) {
				flush();
				push("", { fn: s.slice(i + 2, end) });
				i = end + 1;
				continue;
			}
		}
		if (c === "[" && href === void 0) {
			const m = LINK.exec(s.slice(i));
			if (m) {
				flush();
				href = m[2];
				linkEnd = i + 1 + m[1].length;
				linkClose = i + m[0].length;
				i++;
				continue;
			}
		}
		if ((c === "h" || c === "m") && (i === 0 || /[\s([]/.test(s[i - 1]))) {
			const m = new RegExp("^" + URL).exec(s.slice(i));
			if (m) {
				const url = m[0].replace(/[.,;:!?)]+$/, "");
				buf += url;
				i += url.length;
				continue;
			}
		}
		if (c === ":") {
			const m = ICON.exec(s.slice(i));
			if (m) {
				flush();
				push("", { ic: m[1] });
				i += m[0].length;
				continue;
			}
		}
		if (c === "<") {
			const m = /^<(\/?)u>/.exec(s.slice(i));
			if (m) {
				flush();
				on.u = !m[1];
				i += m[0].length;
				continue;
			}
		}
		const mark = MARKS.find(([m]) => s.startsWith(m, i));
		if (mark) {
			const [m, f] = mark;
			const next = s[i + m.length];
			const before = s[i - 1];
			const intraword = m[0] === "_" && /\w/.test(before ?? "") && /\w/.test(next ?? "");
			if (!intraword && on[f] && before !== " " && before !== void 0) {
				flush();
				on[f] = false;
				i += m.length;
				continue;
			}
			if (!intraword && !on[f] && next && next !== " " && closes(i + m.length, m)) {
				flush();
				on[f] = true;
				i += m.length;
				continue;
			}
			buf += m;
			i += m.length;
			continue;
		}
		buf += c;
		i++;
	}
	flush();
	return normalRuns(runs.flatMap(unspaced));
}
/** A run's marks kept off the spaces at its ends, as the writer keeps them ("** a**" opened its bold before a space); a link keeps its spaces. */
function unspaced(r) {
	if (r.ic || r.fn !== void 0 || !(r.b || r.i || r.u || r.s || r.h || r.c)) return [r];
	const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.t);
	if (!m[1] && !m[3]) return [r];
	const plain = {
		t: "",
		...r.href ? { href: r.href } : {}
	};
	return [
		{
			...plain,
			t: m[1]
		},
		...m[2] ? [{
			...r,
			t: m[2]
		}] : [],
		{
			...plain,
			t: m[3]
		}
	];
}
/** Where the "]" that closes a note opened at `from` is, or -1: brackets inside balance, and an escaped one is a bracket. */
function noteEnd(s, from) {
	let depth = 0;
	for (let j = from; j < s.length; j++) {
		const c = s[j];
		if (c === "\\") j++;
		else if (c === "[") depth++;
		else if (c === "]" && !depth--) return j;
	}
	return -1;
}
/** A note's words as they sit between "^[" and "]": a bracket that would end the note early, or open one that never closes, is escaped; so is a backslash that would swallow the "]". */
function balanceNote(fn) {
	const out = [...fn];
	const open = [];
	for (let j = 0; j < out.length; j++) if (out[j] === "\\") j + 1 < out.length ? j++ : out[j] = "\\\\";
	else if (out[j] === "[") open.push(j);
	else if (out[j] === "]") open.length ? open.pop() : out[j] = "\\]";
	for (const j of open) out[j] = "\\[";
	return out.join("");
}
/** Plain words as Markdown, every mark escaped: what is written when the words cannot be left as they are. */
function escapeInline(t) {
	return t.split(new RegExp(`((?:^|(?<=[\\s(]))${URL})`)).flatMap((part, n) => n % 2 ? ((m) => [
		m[1],
		"",
		m[2]
	])(/^(.*?)([.,;:!?)]*)$/.exec(part)) : [part]).map((part, n) => n % 2 ? part : escapePlain(part)).join("");
}
function escapePlain(t) {
	let out = "";
	for (let i = 0; i < t.length; i++) {
		const c = t[i];
		const pair = "=+~".includes(c) && (i === 0 || i === t.length - 1 || t[i - 1] === c || t[i + 1] === c);
		out += pair || "\\`*_".includes(c) ? "\\" + c : c;
	}
	return out.replace(/\[(?=(?:\\.|[^\]\\\n])*\]\()|\[(?![^\]]*\])/g, "\\[").replace(/\^(?=\[|$)/g, "\\^").replace(/:(?=[a-z][a-z0-9-]*:)/g, "\\:").replace(/<(?=\/?u>)/g, "\\<");
}
/** The least escaping: only a backslash, which would otherwise swallow what follows it. */
var escapeLeast = (t) => t.replace(/\\/g, "\\\\");
var FLAGS = [
	["b", "**"],
	["i", "*"],
	["s", "~~"],
	["h", "=="],
	["u", "++"]
];
/**
* Runs as one line of inline Markdown. Marks open and close where they
* change; spaces stay outside them, as Markdown needs. The words are
* written with as little escaping as reads back right: first with a
* backslash escaped and nothing else, and, when that would read as other
* runs, with every mark escaped. So "5 * 3" and "snake_case" come back as
* they were written, and canonical text is byte-stable.
*/
function writeInline(given) {
	return inline(sayable(given), (s) => s, (s) => parseInline(s));
}
/**
* One line of a block's words, as `writeInline` writes them, with the space at the line's end, and (`start`, but
* in a quote) the one at its start, escaped: "\\ ", which the reader trims up to and never past. A link's spaces
* at the line's ends come out of it first (a mark on a space alone may be let go; the space may not).
*/
function writeLine(given, start) {
	const runs = unlinkEnds(sayable(given), start);
	const loose = (r) => !!r && !r.ic && r.fn === void 0;
	const last = runs[runs.length - 1];
	const tail = loose(last) && /\s$/.test(last.t);
	const head = start && loose(runs[0]) && /^\s/.test(runs[0].t);
	return inline(runs, (s) => edges(s, tail, head), (s) => readLine(s, start));
}
/**
* Runs written with as little escaping as reads back right, the line's ends as `ends` writes them, checked by
* reading them back with `read`.
*/
function inline(runs, ends, read) {
	const full = ends(marked(runs, escapeInline));
	const least = ends(marked(runs, escapeLeast));
	const back = read(full);
	if (!same$2(back, runs)) {
		const all = ends(marked(runs, escapeAll));
		if (same$2(read(all), runs)) return all;
	}
	if (least === full) return full;
	return same$2(read(least), back) ? least : full;
}
var same$2 = (a, b) => a.length === b.length && a.every((r, i) => [
	"t",
	"b",
	"i",
	"u",
	"s",
	"h",
	"c",
	"href",
	"ic",
	"fn"
].every((k) => r[k] === b[i][k]));
/**
* Runs as reading their writing gives them at best: an icon unmarked, a note's words balanced, no mark on a space at
* a run's end, and out of code what a backtick span cannot hold (a backtick, a line's end; in a link's words a "]" or
* a backslash), written beside it as plain words.
*/
var sayable = (runs) => normalRuns(runs.flatMap((r) => r.ic ? [{
	t: "",
	ic: r.ic,
	...r.href ? { href: r.href } : {}
}] : r.fn !== void 0 ? [{
	t: "",
	fn: balanceNote(r.fn)
}] : r.c ? uncoded(r) : [r]).flatMap(unspaced));
/**
* A block's runs as reading their writing gives them back: what the writer lets go of taken off first, a line at a
* time, so `parse(write(d))` is `d` for a document whose blocks are so. A mark never holds a space at its ends: it
* ends before the spaces after it and begins after the ones before it (`**a** b`, as Markdown has it: `**a **` is
* no bold), and a line break carries none; a link's spaces at a line's ends go outside it (in a quote, `quote`, only
* at its end); an icon carries no mark, a note's words are balanced, and out of code goes what a backtick span cannot
* hold. The editor keeps its words so as it edits (kit/text/textops.ts `settle`), so what it holds is what the text
* says. Runs already so are given back as they are, the same array.
*/
function sayableRuns(runs, quote = false) {
	const lines = [[]];
	for (const r of runs) {
		if (r.ic || r.fn !== void 0 || !r.t.includes("\n")) {
			lines[lines.length - 1].push(r);
			continue;
		}
		r.t.split("\n").forEach((t, i) => {
			if (i) lines.push([]);
			if (t) lines[lines.length - 1].push({
				...r,
				t
			});
		});
	}
	const out = normalRuns(lines.flatMap((l, i) => [...i ? [{ t: "\n" }] : [], ...unlinkEnds(sayable(l), !quote)]));
	return same$2(out, runs) ? runs : out;
}
/** A code run split where its words hold what a backtick span cannot: those characters are plain words. */
function uncoded(r) {
	const parts = r.t.split(r.href ? /([`\n\]\\])/ : /([`\n])/);
	if (parts.length === 1) return [r];
	const plain = { ...r };
	delete plain.c;
	return parts.map((t, n) => n % 2 ? {
		...plain,
		t
	} : {
		...r,
		t
	});
}
/** Every character a backslash can escape, escaped: the last resort. */
var escapeAll = (t) => t.replace(/[\\`*_{}[\]()#+\-.!|~=:<>^]/g, "\\$&");
function marked(runs, esc) {
	let out = "";
	const linkOf = (r) => r.fn === void 0 ? r.href : void 0;
	for (let i = 0; i < runs.length;) {
		const href = linkOf(runs[i]);
		let j = i + 1;
		while (j < runs.length && linkOf(runs[j]) === href) j++;
		const part = href ? markedPlain(runs.slice(i, j), esc).replace(/(?<!\\)\]/g, "\\]") : markedPlain(runs.slice(i, j), esc);
		out += href ? `[${part}](${addressText(href)})` : part;
		i = j;
	}
	return out;
}
function markedPlain(runs, esc) {
	let out = "";
	const open = [];
	const close = (keep) => {
		for (let k = open.length - 1; k >= 0; k--) if (!keep.has(open[k])) {
			out += FLAGS.find(([g]) => g === open[k])[1];
			open.splice(k, 1);
		}
	};
	for (const r of runs) {
		if (r.ic) {
			close(/* @__PURE__ */ new Set());
			out += `:${r.ic}:`;
			continue;
		}
		if (r.fn !== void 0) {
			close(/* @__PURE__ */ new Set());
			out += `^[${balanceNote(r.fn)}]`;
			continue;
		}
		const want = new Set(FLAGS.filter(([f]) => r[f]).map(([f]) => f));
		const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.t);
		if (!m[2]) {
			close(want);
			out += r.t;
			continue;
		}
		close(want);
		out += m[1];
		for (const [f, d] of FLAGS) if (want.has(f) && !open.includes(f)) out += d, open.push(f);
		out += r.c ? `\`${m[2]}\`` : esc(m[2]);
		if (m[3]) {
			close(/* @__PURE__ */ new Set());
			out += m[3];
		}
	}
	close(/* @__PURE__ */ new Set());
	return out;
}
/**
* Another document held in this one is a fenced block named for its app;
* in memory it is a "ref", the app's name, a new line, and its text. These
* turn one into the other.
*/
function refFence(ref) {
	const nl = ref.indexOf("\n");
	return {
		k: "fence",
		lang: nl < 0 ? ref : ref.slice(0, nl),
		body: nl < 0 ? "" : ref.slice(nl + 1)
	};
}
/** A fence as a ref: its app, a new line, its text. */
var fenceRef = (b) => `${b.lang}\n${b.body}`;
/** Every type a column heading may name. */
var COL_TYPES = [
	"text",
	"number",
	"money",
	"percent",
	"date",
	"time",
	"check",
	"url",
	"rich",
	"long",
	"icon",
	"name",
	"option"
];
/**
* A currency as a column head names it, written canonically: an ISO 4217 code ("gbp" is GBP), or a symbol of one
* to three characters that are not all letters ("£", "R$"); null for anything else.
*/
function currencyOf(s) {
	const c = s.trim();
	if (/^[a-z]{3}$/i.test(c)) return c.toUpperCase();
	const n = [...c].length;
	return n >= 1 && n <= 3 && !/[\s\d()|:=]/.test(c) && !/^\p{L}+$/u.test(c) ? c : null;
}
/**
* A column heading, "Price:money", as its name and type ("Price: money" reads too; "Time: 10am" is a name). A money
* column may name its currency, "Price:money(£)" or "Price:money(GBP)"; another type with parentheses is a name.
*/
function column(h) {
	const m = /^(.*?):\s*(\w+)\s*(?:\(([^()]*)\))?$/.exec(h.trim());
	if (!m || !COL_TYPES.includes(m[2])) return {
		name: h.trim(),
		type: "text"
	};
	if (m[3] === void 0) return {
		name: m[1].trim(),
		type: m[2]
	};
	const currency = m[2] === "money" ? currencyOf(m[3]) : null;
	return currency ? {
		name: m[1].trim(),
		type: "money",
		currency
	} : {
		name: h.trim(),
		type: "text"
	};
}
/** Where in a table each column asked for is, found by its name (in any case, its type left off); -1 for one it has not got. */
function columnsOf(table, ...want) {
	const names = table.cols.map((c) => c.name.toLowerCase());
	return want.map((re) => names.findIndex((n) => re.test(n)));
}
/** A column heading as it is written: the name, and ":type" when it is not text, a money column's currency after it. */
var columnText = (name, type = "text", currency) => type === "text" ? name : `${name}:${type}${type === "money" && currency ? `(${currency})` : ""}`;
/**
* A picture a host keeps: a fence named "image" whose body is the host's own reference to the bytes, with the
* words for it and its size among the fence's attributes:
*
*   ```image {alt="A cat on a mat" w=640 h=480}
*   asset:7f3a…
*   ```
*
* The reference is opaque to the kernel: a server's id, never a web address and never the bytes themselves (a
* data: URL), so a document fetches nothing from another site and the link stays short. The site keeps no bytes
* and so has no pictures (Paul, 2026-10-11); a page that keeps them turns the picture on through its host
* (kit/core/host.ts `images`; Paul, 2026-10-19: "it shouldn't be there for the URL backend, but for this backend an
* image module makes sense"). A fence needs no new block kind: the reader, the writer, the operations and their
* transformation take it as any fence, and an attribute beyond these (a class a host writes, `class=thumb`) rides
* through every edit untouched. `align=left`, `align=right` or `align=center` sets the picture at its own size (its
* `w`, else a column's share) against that side, the words wrapping round it where they can; no `align` is the
* picture at the column's width (Paul, 2026-10-29: "add image alignment to the image functions ... They're enormous
* now"). `withAlign` writes it, every other attribute riding along. These helpers read one and make one, and list a document's references with no DOM,
* for a server that collects what nothing names any more or asks who may see a picture.
*/
/** The fence's language that names a host-kept picture. */
var IMAGE_LANG = "image";
/** The ways a picture is aligned (header). */
var ALIGNS = [
	"left",
	"center",
	"right"
];
var isAlign = (s) => !!s && ALIGNS.includes(s);
/** A reference a host may keep: one word, not an address of the web and not the bytes themselves. */
var REF = /^(?!(?:https?|data|blob|file|javascript):)[^\s]+$/i;
/** A size in pixels as an attribute says it, or nothing. */
var px = (s) => s && /^\d{1,5}$/.test(s) && Number(s) > 0 ? Number(s) : void 0;
/** The picture a block holds, or null: not an image fence, or one whose body is no reference a host would keep. */
function imageOf(b) {
	if (!b || b.k !== "fence" || b.lang !== "image") return null;
	const ref = b.body.trim();
	if (!REF.test(ref)) return null;
	const w = px(attr(b, "w"));
	const h = px(attr(b, "h"));
	const align = attr(b, "align");
	return {
		ref,
		alt: attr(b, "alt") ?? "",
		...w ? { w } : {},
		...h ? { h } : {},
		...isAlign(align) ? { align } : {}
	};
}
/** An image fence aligned `align`, or at the column's width for null (header): every other attribute rides along. */
function withAlign(b, align) {
	const kv = { ...b.a?.kv ?? {} };
	if (align) kv.align = align;
	else delete kv.align;
	const a = {
		...b.a?.id ? { id: b.a.id } : {},
		...b.a?.cls?.length ? { cls: [...b.a.cls] } : {},
		...Object.keys(kv).length ? { kv } : {}
	};
	return {
		...b,
		...Object.keys(a).length ? { a } : { a: void 0 }
	};
}
/** Whether a block is an image fence, well formed or not (a lint names the malformed one). */
var isImage = (b) => b.k === "fence" && b.lang === "image";
/** An image fence for a host's reference: its alt where there is one, its size where known; `a` carries any other attribute along. */
function imageBlock(ref, alt = "", w, h, a) {
	const kv = {
		...alt ? { alt } : {},
		...w ? { w: String(Math.round(w)) } : {},
		...h ? { h: String(Math.round(h)) } : {}
	};
	for (const [k, v] of Object.entries(a?.kv ?? {})) if (!(k in kv) && k !== "alt" && k !== "w" && k !== "h") kv[k] = v;
	const attrs = {
		...a?.id ? { id: a.id } : {},
		...a?.cls?.length ? { cls: [...a.cls] } : {},
		...Object.keys(kv).length ? { kv } : {}
	};
	return {
		k: "fence",
		lang: IMAGE_LANG,
		body: ref.trim(),
		...Object.keys(attrs).length ? { a: attrs } : {}
	};
}
/**
* Every picture's reference in a document, each once, in order: its own image fences, and those of the documents
* fenced inside it (a text on a slide), read as documents. A fence of no app (code) is read too, since the kernel
* knows no app's name: a reference it names once too often costs a server a kept byte, where one it missed would
* lose a picture.
*/
function imageRefs(doc) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	const walk = (blocks, depth) => {
		for (const b of blocks) {
			if (b.k !== "fence") continue;
			const im = imageOf(b);
			if (im) {
				if (!seen.has(im.ref)) seen.add(im.ref), out.push(im.ref);
			} else if (b.lang && depth < 8 && b.body.includes("```")) walk(parse(b.body).blocks, depth + 1);
		}
	};
	walk(Array.isArray(doc) ? doc : doc.blocks, 0);
	return out;
}
/**
* The document as JSON: the kernel's own Doc, nothing added or renamed, for a program or an agent that would rather
* hand over structure than write TLO (Paul, 2026-10-11: "The JSON export is a good idea"). Its contract is
* packages/doc/schema/tlo.schema.json, written from model.ts's types by scripts/schema.ts; this checks a document
* against it with a validator of its own, as small as the schema is (objects, arrays, enums, strings, numbers,
* booleans, a union told apart by its `k`), not a library.
*
* docJson writes a document with its keys in a stable order, the order the types name them (`k` first), and a head's
* and attributes' keys in the document's own order, since that order is the text's; jsonDoc reads one back and throws
* with the path of the first thing that does not fit ("blocks[2].runs[0].t is missing").
*/
var ROOT = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://raw.githubusercontent.com/aboard-io/tinylittleoffice/main/packages/doc/schema/tlo.schema.json",
	title: "A Tiny Little Office document",
	description: "The kernel’s document (src/doc/model.ts) as JSON: what toJson gives and fromJson takes (src/api.ts; `tinyoffice json`). Written from the types by scripts/schema.ts (so a change is made there).",
	$ref: "#/$defs/Doc",
	$defs: {
		"Attrs": {
			"description": "What any block may end with: \"{#id .cls key=value}\".",
			"type": "object",
			"properties": {
				"id": { "type": "string" },
				"cls": {
					"type": "array",
					"items": { "type": "string" }
				},
				"kv": {
					"type": "object",
					"additionalProperties": { "type": "string" }
				}
			},
			"additionalProperties": false
		},
		"Block": {
			"description": "The eight kinds of block.",
			"oneOf": [
				{
					"type": "object",
					"properties": {
						"k": { "const": "h" },
						"level": { "enum": [
							1,
							2,
							3,
							4,
							5,
							6
						] },
						"runs": {
							"type": "array",
							"items": { "$ref": "#/$defs/Run" }
						},
						"a": { "$ref": "#/$defs/Attrs" }
					},
					"required": [
						"k",
						"level",
						"runs"
					],
					"additionalProperties": false
				},
				{
					"type": "object",
					"properties": {
						"k": { "const": "p" },
						"runs": {
							"type": "array",
							"items": { "$ref": "#/$defs/Run" }
						},
						"a": { "$ref": "#/$defs/Attrs" }
					},
					"required": ["k", "runs"],
					"additionalProperties": false
				},
				{
					"type": "object",
					"properties": {
						"k": { "const": "li" },
						"depth": { "type": "number" },
						"ord": { "const": true },
						"done": { "type": "boolean" },
						"runs": {
							"type": "array",
							"items": { "$ref": "#/$defs/Run" }
						},
						"a": { "$ref": "#/$defs/Attrs" }
					},
					"required": [
						"k",
						"depth",
						"runs"
					],
					"additionalProperties": false
				},
				{
					"type": "object",
					"properties": {
						"k": { "const": "quote" },
						"runs": {
							"type": "array",
							"items": { "$ref": "#/$defs/Run" }
						},
						"a": { "$ref": "#/$defs/Attrs" }
					},
					"required": ["k", "runs"],
					"additionalProperties": false
				},
				{
					"type": "object",
					"properties": {
						"k": { "const": "hr" },
						"a": { "$ref": "#/$defs/Attrs" }
					},
					"required": ["k"],
					"additionalProperties": false
				},
				{
					"type": "object",
					"properties": {
						"k": { "const": "table" },
						"cols": {
							"type": "array",
							"items": { "$ref": "#/$defs/Column" }
						},
						"rows": {
							"type": "array",
							"items": {
								"type": "array",
								"items": { "type": "string" }
							}
						},
						"a": { "$ref": "#/$defs/Attrs" }
					},
					"required": [
						"k",
						"cols",
						"rows"
					],
					"additionalProperties": false
				},
				{
					"type": "object",
					"properties": {
						"k": { "const": "fence" },
						"lang": { "type": "string" },
						"body": { "type": "string" },
						"a": { "$ref": "#/$defs/Attrs" }
					},
					"required": [
						"k",
						"lang",
						"body"
					],
					"additionalProperties": false
				},
				{
					"type": "object",
					"properties": {
						"k": { "const": "edge" },
						"from": { "type": "string" },
						"to": { "type": "string" },
						"dir": { "$ref": "#/$defs/Dir" },
						"label": { "type": "string" },
						"a": { "$ref": "#/$defs/Attrs" }
					},
					"required": [
						"k",
						"from",
						"to",
						"dir"
					],
					"additionalProperties": false
				}
			]
		},
		"ColType": {
			"description": "What a table's column holds.",
			"enum": [
				"text",
				"number",
				"money",
				"percent",
				"date",
				"time",
				"check",
				"url",
				"rich",
				"long",
				"icon",
				"name",
				"option"
			]
		},
		"Column": {
			"description": "A column of a table: its name and what it holds.",
			"type": "object",
			"properties": {
				"name": { "type": "string" },
				"type": { "$ref": "#/$defs/ColType" },
				"currency": {
					"description": "A money column's currency: a symbol (\"£\") or an ISO 4217 code (\"GBP\"); none takes the document's, else \"$\".",
					"type": "string"
				}
			},
			"required": ["name", "type"],
			"additionalProperties": false
		},
		"Dir": {
			"description": "An edge's direction.",
			"enum": [
				"->",
				"<-",
				"<->",
				"--"
			]
		},
		"Doc": {
			"description": "A document: its header and its blocks.",
			"type": "object",
			"properties": {
				"head": { "$ref": "#/$defs/Head" },
				"blocks": {
					"type": "array",
					"items": { "$ref": "#/$defs/Block" }
				}
			},
			"required": ["head", "blocks"],
			"additionalProperties": false
		},
		"Head": {
			"description": "The header: lowercase keys, string values (title, by, created; an app's own settings).",
			"type": "object",
			"additionalProperties": { "type": "string" }
		},
		"Run": {
			"description": "Words with their marks. An icon or a footnote is a run of its own with no words (atomic: it counts as one character).",
			"type": "object",
			"properties": {
				"t": { "type": "string" },
				"b": { "const": true },
				"i": { "const": true },
				"u": { "const": true },
				"s": { "const": true },
				"h": {
					"description": "Highlighted.",
					"const": true
				},
				"c": {
					"description": "Code: set in a monospace face, its words verbatim (a backtick span).",
					"const": true
				},
				"href": {
					"description": "Where these words link.",
					"type": "string"
				},
				"ic": {
					"description": "An icon in the line, by name.",
					"type": "string"
				},
				"fn": {
					"description": "A footnote: the note's words as inline Markdown.",
					"type": "string"
				}
			},
			"required": ["t"],
			"additionalProperties": false
		}
	}
};
var DEFS = ROOT.$defs;
var say$1 = (v) => typeof v === "string" ? JSON.stringify(v) : Array.isArray(v) ? "a list" : v === null ? "null" : typeof v === "object" ? "an object" : String(v);
var at = (path) => path || "the document";
var kind = (v) => Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
/** The value as the schema has it (its keys in the schema's order, nothing undefined), or a throw naming the path where it does not fit. */
function fit(s, v, path) {
	if (s.$ref) return fit(DEFS[s.$ref.replace("#/$defs/", "")], v, path);
	if (s.oneOf) {
		const key = Object.keys(s.oneOf[0].properties ?? {}).find((k) => s.oneOf.every((b) => b.properties?.[k]?.const !== void 0));
		const o = kind(v) === "object" ? v : {};
		const match = key ? s.oneOf.filter((b) => o[key] === b.properties[key].const) : [];
		if (match.length === 1) return fit(match[0], v, path);
		if (kind(v) === "object" && key) throw new Error(`${at(path)}.${key} is ${say$1(o[key])}, not one of ${s.oneOf.map((b) => say$1(b.properties[key].const)).join(", ")}`);
		throw new Error(`${at(path)} is ${say$1(v)}, not ${key ? "an object" : "one of what it may be"}`);
	}
	if (s.const !== void 0 && v !== s.const) throw new Error(`${at(path)} is ${say$1(v)}, not ${say$1(s.const)}`);
	if (s.enum && !s.enum.includes(v)) throw new Error(`${at(path)} is ${say$1(v)}, not one of ${s.enum.map(say$1).join(", ")}`);
	if (s.type) {
		const k = kind(v);
		if (k !== s.type || k === "number" && !Number.isFinite(v)) throw new Error(`${at(path)} is ${say$1(v)}, not ${s.type === "array" ? "a list" : s.type === "object" ? "an object" : `a ${s.type}`}`);
	}
	if (Array.isArray(v)) return s.items ? v.map((x, i) => fit(s.items, x, `${path}[${i}]`)) : v;
	if (kind(v) !== "object") return v;
	const o = v;
	const out = {};
	const props = s.properties ?? {};
	for (const k of s.required ?? []) if (o[k] === void 0) throw new Error(`${path ? `${path}.` : ""}${k} is missing`);
	for (const [k, p] of Object.entries(props)) if (o[k] !== void 0) out[k] = fit(p, o[k], path ? `${path}.${k}` : k);
	for (const [k, x] of Object.entries(o)) {
		if (k in props || x === void 0) continue;
		if (!s.additionalProperties) throw new Error(`${path ? `${path}.` : ""}${k} is not a field ${path ? "here" : "of a document"}`);
		out[k] = fit(s.additionalProperties, x, path ? `${path}.${k}` : k);
	}
	return out;
}
/** A block, some runs or a column as the schema has them, or a throw naming the fault: what the kernel asks of an op's content (ops.ts checkOp). */
var fitBlock = (v, path) => fit(DEFS.Block, v, path);
var fitRuns = (v, path) => fit({
	type: "array",
	items: { $ref: "#/$defs/Run" }
}, v, path);
var fitColumn = (v, path) => fit(DEFS.Column, v, path);
/** The deepest a list item may nest and the most rows a table may hold: bounds on what one block can ask of the writer, not an app's own limits (the Spreadsheet's ROWS). A table has one column to MAX_COLS (table.ts). */
var MAX_DEPTH = 64;
var MAX_ROWS = 1e5;
var MAX_COLS$1 = 26;
var KEY = /^[a-z0-9_-]+$/;
var says = (v) => typeof v === "string" ? JSON.stringify(v) : Array.isArray(v) ? "a list" : v === null ? "null" : typeof v === "object" ? "an object" : String(v);
/** A block of the schema's shape and within the bounds above, or a throw naming the fault: what an op may put in (ops.ts checkOp). */
function checkBlock(b, what) {
	fitBlock(b, what);
	if (b.k === "li" && !(Number.isInteger(b.depth) && b.depth >= 0 && b.depth <= 64)) throw new RangeError(`${what}.depth is ${b.depth}, not a whole number up to 64`);
	if (b.k === "table" && (b.cols.length < 1 || b.cols.length > MAX_COLS$1 || b.rows.length > 1e5)) throw new RangeError(`${what} is a table of ${b.cols.length} columns and ${b.rows.length} rows`);
}
/** A head key and its value as the header keeps them, or a throw: lower-case letters, digits, "-" and "_" (as the reader reads a key), never "__proto__"; a string the header reads back as given. */
function keptHead(key, value) {
	if (typeof key !== "string" || !KEY.test(key) || key === "__proto__") throw new RangeError(`${says(key)} is no head key`);
	if (value === void 0) return;
	if (typeof value !== "string") throw new RangeError(`${key}'s value is ${says(value)}, not a string`);
	const back = parse(withHead("", { [key]: value })).head;
	if (Object.keys(back).length !== (value ? 1 : 0) || value && back[key] !== value) throw new RangeError(`the head does not keep ${says(value)} under ${key}`);
}
/**
* A document as the text keeps it: written, read back and written the same, or a throw. The writer escapes what it
* can; what it cannot keep (a heading of two lines, a fence named with a space, a list item deeper than the one
* before it leads to) reads back as something else, and a replica holding it would part from one that read the text.
* (What the writer changes and the reader keeps so, a quote in an attribute made an apostrophe, a cell's "<br>" made a
* line break, writes the same from either, and is let be.) An editor's own edit may pass through such a block and settle
* it before the edit is whole (kit/text/textops.ts), so this is asked of a document, not of an op: of a remote entry's
* ops once applied (kit/core/element.ts applyRemote), and of a document from JSON (jsonDoc).
*/
function keptDoc(doc) {
	const text = write(doc);
	if (write(parse(text)) !== text) throw new RangeError("the document does not read back as it is written");
}
/** A document as JSON: stable key order, two-space indent, a line's end at the end. */
var docJson = (doc) => JSON.stringify(fit(ROOT, doc, ""), null, 2) + "\n";
/** JSON as a document; throws when it is not JSON, or not a document, naming the path of the fault. */
function jsonDoc(json) {
	let v;
	try {
		v = JSON.parse(json);
	} catch (e) {
		throw new Error(`Not JSON: ${e.message}`);
	}
	let doc;
	try {
		doc = fit(ROOT, v, "");
	} catch (e) {
		throw new Error(`Not a Tiny Little Office document: ${e.message}`);
	}
	try {
		for (const [k, v] of Object.entries(doc.head)) keptHead(k, v);
		doc.blocks.forEach((b, i) => checkBlock(b, `blocks[${i}]`));
		keptDoc(doc);
	} catch (e) {
		throw new Error(`Not a Tiny Little Office document: ${e.message}`);
	}
	return doc;
}
/**
* A table block as a sheet: its typed columns, its rows of raw cells, the
* cells a reader is to leave be (the lock) and the chart it asks for. A1
* addressing, the lock's ranges, how formulas and the lock follow rows and
* columns that move, and what the sheet's commands write (copy, paste,
* fill, clear, sort) as rectangles of cells for a `cells` op. These are the
* only places the kernel knows about A1 references.
*
* The lock and the chart are not fields of the table block: they ride on
* the document's header for a sheet document (its first table) and on the
* table's own attributes anywhere else. tableAt reads them from where they
* are; withTable writes them back there. A chart is drawn under its table
* unless "chart-at: top" (beside the chart, wherever it is) puts it above.
*/
/** The most rows a reference may name. */
var ROWS = 1e3;
/** One letter a column: A to Z. */
var MAX_COLS = 26;
/** The columns' letters. */
var COL_NAMES = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
var CHARTS = [
	"bar",
	"line",
	"pie",
	"sankey"
];
/** Day number (days since 1970-01-01) of a civil date, time zone free. */
var ymdToDay = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
/** The civil date of a day number; wd is 0 for Sunday. */
function dayToYmd(day) {
	const dt = /* @__PURE__ */ new Date(day * 864e5);
	return {
		y: dt.getUTCFullYear(),
		m: dt.getUTCMonth() + 1,
		d: dt.getUTCDate(),
		wd: dt.getUTCDay()
	};
}
/** "2027-03-01". */
var ymdString = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** "B3" as [row, column], both from 0; null for what is no cell. */
function refToRC(ref) {
	const m = /^([A-Z])(\d+)$/.exec(ref);
	if (!m) return null;
	const row = parseInt(m[2], 10) - 1;
	if (row < 0 || row >= 1e3) return null;
	return [row, m[1].charCodeAt(0) - 65];
}
/** [row, column] as "B3". */
var rcToRef = (row, col) => COL_NAMES[col] + (row + 1);
/** The rectangle with these two corners. */
var rangeOf = (a, b = a) => ({
	r0: Math.min(a[0], b[0]),
	c0: Math.min(a[1], b[1]),
	r1: Math.max(a[0], b[0]),
	c1: Math.max(a[1], b[1])
});
/** A rectangle as "A1:B3", or "A1" for one cell. */
var rangeRef = (g) => g.r0 === g.r1 && g.c0 === g.c1 ? rcToRef(g.r0, g.c0) : `${rcToRef(g.r0, g.c0)}:${rcToRef(g.r1, g.c1)}`;
var inGrid = (r, c) => r >= 0 && r < 1e3 && c >= 0 && c < 26;
var colOf = (letter) => letter.toUpperCase().charCodeAt(0) - 65;
/** The locked ranges, read from "B6:D9, F2": each a rectangle of cells. What is no range is left out. */
function lockedRanges(lock) {
	return lock.split(/[,\s]+/).map((part) => {
		const m = /^([A-Z]\d+)(?::([A-Z]\d+))?$/i.exec(part);
		const a = m && refToRC(m[1].toUpperCase());
		const b = m?.[2] ? refToRC(m[2].toUpperCase()) : a;
		return a && b ? rangeOf(a, b) : null;
	}).filter((g) => !!g);
}
/** The lock as it is written: "B6:D9, F2". */
var lockText = (lock) => lock.map(rangeRef).join(", ");
/** Whether a reader is to leave this cell be. */
var isLocked = (lock, r, c) => lock.some((g) => r >= g.r0 && r <= g.r1 && c >= g.c0 && c <= g.c1);
/** The lock with these cells locked (or, `on` false, with every range that touches them let go). */
function withLock(lock, g, on) {
	const kept = lock.filter((x) => on || x.r1 < g.r0 || x.r0 > g.r1 || x.c1 < g.c0 || x.c0 > g.c1);
	return on ? [...kept, g] : kept;
}
/** The move that moves nothing. */
var stays = (i) => i;
/** Where each row (column) is once n are put in before `at`. */
var movedIn = (at, n) => (i) => i >= at ? i + n : i;
/** Where each row (column) is once `a` to `b` are taken out: null for one of those. */
var movedOut = (a, b) => (i) => i < a ? i : i > b ? i - (b - a + 1) : null;
/** A formula as it reads after moving by (dr, dc): its references move with it. Words in quotes, and other text, are untouched. */
function shiftFormula(raw, dr, dc) {
	if (!raw.startsWith("=") || !dr && !dc) return raw;
	return raw.split(/("[^"]*")/).map((part, i) => i % 2 ? part : part.replace(/\b([A-Za-z])(\d{1,4})\b/g, (whole, col, row) => {
		const at = refToRC(col.toUpperCase() + row);
		if (!at) return whole;
		return inGrid(at[0] + dr, at[1] + dc) ? rcToRef(at[0] + dr, at[1] + dc) : "#REF";
	})).join("");
}
/**
* A formula's references after rows or columns move: `rows(r)` is where
* row r is now, `cols(c)` where column c is, null if it is gone. A range
* keeps what is left of it (taking rows out of its middle shrinks it;
* putting rows in its middle grows it); a reference to a row or column
* that is gone is #REF. Words in quotes are left alone.
*/
function remapRefs(raw, rows, cols, gone = {}) {
	if (!raw.startsWith("=")) return raw;
	/** One end of a range: where its row (column) went, or the nearest still there. */
	const end = (to, at, taken, first) => to(at) ?? (taken ? taken[0] - (first ? 0 : 1) : at);
	return raw.split(/("[^"]*")/).map((part, i) => {
		if (i % 2) return part;
		const ranges = [];
		return part.replace(/\b([A-Za-z])(\d{1,4}):([A-Za-z])(\d{1,4})\b/g, (_, c0, r0, c1, r1) => {
			let [a, b] = [+r0 - 1, +r1 - 1];
			if (a > b) [a, b] = [b, a];
			let [x, y] = [colOf(c0), colOf(c1)];
			if (x > y) [x, y] = [y, x];
			const [na, nb] = [end(rows, a, gone.rows, true), end(rows, b, gone.rows, false)];
			const [nx, ny] = [end(cols, x, gone.cols, true), end(cols, y, gone.cols, false)];
			ranges.push(nb < na || na < 0 || nb >= 1e3 || ny < nx || nx < 0 || ny >= 26 ? "#REF" : `${COL_NAMES[nx]}${na + 1}:${COL_NAMES[ny]}${nb + 1}`);
			return `\u0001${ranges.length - 1}\u0002`;
		}).replace(/\b([A-Za-z])(\d{1,4})\b/g, (_, c, r) => {
			const n = rows(+r - 1);
			const m = cols(colOf(c));
			return n === null || n >= 1e3 || m === null || m >= 26 ? "#REF" : `${COL_NAMES[m]}${n + 1}`;
		}).replace(/\u0001(\d+)\u0002/g, (_, k) => ranges[+k]);
	}).join("");
}
/** The lock after rows or columns move (movedIn, movedOut): each range follows them and keeps what is left of it, and goes when nothing is. */
function remapLock(lock, rows, cols = stays) {
	const kept = (a, b, to, most) => Array.from({ length: b - a + 1 }, (_, i) => to(a + i)).filter((x) => x !== null && x < most);
	return lock.flatMap((g) => {
		const r = kept(g.r0, g.r1, rows, ROWS);
		const c = kept(g.c0, g.c1, cols, 26);
		return r.length && c.length ? [{
			r0: r[0],
			r1: r[r.length - 1],
			c0: c[0],
			c1: c[c.length - 1]
		}] : [];
	});
}
/** The first table block of a document, or -1. */
var firstTable = (doc) => doc.blocks.findIndex((b) => b.k === "table");
/** Whether the table at `at` keeps its lock or chart in the document's header: a sheet document's first table, with none of its own. */
var inHead = (doc, at, key) => attr(doc.blocks[at], key) === void 0 && firstTable(doc) === at;
/** Block `at` as a table; its lock and chart from the block's attrs, else, when it is the document's first table, from the head. Null for no table. */
function tableAt(doc, at) {
	const b = doc.blocks[at];
	if (b?.k !== "table") return null;
	const read = (key) => (inHead(doc, at, key) ? doc.head[key] : attr(b, key)) ?? "";
	const chart = read("chart").toLowerCase();
	const above = (inHead(doc, at, "chart") ? doc.head["chart-at"] : attr(b, "chart-at")) === "top";
	return {
		cols: b.cols,
		rows: b.rows,
		lock: lockedRanges(read("lock")),
		chart: CHARTS.includes(chart) ? chart : "",
		...above ? { above: true } : {}
	};
}
/** The doc with block `at` written from `t`: cells and columns into the block; lock and chart where they were read from. */
function withTable(doc, at, t) {
	const b = doc.blocks[at];
	if (b?.k !== "table") return [];
	const ops = [];
	const kv = { ...b.a?.kv };
	for (const [key, value, home] of [
		[
			"lock",
			lockText(t.lock),
			"lock"
		],
		[
			"chart",
			t.chart,
			"chart"
		],
		[
			"chart-at",
			t.chart && t.above ? "top" : "",
			"chart"
		]
	]) if (inHead(doc, at, home)) {
		if (key !== "chart-at" || (doc.head[key] ?? "") !== value) ops.push({
			op: "head",
			key,
			value: value || void 0
		});
	} else value ? kv[key] = value : delete kv[key];
	const a = {
		...b.a,
		kv
	};
	if (!Object.keys(kv).length) delete a.kv;
	return [{
		op: "splice",
		at,
		n: 1,
		blocks: [{
			k: "table",
			cols: t.cols,
			rows: t.rows.map((r) => t.cols.map((_, c) => r[c] ?? "")),
			...a.id || a.cls || a.kv ? { a } : {}
		}]
	}, ...ops];
}
/** How much of a table is in use: rows down to the last with something in it, columns across to the last with something, a name or a type of its own. */
function usedSize(t) {
	let rows = 0;
	let cols = 0;
	t.rows.forEach((row, r) => row.forEach((v, c) => {
		if (v === "") return;
		rows = Math.max(rows, r + 1);
		cols = Math.max(cols, c + 1);
	}));
	t.cols.forEach((col, c) => (col.name.trim() || col.type !== "text") && (cols = Math.max(cols, c + 1)));
	return {
		rows,
		cols
	};
}
/** A name as a formula writes it: upper case, anything that is not a letter or a digit as "_" ("One-off gifts" is ONE_OFF_GIFTS). */
var nameKey = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
/** The cells with names: each cell of a name column names the cell to its right. The first of a name, reading down, is the one. */
function namedCells(t) {
	const out = /* @__PURE__ */ new Map();
	t.cols.forEach((col, c) => {
		if (col.type !== "name" || c + 1 >= t.cols.length) return;
		t.rows.forEach((row, r) => {
			const key = nameKey(row[c] ?? "");
			if (key && !out.has(key)) out.set(key, [r, c + 1]);
		});
	});
	return out;
}
var cellAt = (t, r, c) => t.rows[r]?.[c] ?? "";
/** The cells of a range as text: tabs between cells, newlines between rows. What spreadsheets put on the clipboard. */
function copyCells(t, g) {
	const rows = [];
	for (let r = g.r0; r <= g.r1; r++) rows.push(Array.from({ length: g.c1 - g.c0 + 1 }, (_, i) => cellAt(t, r, g.c0 + i)).join("	"));
	return rows.join("\n");
}
/** The range emptied. */
var clearCells = (g) => ({
	r: g.r0,
	c: g.c0,
	values: Array.from({ length: g.r1 - g.r0 + 1 }, () => Array(g.c1 - g.c0 + 1).fill(""))
});
/**
* Tab-and-newline text pasted with its top left at (r, c), as the cells it
* writes. `moved` shifts formulas' references (a copy within the sheet);
* `into` repeats a single value over a whole selection. Nothing is written
* past the table's last column or the thousandth row.
*/
function pasteCells(t, r, c, text, moved, into) {
	const rows = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("	"));
	const single = rows.length === 1 && rows[0].length === 1;
	const g = single && into ? into : {
		r0: r,
		c0: c,
		r1: Math.min(999, r + rows.length - 1),
		c1: Math.min(t.cols.length - 1, c + Math.max(...rows.map((x) => x.length)) - 1)
	};
	const values = [];
	for (let y = g.r0; y <= g.r1; y++) {
		const row = [];
		for (let x = g.c0; x <= g.c1; x++) {
			const raw = single ? rows[0][0] : rows[y - r]?.[x - c] ?? "";
			row.push(moved ? shiftFormula(raw, moved.dr + (single ? y - r : 0), moved.dc + (single ? x - c : 0)) : raw);
		}
		values.push(row);
	}
	return {
		r: g.r0,
		c: g.c0,
		values,
		range: g
	};
}
/** Words that are a number (a percentage's sign let be) as that number, else NaN: what a sort counts as a number. */
var numberIn = (s) => /^[+-]?(\d+\.?\d*|\.\d+)%?$/.test(s.trim()) ? parseFloat(s) : NaN;
/**
* Two cells' words in a sort's order, low to high: numbers by their value and before words, words as a reader orders
* them (case and accents aside, "Item 2" before "Item 10"). Neither is empty: where blanks go is the caller's. The
* Spreadsheet's sort (sortRows) and a host's table (kit/ui/table-model.ts) order words by it.
*/
function compareCells(x, y) {
	const nx = numberIn(x), ny = numberIn(y);
	return !isNaN(nx) && !isNaN(ny) ? nx - ny : isNaN(nx) === isNaN(ny) ? (words ??= new Intl.Collator(void 0, {
		numeric: true,
		sensitivity: "base"
	})).compare(x, y) : isNaN(nx) ? 1 : -1;
}
/** The order of words compareCells keeps, made once (`localeCompare` with options makes one a call: a sort of thousands of rows waited on it). */
var words = null;
/**
* The rows in order of column `c`, numbers before words, blanks last, as
* the cells to write from the top. (The names above the columns are not a
* row.) Formulas move with their rows as they are.
*/
function sortRows(t, c, descending = false) {
	const used = usedSize(t).rows;
	const key = (row) => row[c] ?? "";
	return {
		r: 0,
		c: 0,
		values: used < 2 ? t.rows.slice(0, used) : t.rows.slice(0, used).map((row, i) => ({
			row,
			i
		})).sort((a, b) => {
			const x = key(a.row), y = key(b.row);
			if (x === "" || y === "") return x === "" ? y === "" ? a.i - b.i : 1 : -1;
			const d = compareCells(x, y);
			return (descending && x !== "" && y !== "" ? -d : d) || a.i - b.i;
		}).map(({ row }) => row)
	};
}
var MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December"
];
var DAY_NAMES = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday"
];
/** Steps that are all the same: the step, or null. */
var evenStep = (v) => v.length >= 2 && v.every((x, k) => k === 0 || Math.abs(x - v[k - 1] - (v[1] - v[0])) < 1e-9) ? v[1] - v[0] : null;
/**
* What a run of cells goes on as, when dragged further: the k-th cell
* (k counted from the first of the run, negative before it), or null when
* the run is no series and is repeated instead. Numbers in even steps;
* dates by even days, or by whole months when the day stays put (a lone
* date goes a day at a time); words ending in a number ("Week 1", "Q1"),
* a lone one counting up by one; month and weekday names, round the year
* and the week, spelled as they were (full or three letters).
*/
function seriesOf(seed) {
	const cells = seed.map((s) => s.trim());
	if (!cells.length || cells.some((c) => !c || c.startsWith("="))) return null;
	const n = cells.length;
	const nums = cells.map((c) => /^[+-]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(c) && /\d/.test(c) ? parseFloat(c.replace(/,/g, "")) : NaN);
	if (nums.every((v) => !isNaN(v))) {
		const step = evenStep(nums);
		return step === null ? null : (k) => String(Math.round((nums[0] + step * k) * 1e10) / 1e10);
	}
	const ymd = cells.map((c) => /^(\d{4})-(\d\d)-(\d\d)$/.exec(c));
	if (ymd.every(Boolean)) {
		const parts = ymd.map((m) => [
			+m[1],
			+m[2],
			+m[3]
		]);
		const days = parts.map(([y, m, d]) => ymdToDay(y, m, d));
		const months = parts.map(([y, m]) => y * 12 + m - 1);
		const monthStep = n >= 2 && parts.every((p) => p[2] === parts[0][2]) ? evenStep(months) : null;
		if (monthStep) return (k) => {
			const total = months[0] + monthStep * k;
			const [y, m] = [Math.floor(total / 12), total % 12 + 1];
			const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
			return ymdString(y, m, Math.min(parts[0][2], last));
		};
		const step = n === 1 ? 1 : evenStep(days);
		if (step === null) return null;
		return (k) => {
			const { y, m, d } = dayToYmd(days[0] + step * k);
			return ymdString(y, m, d);
		};
	}
	for (const names of [MONTH_NAMES, DAY_NAMES]) {
		const short = cells.every((c) => c.length === 3);
		const idx = cells.map((c) => names.findIndex((x) => (short ? x.slice(0, 3) : x).toLowerCase() === c.toLowerCase()));
		if (idx.every((i) => i >= 0)) {
			const step = n === 1 ? 1 : evenStep(idx);
			if (step === null) return null;
			const upper = cells[0] === cells[0].toUpperCase();
			return (k) => {
				const name = names[((idx[0] + step * k) % names.length + names.length) % names.length];
				const word = short ? name.slice(0, 3) : name;
				return upper ? word.toUpperCase() : cells[0][0] === cells[0][0].toLowerCase() ? word.toLowerCase() : word;
			};
		}
	}
	const tails = cells.map((c) => /^(.*?\D)(\d+)$/.exec(c));
	if (tails.every(Boolean) && tails.every((t) => t[1] === tails[0][1])) {
		const v = tails.map((t) => +t[2]);
		const step = n === 1 ? 1 : evenStep(v);
		if (step === null) return null;
		const width = tails[0][2].startsWith("0") ? tails[0][2].length : 0;
		return (k) => {
			const at = v[0] + step * k;
			return at < 0 ? cells[(k % n + n) % n] : tails[0][1] + String(at).padStart(width, "0");
		};
	}
	return null;
}
/**
* Drag-fill: the cells of `src` carried out to `dest` (which contains it
* and extends one way), as the whole of `dest` to write. Formulas move
* their references; two or more numbers in step carry on counting;
* anything else repeats.
*/
function fillCells(t, src, dest) {
	const values = Array.from({ length: dest.r1 - dest.r0 + 1 }, (_, y) => Array.from({ length: dest.c1 - dest.c0 + 1 }, (_, x) => cellAt(t, dest.r0 + y, dest.c0 + x)));
	const down = dest.r0 < src.r0 || dest.r1 > src.r1;
	const n = down ? src.r1 - src.r0 + 1 : src.c1 - src.c0 + 1;
	for (let line = down ? src.c0 : src.r0; line <= (down ? src.c1 : src.r1); line++) {
		const at = (k) => down ? [src.r0 + k, line] : [line, src.c0 + k];
		const seed = Array.from({ length: n }, (_, k) => cellAt(t, ...at(k)));
		const series = n === 1 && /^[+-]?[\d,.]+$/.test(seed[0].trim()) ? null : seriesOf(seed);
		for (let k = (down ? dest.r0 : dest.c0) - (down ? src.r0 : src.c0); k <= (down ? dest.r1 : dest.c1) - (down ? src.r0 : src.c0); k++) {
			if (k >= 0 && k < n) continue;
			const from = (k % n + n) % n;
			const [r, c] = at(k);
			values[r - dest.r0][c - dest.c0] = series ? series(k) : shiftFormula(seed[from], down ? k - from : 0, down ? 0 : k - from);
		}
	}
	return {
		r: dest.r0,
		c: dest.c0,
		values
	};
}
/**
* Edits as operations on a document. Eight primitives, each pure: `apply`
* gives a new document that shares every block the operation did not touch
* (so a view redraws only what changed), and `invert` gives the operations
* that take the edit back, which is what undo is. Above them, the composed
* edits every editor shares (Enter, Backspace, a family of list items moved
* or indented) return lists of primitives, so undo and tests see primitives
* only.
*
* Rows, columns and cells are table-aware: formulas and the lock follow rows
* and columns that move (table.ts), and a locked cell is left as it is unless
* the op says `force`. An op that cannot apply (a text op on a table, a
* column past Z) throws; a rectangle of cells wider or taller than the table
* is clipped to it.
*/
/** How many characters some runs hold: an icon or a footnote mark counts one. */
var runLength = (runs) => runs.reduce((n, r) => n + (r.ic || r.fn !== void 0 ? 1 : r.t.length), 0);
/** The runs between two character positions, cut where they fall inside a run. */
function sliceRuns(runs, from, to) {
	const out = [];
	let at = 0;
	for (const r of runs) {
		const len = r.ic || r.fn !== void 0 ? 1 : r.t.length;
		const a = Math.max(from, at);
		const b = Math.min(to, at + len);
		if (a < b) out.push(len === 1 && r.t === "" ? r : {
			...r,
			t: r.t.slice(a - at, b - at)
		});
		at += len;
	}
	return out;
}
/** The offset of the first line break among the runs, or -1. */
function lineEnd(runs) {
	let at = 0;
	for (const r of runs) if (isAtomic(r)) at += 1;
	else {
		const i = r.t.indexOf("\n");
		if (i >= 0) return at + i;
		at += r.t.length;
	}
	return -1;
}
var table = (doc, at) => {
	const b = doc.blocks[at];
	if (b?.k !== "table") throw new RangeError(`no table at ${at}`);
	return b;
};
var withBlock = (doc, at, b) => ({
	head: doc.head,
	blocks: doc.blocks.map((x, i) => i === at ? b : x)
});
/** A table's rows after its rows or columns moved: every formula remapped. */
var remapped = (rows, r, c, gone) => rows.map((row) => row.map((v) => remapRefs(v, r, c, gone)));
/** The doc with the table at `at` replaced by `b`, and its lock (head or attr) remapped where that changes its ranges. */
function withMovedTable(doc, at, b, r, c) {
	const lock = tableAt(doc, at).lock;
	const moved = remapLock(lock, r, c);
	if (lockText(moved) === lockText(lock)) return withBlock(doc, at, b);
	const text = lockText(moved);
	if (inHead(doc, at, "lock")) {
		const head = { ...doc.head };
		text ? head.lock = text : delete head.lock;
		return {
			head,
			blocks: withBlock(doc, at, b).blocks
		};
	}
	const kv = { ...b.a?.kv };
	text ? kv.lock = text : delete kv.lock;
	const a = {
		...b.a,
		kv
	};
	if (!Object.keys(kv).length) delete a.kv;
	const { a: _old, ...bare } = b;
	return withBlock(doc, at, {
		...bare,
		...a.id || a.cls || a.kv ? { a } : {}
	});
}
var say = (v) => typeof v === "string" ? JSON.stringify(v) : Array.isArray(v) ? "a list" : v === null ? "null" : typeof v === "object" ? "an object" : String(v);
var whole = (n, what) => {
	if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} is ${say(n)}, not a whole number`);
	return n;
};
/** A list of lists of strings (cells by rows), no row wider than a table may be. */
function grid(v, what, most) {
	if (!Array.isArray(v) || v.length > most) throw new RangeError(`${what} is ${Array.isArray(v) ? `${v.length} rows, past ${most}` : say(v)}`);
	v.forEach((row, i) => {
		if (!Array.isArray(row) || row.length > 26 || row.some((x) => typeof x !== "string")) throw new RangeError(`${what}[${i}] is not a row of at most 26 strings`);
	});
	return v;
}
var tableOf = (doc, at) => {
	const b = doc.blocks[at];
	if (b?.k !== "table") throw new RangeError(`no table at ${at}`);
	return b;
};
/**
* Whether `op` is one `apply` can do to `doc`: its kind one of the eight, every index a whole number within the
* document, and what it puts in (blocks, runs, cells, columns, a head key and value) of the schema's shape and within
* the kernel's bounds (json.ts checkBlock, keptHead). Throws a RangeError or a TypeError naming the fault; `apply` and
* `invert` ask first, so an op from anyone (another's client over a shared document, a program) either does what it
* says or changes nothing. Whether the text keeps what the ops leave is the document's question, asked once the ops
* are applied (json.ts keptDoc), since an editor's own edit may pass through a block the text would not keep.
*/
function checkOp(doc, op) {
	if (!op || typeof op !== "object") throw new TypeError(`an op is an object, not ${say(op)}`);
	const n = doc.blocks.length;
	switch (op.op) {
		case "head":
			keptHead(op.key, op.value);
			return;
		case "splice": {
			const at = whole(op.at, "at");
			const k = whole(op.n, "n");
			if (at + k > n) throw new RangeError(`a splice of ${k} at ${at} is past the ${n} blocks`);
			if (!Array.isArray(op.blocks)) throw new RangeError(`blocks is ${say(op.blocks)}, not a list`);
			op.blocks.forEach((b, i) => checkBlock(b, `blocks[${i}]`));
			return;
		}
		case "move": {
			const at = whole(op.at, "at");
			const k = whole(op.n, "n");
			const to = whole(op.to, "to");
			if (at + k > n || to > n - k) throw new RangeError(`a move of ${k} at ${at} to ${to} is outside the ${n} blocks`);
			return;
		}
		case "text": {
			const at = whole(op.at, "at");
			const from = whole(op.from, "from");
			const to = whole(op.to, "to");
			const b = doc.blocks[at];
			if (!b || !isText(b)) throw new RangeError(`no text at ${at}`);
			const len = runLength(b.runs);
			if (from > to || to > len) throw new RangeError(`[${from}, ${to}) is outside the block's ${len} characters`);
			fitRuns(op.runs, "runs");
			return;
		}
		case "cells": {
			tableOf(doc, whole(op.at, "at"));
			const r = whole(op.r, "r");
			const c = whole(op.c, "c");
			if (r > 1e5 || c >= 26) throw new RangeError(`(${r}, ${c}) is outside any table`);
			if (op.force !== void 0 && op.force !== true) throw new RangeError(`force is ${say(op.force)}`);
			grid(op.values, "values", MAX_ROWS);
			return;
		}
		case "rows": {
			const b = tableOf(doc, whole(op.at, "at"));
			const r = whole(op.r, "r");
			if (op.rows !== void 0) {
				const rows = grid(op.rows, "rows", MAX_ROWS);
				if (r > b.rows.length || b.rows.length + rows.length > 1e5) throw new RangeError(`${rows.length} rows at ${r} do not fit a table of ${b.rows.length}`);
				return;
			}
			const k = whole(op.n, "n");
			if (k < 1 || r + k > b.rows.length) throw new RangeError(`${k} rows at ${r} are not the table's: it has ${b.rows.length}`);
			return;
		}
		case "cols": {
			const b = tableOf(doc, whole(op.at, "at"));
			const c = whole(op.c, "c");
			if (op.cols !== void 0) {
				if (!Array.isArray(op.cols) || c > b.cols.length || b.cols.length + op.cols.length > 26) throw new RangeError(`${Array.isArray(op.cols) ? op.cols.length : say(op.cols)} columns at ${c} do not fit a table of ${b.cols.length}`);
				op.cols.forEach((col, i) => fitColumn(col, `cols[${i}]`));
				return;
			}
			const k = whole(op.n, "n");
			if (k < 1 || c + k > b.cols.length) throw new RangeError(`${k} columns at ${c} are not the table's to take: it has ${b.cols.length}`);
			if (b.cols.length - k < 1) throw new RangeError("a table keeps a column");
			return;
		}
		case "col": {
			const b = tableOf(doc, whole(op.at, "at"));
			const c = whole(op.c, "c");
			if (c >= b.cols.length) throw new RangeError(`no column ${c} in a table of ${b.cols.length}`);
			fitColumn(op.col, "col");
			return;
		}
		default: throw new TypeError(`unknown op ${say(op.op)}`);
	}
}
/** The document with one operation applied, once checkOp has passed it. Pure: untouched blocks are the same objects. */
function apply(doc, op) {
	checkOp(doc, op);
	switch (op.op) {
		case "head": {
			const head = { ...doc.head };
			op.value === void 0 ? delete head[op.key] : head[op.key] = op.value;
			return {
				head,
				blocks: doc.blocks
			};
		}
		case "splice": return {
			head: doc.head,
			blocks: [
				...doc.blocks.slice(0, op.at),
				...op.blocks,
				...doc.blocks.slice(op.at + op.n)
			]
		};
		case "move": {
			const span = doc.blocks.slice(op.at, op.at + op.n);
			const rest = [...doc.blocks.slice(0, op.at), ...doc.blocks.slice(op.at + op.n)];
			return {
				head: doc.head,
				blocks: [
					...rest.slice(0, op.to),
					...span,
					...rest.slice(op.to)
				]
			};
		}
		case "text": {
			const b = doc.blocks[op.at];
			if (!b || !isText(b)) throw new RangeError(`no text at ${op.at}`);
			const runs = normalRuns([
				...sliceRuns(b.runs, 0, op.from),
				...op.runs,
				...sliceRuns(b.runs, op.to, runLength(b.runs))
			]);
			return withBlock(doc, op.at, {
				...b,
				runs
			});
		}
		case "cells": {
			const b = table(doc, op.at);
			const lock = tableAt(doc, op.at).lock;
			let changed = false;
			const rows = b.rows.map((row, r) => {
				const given = op.values[r - op.r];
				if (r < op.r || !given) return row;
				const next = row.map((v, c) => c < op.c || given[c - op.c] === void 0 || !op.force && isLocked(lock, r, c) ? v : given[c - op.c]);
				if (next.every((v, c) => v === row[c])) return row;
				changed = true;
				return next;
			});
			return changed ? withBlock(doc, op.at, {
				...b,
				rows
			}) : doc;
		}
		case "rows": {
			const b = table(doc, op.at);
			if (op.rows) {
				const put = op.rows.map((row) => b.cols.map((_, c) => row[c] ?? ""));
				const moved = movedIn(op.r, put.length);
				return withMovedTable(doc, op.at, {
					...b,
					rows: [
						...remapped(b.rows.slice(0, op.r), moved, stays, {}),
						...put,
						...remapped(b.rows.slice(op.r), moved, stays, {})
					]
				}, moved, stays);
			}
			const last = op.r + op.n - 1;
			const moved = movedOut(op.r, last);
			return withMovedTable(doc, op.at, {
				...b,
				rows: remapped([...b.rows.slice(0, op.r), ...b.rows.slice(last + 1)], moved, stays, { rows: [op.r, last] })
			}, moved, stays);
		}
		case "cols": {
			const b = table(doc, op.at);
			if (op.cols) {
				if (b.cols.length + op.cols.length > 26) throw new RangeError("no column past Z");
				const moved = movedIn(op.c, op.cols.length);
				const put = (row) => [
					...row.slice(0, op.c),
					...op.cols.map(() => ""),
					...row.slice(op.c)
				];
				return withMovedTable(doc, op.at, {
					...b,
					cols: [
						...b.cols.slice(0, op.c),
						...op.cols,
						...b.cols.slice(op.c)
					],
					rows: remapped(b.rows.map(put), stays, moved, {})
				}, stays, moved);
			}
			const last = op.c + op.n - 1;
			if (b.cols.length - op.n < 1) throw new RangeError("a table keeps a column");
			const cut = (row) => [...row.slice(0, op.c), ...row.slice(last + 1)];
			const moved = movedOut(op.c, last);
			return withMovedTable(doc, op.at, {
				...b,
				cols: cut(b.cols),
				rows: remapped(b.rows.map(cut), stays, moved, { cols: [op.c, last] })
			}, stays, moved);
		}
		case "col": {
			const b = table(doc, op.at);
			return withBlock(doc, op.at, {
				...b,
				cols: b.cols.map((c, i) => i === op.c ? op.col : c)
			});
		}
		default: throw new TypeError(`unknown op ${say(op.op)}`);
	}
}
/** Operations applied one after another. */
var applyAll = (doc, ops) => ops.reduce(apply, doc);
/**
* The operations that undo `op` applied to `doc`: usually one. Rows or
* columns put in or taken out are undone by putting the table block back as
* it was (a formula that lost its reference cannot be remapped home), and
* the header's lock with it when the table keeps its lock there.
*/
function invert(doc, op) {
	checkOp(doc, op);
	switch (op.op) {
		case "head": return [{
			op: "head",
			key: op.key,
			value: doc.head[op.key]
		}];
		case "splice": return [{
			op: "splice",
			at: op.at,
			n: op.blocks.length,
			blocks: doc.blocks.slice(op.at, op.at + op.n)
		}];
		case "move": return [{
			op: "move",
			at: op.to,
			n: op.n,
			to: op.at
		}];
		case "text": {
			const b = doc.blocks[op.at];
			if (!b || !isText(b)) throw new RangeError(`no text at ${op.at}`);
			return [{
				op: "text",
				at: op.at,
				from: op.from,
				to: op.from + runLength(op.runs),
				runs: sliceRuns(b.runs, op.from, op.to)
			}];
		}
		case "cells": {
			const values = table(doc, op.at).rows.slice(op.r, op.r + op.values.length).map((row, i) => row.slice(op.c, op.c + (op.values[i]?.length ?? 0)));
			return values.length && values.some((r) => r.length) ? [{
				op: "cells",
				at: op.at,
				r: op.r,
				c: op.c,
				values,
				force: true
			}] : [];
		}
		case "rows":
		case "cols": {
			const b = table(doc, op.at);
			const after = apply(doc, op);
			const back = [{
				op: "splice",
				at: op.at,
				n: 1,
				blocks: [b]
			}];
			if (after.head.lock !== doc.head.lock) back.push({
				op: "head",
				key: "lock",
				value: doc.head.lock
			});
			return back;
		}
		case "col": return [{
			op: "col",
			at: op.at,
			c: op.c,
			col: table(doc, op.at).cols[op.c]
		}];
		default: throw new TypeError(`unknown op ${say(op.op)}`);
	}
}
/** The operations that undo a list applied in order (the inverses, last first). */
function invertAll(doc, ops) {
	const back = [];
	for (const op of ops) {
		back.unshift(...invert(doc, op));
		doc = apply(doc, op);
	}
	return back;
}
/** One splice: the blocks [from, to) replaced. */
var replaceSpan = (_doc, from, to, blocks) => [{
	op: "splice",
	at: from,
	n: to - from,
	blocks
}];
/** Enter: text block `at` becomes two at `offset`. A list item keeps its depth and kind (a task's new item is not done); a heading's second half is a paragraph. */
function splitBlock(doc, at, offset) {
	const b = doc.blocks[at];
	if (!b || !isText(b)) return [];
	const left = sliceRuns(b.runs, 0, offset);
	const right = sliceRuns(b.runs, offset, runLength(b.runs));
	return [{
		op: "splice",
		at,
		n: 1,
		blocks: [{
			...b,
			runs: left
		}, b.k === "li" ? {
			k: "li",
			depth: b.depth,
			...b.ord ? { ord: true } : {},
			...b.done === void 0 ? {} : { done: false },
			runs: right
		} : b.k === "h" ? {
			k: "p",
			runs: right
		} : {
			k: b.k,
			runs: right
		}]
	}];
}
/** Backspace at the start of `at`: its words joined to the text block before it (`joined`). Nothing when either is not text. */
function joinBlocks(doc, at) {
	const prev = doc.blocks[at - 1];
	const b = doc.blocks[at];
	if (!prev || !b || !isText(prev) || !isText(b)) return [];
	return [{
		op: "splice",
		at: at - 1,
		n: 2,
		blocks: joined(prev, b)
	}];
}
/**
* Two blocks of words made one: the first keeps its kind and takes the second's words. A heading is one line, which is
* all the format can write of one (`## …`), so it takes the second's first line and the second keeps the lines after
* it, as the block it was: no line break is lost, and none is held where the text cannot say it.
*/
function joined(first, second) {
	const nl = first.k === "h" ? lineEnd(second.runs) : -1;
	if (nl < 0) return [{
		...first,
		runs: normalRuns([...first.runs, ...second.runs])
	}];
	return [{
		...first,
		runs: normalRuns([...first.runs, ...sliceRuns(second.runs, 0, nl)])
	}, {
		...second,
		runs: sliceRuns(second.runs, nl + 1, runLength(second.runs))
	}];
}
/** How far in a block sits as an item: a list item's depth, a block that says `{depth=N}`, or -1 for one that nests nothing. */
var depthOf = (b) => b.k === "li" ? b.depth : Number.isFinite(Number(attr(b, "depth"))) && attr(b, "depth") !== void 0 ? Number(attr(b, "depth")) : -1;
/** Where item i's family ends: the first later block no deeper than it. The depths may be the caller's own (a lines app counts heading levels). */
function family(doc, i, depths = doc.blocks.map(depthOf)) {
	if (depths[i] < 0) return i + 1;
	let j = i + 1;
	while (j < doc.blocks.length && depths[j] > depths[i]) j++;
	return j;
}
/** A block with its depth moved by `d`, as an item or as a block that says its depth; any other block is itself. */
function deeper(b, d) {
	if (b.k === "li") return d ? {
		...b,
		depth: Math.max(0, b.depth + d)
	} : b;
	const at = attr(b, "depth");
	return at === void 0 || !d ? b : {
		...b,
		a: {
			...b.a,
			kv: {
				...b.a?.kv,
				depth: String(Math.max(0, Number(at) + d))
			}
		}
	};
}
/** Indent (by 1) or bring out (by -1) item i with its family; an item goes at most one deeper than the item above it, and no shallower than the margin. */
function shiftFamily(doc, i, by, depths = doc.blocks.map(depthOf)) {
	if (depths[i] < 0) return null;
	if (by > 0 && (i === 0 || depths[i - 1] < 0 || depths[i] > depths[i - 1])) return null;
	const end = family(doc, i, depths);
	const span = doc.blocks.slice(i, end);
	if (by < 0 && span.some((b) => depthOf(b) === 0)) return null;
	return [{
		op: "splice",
		at: i,
		n: end - i,
		blocks: span.map((b) => deeper(b, by))
	}];
}
/**
* Move item i's family past the family before or after it at its level, as
* one `move`. A lone item with no neighbour at its level steps past a block
* that is no list item but has a depth of its own (a heading, where a lines
* app gives its headings depths), so a line can cross from one section to
* the next; it never steps past its own parent.
*/
function moveFamily(doc, i, by, depths = doc.blocks.map(depthOf)) {
	const end = family(doc, i, depths);
	const n = end - i;
	const lone = n === 1;
	if (by < 0) {
		let p = i - 1;
		while (p >= 0 && depths[p] > depths[i]) p--;
		if (p < 0 || depths[p] < depths[i]) p = lone && i > 0 && depths[i - 1] >= 0 && doc.blocks[i - 1].k !== "li" ? i - 1 : -1;
		return p < 0 ? null : [{
			op: "move",
			at: i,
			n,
			to: p
		}];
	}
	if (end >= doc.blocks.length) return null;
	const next = depths[end] === depths[i] ? family(doc, end, depths) : lone && depths[end] >= 0 && doc.blocks[end].k !== "li" ? end + 1 : -1;
	return next < 0 ? null : [{
		op: "move",
		at: i,
		n,
		to: next - n
	}];
}
/**
* Put item i's family under item `to` (as its last child), or right after
* `to`'s family at `to`'s level: a drag of one thing onto another. Null
* when it makes no sense (onto itself or its own child); under a block that
* is not an item means after it.
*/
function placeFamily(doc, i, to, how, depths = doc.blocks.map(depthOf)) {
	const end = family(doc, i, depths);
	if (to >= i && to < end) return null;
	const n = end - i;
	const rest = {
		head: doc.head,
		blocks: [...doc.blocks.slice(0, i), ...doc.blocks.slice(end)]
	};
	const restDepths = [...depths.slice(0, i), ...depths.slice(end)];
	const at = to < i ? to : to - n;
	if (!rest.blocks[at]) return null;
	if (how === "under" && restDepths[at] < 0) how = "after";
	const d = (how === "under" ? restDepths[at] + 1 : Math.max(0, restDepths[at])) - Math.max(0, depths[i]);
	const where = family(rest, at, restDepths);
	return [{
		op: "splice",
		at: i,
		n,
		blocks: doc.blocks.slice(i, end).map((b) => deeper(b, d))
	}, {
		op: "move",
		at: i,
		n,
		to: where
	}];
}
/** Take item i away; its family comes out a level to sit where it was. */
function removeItem(doc, i, depths = doc.blocks.map(depthOf)) {
	const end = family(doc, i, depths);
	return [{
		op: "splice",
		at: i,
		n: end - i,
		blocks: doc.blocks.slice(i + 1, end).map((b) => deeper(b, -1))
	}];
}
/** A rectangle of cells written at (r, c), the table given the rows it needs first: `rows` then `cells`. */
function putCells(doc, at, r, c, values, force) {
	const b = table(doc, at);
	const need = r + values.length - b.rows.length;
	return [...need > 0 ? [{
		op: "rows",
		at,
		r: b.rows.length,
		n: need,
		rows: Array.from({ length: need }, () => [])
	}] : [], {
		op: "cells",
		at,
		r,
		c,
		values,
		...force ? { force } : {}
	}];
}
/**
* Shared editing: several people, and programs, edit one document at once (docs/kernel.md §12). One server puts their
* operations in one order. A client sends an operation with the version of the document it was made against; the
* server transforms it over every operation appended since, appends it, and tells every client; a client transforms
* its own operations the server has not yet told back over each one it is told of (rebase). Every replica applies the
* server's order, so all end with one document; the transformation is what keeps an op meaning what its author meant
* once others land before it. A single order asks one property of it, which test/doc/sync.test.ts holds for every pair
* of ops: for a and b made against one document, a then transform(b, a, 'right') is b then transform(a, b, 'left').
*
* transform(a, b, side) is a as it applies once b has. `side` is a's place in the order: the server transforms an op it
* receives as 'right' over each it appended after the op's version; a client transforms the server's op as 'left' over
* its own. Where the two set one thing, the right one (the later) wins; where both put something in at one place, the
* left one's comes first. Null means b took away what a acts on (its block, its rows, columns or cells, a move's
* blocks, the blocks a splice replaces), and a is dropped. Blocks have no ids, so everything is by index: blocks,
* characters (an icon or a footnote counts one), rows and columns.
*
*   head × head        another key: independent. The same key: the right's value stands, and the left becomes a write
*                      of that value, which leaves the key as the right set it.
*   an op on a block   (text, cells, rows, cols, col) × splice: after the splice's span it moves by the blocks put in
*                      less those taken out; inside the span it is null (the block was taken out, or replaced).
*                      × move: it follows its block. Ops on different blocks are independent.
*   text × text        on one block. Each is a range [from, to) of characters replaced by its runs. The right op's ends
*                      are carried over the left's: an end before the left's range stays, one after it shifts, one
*                      strictly inside it goes to the left's new words (a start to their end, an end to their start),
*                      one at an edge of it stays outside it, and a start where the left only inserted goes after what
*                      it inserted. So the right op replaces the left's words when its range held the left's whole
*                      range, and otherwise puts its words beside them with its range clipped to the characters still
*                      there. The left op is what brings the other order to the same words: nothing (an empty op)
*                      when the right's range held its own; else the characters of its range outside the right's,
*                      with its words where the right op put them (before the right's, or after); and where those
*                      characters lie on both sides of the right's words (the right's range strictly inside its own),
*                      its range takes the right's words in and its runs put them back after its own. Two insertions
*                      at one offset: the left's first. Disjoint ranges only shift.
*   splice × splice    the same, over blocks: a splice is a range of blocks replaced by its blocks, and the left one
*                      whose span the right's held is null.
*   splice × move      a splice that only puts blocks in sits at a place between blocks: one inside the moved span goes
*                      with it, one elsewhere (its edges too) stays among the rest, and where the span lands, side
*                      decides. A splice that takes blocks out follows them: inside the moved span, with it; holding
*                      the span where it lands among the splice's own blocks, as it was (and the move is null: its
*                      blocks are gone); apart from it, as they close up and open again.
*   move × splice      the moved span takes in what a splice put inside it and loses what one took out of it (null
*                      when nothing is left); its target moves with the rest, and a splice putting blocks in where
*                      the span lands: side decides.
*   move × move        the same span: the right's target (the left does nothing). One span inside the other: the inner
*                      goes with the outer, and the outer moves what is left of itself, or the whole when the inner
*                      lands inside it. Apart: each follows the other's blocks; a span that lands inside the other's
*                      goes along with it. A move that moves nothing moves nothing after anything.
*   cells × cells      on one table, different cells: independent. The same cell: a forced write beats one that is not
*                      (an undo is forced: invert in ops.ts), else the right wins; the loser drops the cell where it
*                      ends a row of its rectangle and writes the winner's value where it does not.
*   cells × rows/cols  the rectangle follows: rows or columns put in before it move it, put in inside it open a gap
*                      (a row of nothing; a column of '', which a new column holds already); rows or columns taken out
*                      drop their cells (null when none is left). Its formulas move as the table's do (remapRefs).
*   rows × rows        as a splice of rows, except that rows put in strictly inside rows taken out are null (one op
*   cols × cols        cannot take out rows on both sides of others), and the taking out grows over them. Two puts at
*                      one place: the left's first. Rows put in carry their formulas as the table's move.
*   rows × cols        rows put in follow the columns: a cell put in where a column is, taken out where one goes.
*   col × cols         its column follows; null when it is taken out. col × col on one column: the right wins.
*   force              on cells, kept.
*
* Two orders of one pair still differ in two places, which no transformation of the ops can reach: the head's keys,
* written in the order they were put in (two keys put in at once, or one taken out while another sets it), and a range
* in a formula or a table's lock that ends in rows (columns) one op takes out, beside rows (columns) the other puts in
* at their edge: apply's remapping grows a range over rows put in inside it and closes it over rows taken out of its
* end, the two do not commute there, and one order's range takes in the rows put in where the other's stops short of
* them, that end apart by as many rows as were put in. What index transformation cannot know is left to rules the
* server and its clients keep (docs/kernel.md §12):
*
*   1. Crossing spans. A splice that takes out some of a moved span's blocks and some others, or into whose span a
*      moved span lands, and two moves whose spans overlap without one holding the other, or that each land inside the
*      other, cannot be brought together by one op on each side: transform throws Conflict. The server refuses the
*      later op and tells its author, whose client takes the server's document again and drops its pending ops.
*   2. A table's columns. Two ops can together take out every column of a table, or put it past Z: the second throws
*      where it is applied, in either order, and the server refuses it alike.
*   3. No lock in the head. A sheet keeps its lock in the head for its first table, rows and columns move it there,
*      and which table is first is the document's to say, not an op's: a shared document keeps its lock on its table's
*      attributes, and the server refuses an op on the head's `lock`. The kernel has no check of this one: the
*      server keeps it (rules 1 and 2 are transform's Conflict and apply's RangeError; rule 4 is the client's).
*   4. The server's order is the document. A client keeps the server's document as far as it has been told (the
*      ordered edits applied) and shows it with its pending ops applied (rebase); applying the server's op, transformed
*      over its pending ones, to what it shows gives the same but for the two places above, so a client that does that
*      takes the server's with its pending ops where they differ, and every client ends with the server's document.
*/
/** Two ops whose spans cross (rule 1 above): no one op on each side brings the two orders to one document. */
var Conflict = class extends Error {
	constructor(a, b) {
		super(`a ${a.op} and a ${b.op} cross: the server refuses the later`);
		this.name = "Conflict";
	}
};
var KINDS = /* @__PURE__ */ new Set([
	"head",
	"splice",
	"move",
	"text",
	"cells",
	"rows",
	"cols",
	"col"
]);
/** `a` as it applies once `b` has, both made against one document; null when `b` took away what `a` acts on. Throws Conflict where their spans cross, and a TypeError for an op of no kind the kernel has. */
function transform(a, b, side) {
	for (const op of [a, b]) if (!op || typeof op !== "object" || !KINDS.has(op.op)) throw new TypeError(`unknown op ${String(op?.op)}`);
	switch (b.op) {
		case "head": return a.op === "head" && a.key === b.key && side === "left" ? {
			op: "head",
			key: a.key,
			...b.value === void 0 ? {} : { value: b.value }
		} : a;
		case "splice":
			if (a.op === "head") return a;
			if (a.op === "splice") return spliceOver(a, b, side);
			if (a.op === "move") return moveOverSplice(a, b, side);
			return a.at < b.at ? a : a.at >= b.at + b.n ? {
				...a,
				at: a.at + b.blocks.length - b.n
			} : null;
		case "move":
			if (a.op === "head") return a;
			if (a.op === "splice") return spliceOverMove(a, b, side);
			if (a.op === "move") return moveOverMove(a, b, side);
			return {
				...a,
				at: blockTo(a.at, b)
			};
		case "text": return a.op === "text" && a.at === b.at ? textOver(a, b, side) : a;
		default: return a.op !== "head" && a.op !== "splice" && a.op !== "move" && a.op !== "text" && a.at === b.at ? overTable(a, b, side) : a;
	}
}
/**
* Ops made one after another on a document (`mine`: a client's pending ops, an undo's) and others made on the same
* document (`theirs`: the server's, in its order): mine as they apply after theirs, and theirs as they apply after
* mine, to be carried on. Each of mine is transformed as 'right' over each of theirs, and theirs as 'left' over the
* one of mine before it moves on to the next, so the later of mine meet it at the indices their own predecessors
* left; one of mine that comes out null is dropped, and theirs still passes over it; one of theirs that comes out
* null passes the rest unchanged, and is left out. Throws Conflict as transform does.
*/
function cross(mine, theirs) {
	const passed = [];
	for (const op of theirs) {
		let t = op;
		const next = [];
		for (const p of mine) {
			if (!t) {
				next.push(p);
				continue;
			}
			const moved = transform(p, t, "right");
			t = transform(t, p, "left");
			if (moved) next.push(moved);
		}
		mine = next;
		if (t) passed.push(t);
	}
	return [mine, passed];
}
/** A client's pending ops (made one after another on its own view) once the server's ops (in the server's order) have been applied before them: `cross`'s first half. */
var rebase = (pending, over) => cross(pending, over)[0];
/** The document after the edits, in order: a snapshot and the ordered edits after it give the document now. */
var applyEdits = (doc, edits) => edits.reduce((d, e) => apply(d, e.op), doc);
/** The right op's range once the left's has been applied: its ends carried over the left's, as the header says. */
function rightOver(r, l) {
	const shift = l.len - (l.to - l.from);
	const start = (p) => p < l.from ? p : p === l.from ? l.from === l.to ? p + l.len : p : p < l.to ? l.from + l.len : p + shift;
	const end = (p) => p <= l.from ? p : p < l.to ? l.from : p + shift;
	const s = start(r.from);
	return [s, Math.max(s, end(r.to))];
}
/**
* The left op's range once the right's has been applied, to end where rightOver has the other order end: null when
* the right's range held the left's (an insertion at its edge excepted); else the left's characters outside the
* right's range, and `holds` when they lie on both sides of the right's new ones, which the range then takes in.
*/
function leftOver(l, r) {
	const insert = l.from === l.to;
	if (r.from <= l.from && l.to <= r.to && !(insert && (l.from === r.from || l.from === r.to))) return null;
	const shift = r.len - (r.to - r.from);
	const at = (p) => p < r.from || p === r.from && !(r.from === r.to && !insert) ? p : p + shift;
	const before = l.from < Math.min(l.to, r.from);
	const after = Math.max(l.from, r.to) < l.to;
	if (before && after) return {
		from: l.from,
		to: at(l.to),
		holds: true
	};
	if (before) return {
		from: l.from,
		to: Math.min(l.to, r.from),
		holds: false
	};
	if (after) return {
		from: at(Math.max(l.from, r.to)),
		to: at(l.to),
		holds: false
	};
	return {
		from: at(l.from),
		to: at(l.from),
		holds: false
	};
}
function textOver(a, b, side) {
	const sa = {
		from: a.from,
		to: a.to,
		len: runLength(a.runs)
	};
	const sb = {
		from: b.from,
		to: b.to,
		len: runLength(b.runs)
	};
	if (side === "right") {
		const [from, to] = rightOver(sa, sb);
		return {
			...a,
			from,
			to
		};
	}
	const l = leftOver(sa, sb);
	if (!l) return {
		...a,
		from: b.from,
		to: b.from,
		runs: []
	};
	return {
		...a,
		from: l.from,
		to: l.to,
		runs: l.holds ? [...a.runs, ...b.runs] : a.runs
	};
}
function spliceOver(a, b, side) {
	const sa = {
		from: a.at,
		to: a.at + a.n,
		len: a.blocks.length
	};
	const sb = {
		from: b.at,
		to: b.at + b.n,
		len: b.blocks.length
	};
	if (side === "right") {
		const [from, to] = rightOver(sa, sb);
		return {
			...a,
			at: from,
			n: to - from
		};
	}
	const l = leftOver(sa, sb);
	if (!l) return null;
	return {
		...a,
		at: l.from,
		n: l.to - l.from,
		blocks: l.holds ? [...a.blocks, ...b.blocks] : a.blocks
	};
}
/** A move that leaves every block where it was; transformed, it moves nothing. */
var still = (m) => m.n === 0 || m.to === m.at;
var nothing = (m) => ({
	...m,
	at: 0,
	n: 0,
	to: 0
});
/** Where block i is once m has moved its span: a block of the span goes with it; the rest close up and open where it lands. */
function blockTo(i, m) {
	if (i >= m.at && i < m.at + m.n) return m.to + i - m.at;
	const r = i < m.at ? i : i - m.n;
	return r < m.to ? r : r + m.n;
}
/** Where a place between blocks is once m has moved its span: inside the span it goes with it; elsewhere, its edges too, it stays among the rest; where the span lands it is before the span when `first`. */
function placeTo(g, m, first) {
	if (g > m.at && g < m.at + m.n) return m.to + g - m.at;
	const r = g <= m.at ? g : g - m.n;
	return r < m.to || r === m.to && first ? r : r + m.n;
}
/** How a splice that takes blocks out sits against a move: inside the moved span, holding it where it lands among the splice's own blocks, apart from it, or across it. */
function relate(s, m) {
	const end = s.at + s.n;
	if (s.at >= m.at && end <= m.at + m.n) return "inside";
	if (m.at >= s.at && m.at + m.n <= end) return m.to >= s.at && m.to <= s.at + s.n - m.n ? "holds" : "across";
	if (end <= m.at || s.at >= m.at + m.n) {
		const r = s.at < m.at ? s.at : s.at - m.n;
		return m.to > r && m.to < r + s.n ? "across" : "apart";
	}
	return "across";
}
function spliceOverMove(a, b, side) {
	if (still(b)) return a;
	if (!a.n) return {
		...a,
		at: placeTo(a.at, b, side === "left")
	};
	switch (relate(a, b)) {
		case "inside": return {
			...a,
			at: b.to + a.at - b.at
		};
		case "holds": return a;
		case "apart": return {
			...a,
			at: blockTo(a.at, b)
		};
		case "across": throw new Conflict(a, b);
	}
}
function moveOverSplice(a, b, side) {
	if (still(a)) return nothing(a);
	const put = b.blocks.length;
	if (!b.n) {
		if (b.at > a.at && b.at < a.at + a.n) return {
			...a,
			n: a.n + put
		};
		const r = b.at <= a.at ? b.at : b.at - a.n;
		return {
			...a,
			at: b.at <= a.at ? a.at + put : a.at,
			to: r < a.to || r === a.to && side === "right" ? a.to + put : a.to
		};
	}
	switch (relate(b, a)) {
		case "inside": {
			const n = a.n - b.n + put;
			return n ? {
				...a,
				n
			} : null;
		}
		case "holds": return null;
		case "apart": {
			const r = b.at < a.at ? b.at : b.at - a.n;
			return {
				...a,
				at: b.at < a.at ? a.at - b.n + put : a.at,
				to: a.to <= r ? a.to : a.to - b.n + put
			};
		}
		case "across": throw new Conflict(a, b);
	}
}
function moveOverMove(a, b, side) {
	if (still(a)) return nothing(a);
	if (still(b)) return a;
	const [a0, a1, b0, b1] = [
		a.at,
		a.at + a.n,
		b.at,
		b.at + b.n
	];
	if (a0 === b0 && a1 === b1) return {
		...a,
		at: b.to,
		to: side === "right" ? a.to : b.to
	};
	if (a0 >= b0 && a1 <= b1) return {
		...a,
		at: b.to + a0 - b0,
		to: placeTo(a.to, {
			...b,
			n: b.n - a.n
		}, side === "left")
	};
	if (b0 >= a0 && b1 <= a1) {
		const rest = a.n - b.n;
		if (b.to > a0 && b.to < a0 + rest) return a;
		const g = b.to <= a0 ? b.to : b.to - rest;
		return {
			...a,
			at: b.to <= a0 ? a0 + b.n : a0,
			n: rest,
			to: a.to < g || a.to === g && side === "left" ? a.to : a.to + b.n
		};
	}
	if (a1 <= b0 || b1 <= a0) {
		const ar = a0 < b0 ? a0 : a0 - b.n;
		const br = b0 < a0 ? b0 : b0 - a.n;
		const bIn = b.to > ar && b.to < ar + a.n;
		if (bIn && a.to > br && a.to < br + b.n) throw new Conflict(a, b);
		if (bIn) return {
			...a,
			at: blockTo(a0, b),
			n: a.n + b.n,
			to: a.to <= br ? a.to : a.to - b.n
		};
		return {
			...a,
			at: blockTo(a0, b),
			to: placeTo(a.to, {
				...b,
				at: br,
				to: b.to <= ar ? b.to : b.to - a.n
			}, side === "left")
		};
	}
	throw new Conflict(a, b);
}
var rowsOf = (o) => ({
	p: o.r,
	k: o.rows ? o.rows.length : o.n,
	put: !!o.rows
});
var colsOf = (o) => ({
	p: o.c,
	k: o.cols ? o.cols.length : o.n,
	put: !!o.cols
});
/** Lines `a` once lines `b` have been put in or taken out. */
function linesOver(a, b, side) {
	if (a.put && b.put) return a.p < b.p || a.p === b.p && side === "left" ? a : {
		...a,
		p: a.p + b.k
	};
	if (a.put) return a.p <= b.p ? a : a.p >= b.p + b.k ? {
		...a,
		p: a.p - b.k
	} : null;
	if (b.put) return b.p <= a.p ? {
		...a,
		p: a.p + b.k
	} : b.p >= a.p + a.k ? a : {
		...a,
		k: a.k + b.k
	};
	const lost = Math.max(0, Math.min(a.p + a.k, b.p + b.k) - Math.max(a.p, b.p));
	return lost === a.k ? null : {
		...a,
		p: a.p < b.p ? a.p : Math.max(b.p, a.p - b.k),
		k: a.k - lost
	};
}
/** Formulas carried over lines put in or taken out, as apply moves the table's own (remapRefs). */
function remap(values, l, axis) {
	const moved = l.put ? movedIn(l.p, l.k) : movedOut(l.p, l.p + l.k - 1);
	const gone = l.put ? {} : axis === "r" ? { rows: [l.p, l.p + l.k - 1] } : { cols: [l.p, l.p + l.k - 1] };
	return values.map((row) => row.map((v) => axis === "r" ? remapRefs(v, moved, stays, gone) : remapRefs(v, stays, moved, gone)));
}
var blank = (k) => Array.from({ length: k }, () => "");
var some = (values) => values.some((row) => row.length);
/** A rectangle without its empty rows at either end. */
function trim(o) {
	let { r, values } = o;
	while (values.length && !values[0].length) [r, values] = [r + 1, values.slice(1)];
	while (values.length && !values[values.length - 1].length) values = values.slice(0, -1);
	return {
		...o,
		r,
		values
	};
}
function cellsOverLines(a, l, axis) {
	let { r, c, values } = a;
	if (axis === "r" && l.put) {
		if (l.p <= r) r += l.k;
		else if (l.p < r + values.length) values = [
			...values.slice(0, l.p - r),
			...Array.from({ length: l.k }, () => []),
			...values.slice(l.p - r)
		];
	} else if (axis === "r") {
		values = values.filter((_, i) => r + i < l.p || r + i >= l.p + l.k);
		r = r < l.p ? r : Math.max(l.p, r - l.k);
	} else if (l.put) {
		if (l.p <= c) c += l.k;
		else values = values.map((row) => l.p - c < row.length ? [
			...row.slice(0, l.p - c),
			...blank(l.k),
			...row.slice(l.p - c)
		] : row);
	} else {
		values = values.map((row) => row.filter((_, j) => c + j < l.p || c + j >= l.p + l.k));
		c = c < l.p ? c : Math.max(l.p, c - l.k);
	}
	if (some(a.values) && !some(values)) return null;
	return trim({
		...a,
		r,
		c,
		values: remap(values, l, axis)
	});
}
function cellsOverCells(a, b, side) {
	if (!a.force !== !b.force ? a.force : side === "right") return a;
	const wrote = (r, c) => r >= b.r && c >= b.c ? b.values[r - b.r]?.[c - b.c] : void 0;
	const values = a.values.map((row, i) => {
		let end = row.length;
		while (end && wrote(a.r + i, a.c + end - 1) !== void 0) end--;
		return row.slice(0, end).map((v, j) => wrote(a.r + i, a.c + j) ?? v);
	});
	return trim({
		...a,
		values
	});
}
function overTable(a, b, side) {
	switch (b.op) {
		case "rows": {
			if (a.op === "cells") return cellsOverLines(a, rowsOf(b), "r");
			if (a.op !== "rows") return a;
			const [la, lb] = [rowsOf(a), rowsOf(b)];
			const moved = linesOver(la, lb, side);
			if (!moved) return null;
			return a.rows ? {
				...a,
				r: moved.p,
				n: moved.k,
				rows: remap(a.rows, linesOver(lb, la, side === "left" ? "right" : "left"), "r")
			} : {
				...a,
				r: moved.p,
				n: moved.k
			};
		}
		case "cols": {
			const l = colsOf(b);
			if (a.op === "cells") return cellsOverLines(a, l, "c");
			if (a.op === "rows") {
				if (!a.rows) return a;
				const rows = a.rows.map((row) => l.put ? l.p < row.length ? [
					...row.slice(0, l.p),
					...blank(l.k),
					...row.slice(l.p)
				] : row : [...row.slice(0, l.p), ...row.slice(l.p + l.k)]);
				return {
					...a,
					rows: remap(rows, l, "c")
				};
			}
			if (a.op === "cols") {
				const moved = linesOver(colsOf(a), l, side);
				return moved && {
					...a,
					c: moved.p,
					n: moved.k
				};
			}
			if (l.put) return a.c >= l.p ? {
				...a,
				c: a.c + l.k
			} : a;
			return a.c < l.p ? a : a.c >= l.p + l.k ? {
				...a,
				c: a.c - l.k
			} : null;
		}
		case "cells": return a.op === "cells" ? cellsOverCells(a, b, side) : a;
		case "col": return a.op === "col" && a.c === b.c && side === "left" ? {
			...a,
			col: b.col
		} : a;
		default: throw new TypeError(`unknown op ${String(b.op)}`);
	}
}
/** The notes some blocks hold, in order of appearance: each note's words, as inline Markdown. */
var notesOf = (blocks) => blocks.flatMap((b) => ("runs" in b ? b.runs : []).filter((r) => r.fn !== void 0).map((r) => r.fn));
/** A note's words as runs (a note inside a note is left out). */
var noteRuns = (fn) => parseInline(fn).filter((r) => r.fn === void 0);
/** Numbers notes as they come: each call is the next number. */
var noteNumbers = (from = 0) => () => ++from;
/** Runs as they are drawn: a note's mark is its number, raised (`sup`), the numbers given by `next` (noteNumbers()). */
var markNotes = (runs, next) => runs.map((r) => r.fn === void 0 ? r : {
	t: String(next()),
	sup: true
});
/**
* A document's notes written the way Markdown's other readers know: "[^n]"
* in the words and "[^n]: the note" paragraphs at the end. For export; the
* document itself keeps the inline form. A document with no notes is itself.
*/
function referenceNotes(doc) {
	const notes = [];
	const blocks = doc.blocks.map((b) => {
		if (!("runs" in b) || !b.runs.some((r) => r.fn !== void 0)) return b;
		const runs = b.runs.map((r) => {
			if (r.fn === void 0) return r;
			notes.push(r.fn);
			return { t: `[^${notes.length}]` };
		});
		return {
			...b,
			runs
		};
	});
	if (!notes.length) return doc;
	return {
		head: doc.head,
		blocks: [...blocks, ...notes.map((n, i) => ({
			k: "p",
			runs: parseInline(`[^${i + 1}]: ${n}`)
		}))]
	};
}
/**
* Numbers a document's ordered lists as they come, as `write` numbers them:
* given each block in turn, it says an ordered item's number. An ordered
* item counts on at its depth across deeper items; a bulleted item resets
* the count at its depth and ends the lists deeper; anything else ends
* them all.
*/
function listNumbers() {
	const counts = [];
	return (b) => {
		if (b.k !== "li") {
			counts.length = 0;
			return;
		}
		counts.length = b.depth + 1;
		counts[b.depth] = b.ord ? (counts[b.depth] ?? 0) + 1 : 0;
		return b.ord ? counts[b.depth] : void 0;
	};
}
/** An address as it may be written in a link: what would end it early is percent-encoded. */
var linkTarget = (url) => url.trim().replace(/[\s()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
/** Whether an address may be a link's target at all. */
var linkable = (url) => /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+|#\S*)$/.test(linkTarget(url));
/** A run's words in pieces, each a link or not: linked words are one link, and a web address in plain words is a link as it stands. */
var runLinks = (r) => r.href ? [{
	t: r.t,
	url: r.href
}] : linkify(r.t);
/** Web addresses in a piece of text. Nothing is stored for a link: an address in the text is a link wherever the text is shown. */
function linkify(text) {
	const out = [];
	let last = 0;
	for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
		const url = m[0].replace(/[.,;:!?)\]]+$/, "");
		if (url.length < 10) continue;
		if (m.index > last) out.push({ t: text.slice(last, m.index) });
		out.push({
			t: url,
			url
		});
		last = m.index + url.length;
	}
	if (last < text.length) out.push({ t: text.slice(last) });
	return out;
}
/** Every function the engine knows: name, example arguments, what it does. */
var FUNCTIONS = [
	[
		"SUM",
		"A1:A5",
		"Add up"
	],
	[
		"AVG",
		"A1:A5",
		"Average"
	],
	[
		"MIN",
		"A1:A5",
		"Smallest"
	],
	[
		"MAX",
		"A1:A5",
		"Largest"
	],
	[
		"COUNT",
		"A1:A5",
		"How many numbers"
	],
	[
		"SUMIF",
		"B1:B9, \"Run\", C1:C9",
		"Add up where the words match"
	],
	[
		"COUNTIF",
		"B1:B9, \"Run\"",
		"How many match"
	],
	[
		"MEDIAN",
		"A1:A5",
		"Middle value"
	],
	[
		"PRODUCT",
		"A1:A5",
		"Multiply together"
	],
	[
		"IF",
		"A1>0, B1, C1",
		"One thing or another"
	],
	[
		"AND",
		"A1>0, B1>0",
		"All true"
	],
	[
		"OR",
		"A1>0, B1>0",
		"Any true"
	],
	[
		"NOT",
		"A1>0",
		"Opposite"
	],
	[
		"ROUND",
		"A1, 2",
		"Round to places"
	],
	[
		"ROUNDUP",
		"A1, 0",
		"Round away from zero"
	],
	[
		"ROUNDDOWN",
		"A1, 0",
		"Round toward zero"
	],
	[
		"INT",
		"A1",
		"Whole part"
	],
	[
		"ABS",
		"A1",
		"Drop the sign"
	],
	[
		"SQRT",
		"A1",
		"Square root"
	],
	[
		"MOD",
		"A1, 3",
		"Remainder"
	],
	[
		"NPV",
		"0.08, B1:B5",
		"Value today of future cash"
	],
	[
		"IRR",
		"A1:A5",
		"Rate of return of cash flows"
	],
	[
		"PMT",
		"0.05/12, 60, 20000",
		"Loan payment per period"
	],
	[
		"FV",
		"0.05, 10, -100",
		"Future value of saving"
	],
	[
		"PV",
		"0.05, 10, -100",
		"Present value of payments"
	],
	[
		"TODAY",
		"",
		"Today's date"
	],
	[
		"DATE",
		"2027, 3, 1",
		"A date from year, month, day"
	],
	[
		"DAYS",
		"B1, A1",
		"Days from one date to another"
	],
	[
		"EDATE",
		"A1, 3",
		"The date some months later"
	],
	[
		"WORKDAYS",
		"A1, B1",
		"Weekdays from one date to another"
	],
	[
		"YEAR",
		"A1",
		"Year of a date"
	],
	[
		"MONTH",
		"A1",
		"Month of a date"
	],
	[
		"DAY",
		"A1",
		"Day of the month"
	],
	[
		"WEEKDAY",
		"A1",
		"Day of the week, 1 = Sunday"
	]
];
/** What a column of a sheet may hold: how its cells are read when typed, and shown. */
var COLUMN_TYPES = [
	{
		id: "text",
		name: "Text",
		hint: "Shown as typed"
	},
	{
		id: "number",
		name: "Number",
		hint: "1,234.5"
	},
	{
		id: "money",
		name: "Money",
		hint: "$1,234.50"
	},
	{
		id: "percent",
		name: "Percent",
		hint: "12.5%"
	},
	{
		id: "date",
		name: "Date",
		hint: "2027-03-01"
	},
	{
		id: "url",
		name: "Link",
		hint: "Opens when clicked"
	},
	{
		id: "check",
		name: "Checkbox",
		hint: "☑ or ☐"
	},
	{
		id: "rich",
		name: "Rich text",
		hint: "Bold, italic and links"
	},
	{
		id: "option",
		name: "Option",
		hint: "One of the words the column already holds, or a new one"
	},
	{
		id: "name",
		name: "Name",
		hint: "Names the cell to its right"
	}
];
/** Days from the spreadsheet epoch (30 December 1899) to 1 January 1970. */
var EPOCH_SERIAL = 25569;
/** A civil date as a spreadsheet's day number. */
var dateToSerial = (y, m, d) => ymdToDay(y, m, d) + EPOCH_SERIAL;
var serialToDate = (serial) => dayToYmd(Math.floor(serial) - EPOCH_SERIAL);
/** Today as a spreadsheet's day number. */
var todaySerial = () => {
	const n = /* @__PURE__ */ new Date();
	return dateToSerial(n.getFullYear(), n.getMonth() + 1, n.getDate());
};
/** A day number as "2027-03-01". */
var serialToIso = (serial) => {
	const { y, m, d } = serialToDate(serial);
	return ymdString(y, m, d);
};
var FormulaError = class extends Error {
	code;
	constructor(code) {
		super(code);
		this.code = code;
	}
};
/** What each operator does to two numbers. Comparisons give 1 or 0. */
var BINARY = {
	"+": (a, b) => a + b,
	"-": (a, b) => a - b,
	"*": (a, b) => a * b,
	"/": (a, b) => a / b,
	"^": (a, b) => Math.pow(a, b),
	"=": (a, b) => +(a === b),
	"<>": (a, b) => +(a !== b),
	"<": (a, b) => +(a < b),
	">": (a, b) => +(a > b),
	"<=": (a, b) => +(a <= b),
	">=": (a, b) => +(a >= b)
};
function tokenize(src) {
	const toks = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === " " || c === "	") {
			i++;
			continue;
		}
		if (/[0-9.]/.test(c)) {
			const m = /^\d*\.?\d+(e[+-]?\d+)?|^\d+\.?/i.exec(src.slice(i));
			if (!m) throw new FormulaError("#ERR");
			toks.push({
				t: "num",
				v: parseFloat(m[0])
			});
			i += m[0].length;
			continue;
		}
		if (c === "\"") {
			const end = src.indexOf("\"", i + 1);
			if (end < 0) throw new FormulaError("#ERR");
			toks.push({
				t: "str",
				v: src.slice(i + 1, end)
			});
			i = end + 1;
			continue;
		}
		if (/[a-z_]/i.test(c)) {
			const m = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i));
			const word = m[0].toUpperCase();
			i += m[0].length;
			if (/^[A-Z]{1,2}\d+$/.test(word)) {
				const r = /^:([a-z]{1,2}\d+)/i.exec(src.slice(i));
				if (r) {
					i += r[0].length;
					toks.push({
						t: "range",
						v: [word, r[1].toUpperCase()]
					});
				} else toks.push({
					t: "ref",
					v: word
				});
			} else if (/^\s*\(/.test(src.slice(i))) toks.push({
				t: "fn",
				v: word
			});
			else toks.push({
				t: "name",
				v: word
			});
			continue;
		}
		if (c === "<" || c === ">" || c === "=") {
			const two = src.slice(i, i + 2);
			const op = two === "<=" || two === ">=" || two === "<>" ? two : c;
			toks.push({
				t: "op",
				v: op
			});
			i += op.length;
			continue;
		}
		if ("+-*/^%(),".includes(c)) {
			toks.push({
				t: "op",
				v: c
			});
			i++;
			continue;
		}
		throw new FormulaError("#ERR");
	}
	return toks;
}
function parseFormula(toks) {
	let p = 0;
	const peek = () => toks[p];
	const next = () => toks[p++];
	const isOp = (v) => peek()?.t === "op" && peek().v === v;
	function primary() {
		const t = next();
		if (!t) throw new FormulaError("#ERR");
		if (t.t === "num") return {
			k: "num",
			v: t.v
		};
		if (t.t === "str") return {
			k: "str",
			v: t.v
		};
		if (t.t === "name") return {
			k: "name",
			v: t.v
		};
		if (t.t === "ref") return {
			k: "ref",
			v: t.v
		};
		if (t.t === "range") return {
			k: "range",
			v: t.v
		};
		if (t.t === "fn") {
			if (!isOp("(")) throw new FormulaError("#NAME");
			next();
			const args = [];
			if (!isOp(")")) {
				args.push(compare());
				while (isOp(",")) {
					next();
					args.push(compare());
				}
			}
			if (!isOp(")")) throw new FormulaError("#ERR");
			next();
			return {
				k: "call",
				fn: t.v,
				args
			};
		}
		if (t.t === "op" && t.v === "(") {
			const e = compare();
			if (!isOp(")")) throw new FormulaError("#ERR");
			next();
			return e;
		}
		if (t.t === "op" && t.v === "-") return {
			k: "neg",
			a: unary()
		};
		if (t.t === "op" && t.v === "+") return unary();
		throw new FormulaError("#ERR");
	}
	function unary() {
		let n = primary();
		while (isOp("%")) {
			next();
			n = {
				k: "bin",
				op: "/",
				a: n,
				b: {
					k: "num",
					v: 100
				}
			};
		}
		return n;
	}
	function power() {
		const a = unary();
		if (isOp("^")) {
			next();
			return {
				k: "bin",
				op: "^",
				a,
				b: power()
			};
		}
		return a;
	}
	/** Operands of `operand` joined by any of `ops`, taken left to right. */
	function leftToRight(operand, ops) {
		let a = operand();
		while (ops.some(isOp)) a = {
			k: "bin",
			op: next().v,
			a,
			b: operand()
		};
		return a;
	}
	const term = () => leftToRight(power, ["*", "/"]);
	const expr = () => leftToRight(term, ["+", "-"]);
	function compare() {
		const a = expr();
		const t = peek();
		if (t?.t === "op" && [
			"=",
			"<>",
			"<",
			">",
			"<=",
			">="
		].includes(t.v)) {
			next();
			return {
				k: "bin",
				op: t.v,
				a,
				b: expr()
			};
		}
		return a;
	}
	const n = compare();
	if (p !== toks.length) throw new FormulaError("#ERR");
	return n;
}
function rangeCells(a, b) {
	const p = refToRC(a);
	const q = refToRC(b);
	if (!p || !q) throw new FormulaError("#REF");
	const out = [];
	for (let r = Math.min(p[0], q[0]); r <= Math.max(p[0], q[0]); r++) for (let c = Math.min(p[1], q[1]); c <= Math.max(p[1], q[1]); c++) out.push([r, c]);
	return out;
}
/** A currency before an amount (its sign kept, before or after it) and after one: a code or a short symbol. */
var MONEY_BEFORE = /^([+-]?)\s*(?:[a-z]{3}|[^\d\s.+-]{1,3})\s*(?=[+-]?\.?\d)/i;
var MONEY_AFTER = /(?<=[\d.])\s*(?:[a-z]{3}|[^\d\s.+-]{1,3})$/i;
/**
* A cell as typed, read as its column's type: a number, a date's day number, a check's 1 or 0, or the words themselves.
* Empty is null. An apostrophe before words that would otherwise read as something else (a formula, a number, a date)
* keeps them words, the apostrophe not among them, as in Excel and Sheets (asWords); before words that read as
* themselves it is theirs ("'Tis"). A rich column's words are inline Markdown, whose own escape is a backslash, and
* are words whatever they say: its cell is never read as a number or a date.
*/
function parseLiteral(raw, type = "text", today = todaySerial) {
	if (raw.startsWith("'") && type !== "rich") {
		const rest = raw.slice(1);
		if (rest.trim() && (rest.startsWith("=") || parseLiteral(rest, type, today) !== rest)) return rest;
	}
	const s = raw.trim();
	if (s === "") return null;
	if (type === "rich") return raw;
	if (type === "check") return /^(x|y|yes|true|1|done|☑|✓|✔)$/i.test(s) ? 1 : 0;
	if (type === "date") {
		const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
		if (iso) return dateToSerial(+iso[1], +iso[2], +iso[3]);
		const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
		if (us) return dateToSerial(+us[3], +us[1], +us[2]);
		if (/^today$/i.test(s)) return today();
	}
	const plain = s.replace(/^([+-]?)\$/, "$1").replace(/(\d),(?=\d{3})/g, "$1");
	const pct = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(plain);
	if (pct && type !== "text") return parseFloat(pct[1]) / 100;
	const n = type === "money" ? plain.replace(MONEY_BEFORE, "$1").replace(MONEY_AFTER, "") : plain;
	if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(n) && (n === s || type === "money" || type === "number" || type === "percent")) return type === "percent" ? parseFloat(n) / 100 : parseFloat(n);
	return raw;
}
/**
* Words written as a cell of a column of `type` that reads back as those words whatever they start with (docs/kernel.md
* §5, Words that look like something else). In a rich column, as inline Markdown (writeInline) with a backslash before
* a "=" at their start, the inline form's own escape ("\=SUM(1)"), its cell being words already ("007"); in any other, as they are where they read as
* themselves already, else with an apostrophe before them ("'=SUM(1)", "'007"), which parseLiteral reads past. Words of
* nothing but spaces are an empty cell, as they are.
*/
function asWords(words, type = "text") {
	if (!words.trim()) return words;
	if (type === "rich") {
		const md = writeInline([{ t: words }]);
		return md.startsWith("=") ? `\\${md}` : md;
	}
	return words.startsWith("=") || parseLiteral(words, type) !== words ? `'${words}` : words;
}
/** Every cell of a table worked out, as `today`'s date has it. A cell past the rows is null. */
function evaluateTable(t, today = todaySerial()) {
	const cache = /* @__PURE__ */ new Map();
	const visiting = /* @__PURE__ */ new Set();
	const named = namedCells(t);
	const types = t.cols.map((c) => c.type);
	const todayIs = () => today;
	function cell(r, c) {
		const key = `${r},${c}`;
		if (cache.has(key)) return cache.get(key);
		if (visiting.has(key)) throw new FormulaError("#CIRC");
		const raw = t.rows[r]?.[c] ?? "";
		let v;
		if (raw.startsWith("=")) {
			visiting.add(key);
			try {
				v = evalNode(parseFormula(tokenize(raw.slice(1))));
			} catch (e) {
				v = e instanceof FormulaError ? e.code : "#ERR";
			} finally {
				visiting.delete(key);
			}
		} else v = parseLiteral(raw, types[c], todayIs);
		cache.set(key, v);
		return v;
	}
	function num(v) {
		if (v === null) return 0;
		if (typeof v === "number") return v;
		if (typeof v === "string" && v.startsWith("#")) throw new FormulaError(v);
		throw new FormulaError("#VALUE");
	}
	function flatten(args) {
		const out = [];
		for (const a of args) if (a.k === "range") for (const [r, c] of rangeCells(a.v[0], a.v[1])) {
			const v = cell(r, c);
			if (typeof v === "number") out.push(v);
			else if (typeof v === "string" && v.startsWith("#")) throw new FormulaError(v);
		}
		else out.push(num(evalNode(a)));
		return out;
	}
	function evalNode(n) {
		switch (n.k) {
			case "num": return n.v;
			case "str": return n.v;
			case "name": {
				const rc = named.get(n.v);
				if (!rc) throw new FormulaError("#NAME");
				return cell(rc[0], rc[1]);
			}
			case "ref": {
				const rc = refToRC(n.v);
				if (!rc) throw new FormulaError("#REF");
				return cell(rc[0], rc[1]);
			}
			case "range": throw new FormulaError("#VALUE");
			case "neg": return -num(evalNode(n.a));
			case "bin": {
				const a = num(evalNode(n.a));
				const b = num(evalNode(n.b));
				if (n.op === "/" && b === 0) throw new FormulaError("#DIV/0");
				return BINARY[n.op](a, b);
			}
			case "call": {
				const xs = () => flatten(n.args);
				const arg = (i, fallback) => {
					if (n.args[i]) return num(evalNode(n.args[i]));
					if (fallback === void 0) throw new FormulaError("#VALUE");
					return fallback;
				};
				switch (n.fn) {
					case "TODAY": return today;
					case "DATE": return dateToSerial(arg(0), arg(1), arg(2));
					case "YEAR": return serialToDate(arg(0)).y;
					case "MONTH": return serialToDate(arg(0)).m;
					case "DAY": return serialToDate(arg(0)).d;
					case "WEEKDAY": return serialToDate(arg(0)).wd + 1;
					case "DAYS": return Math.floor(arg(0)) - Math.floor(arg(1));
					case "EDATE": {
						const { y, m, d } = serialToDate(arg(0));
						const first = new Date(Date.UTC(y, m - 1 + Math.trunc(arg(1)), 1));
						const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
						return dateToSerial(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(d, last));
					}
					case "WORKDAYS": {
						const [a, b] = [Math.floor(arg(0)), Math.floor(arg(1))];
						const [lo, hi] = a <= b ? [a, b] : [b, a];
						if (hi - lo > 2e5) throw new FormulaError("#NUM");
						let count = 0;
						for (let day = lo; day <= hi; day++) if (![0, 6].includes(serialToDate(day).wd)) count++;
						return a <= b ? count : -count;
					}
					case "IF": return arg(0) !== 0 ? n.args[1] ? evalNode(n.args[1]) : 1 : n.args[2] ? evalNode(n.args[2]) : 0;
					case "AND": return xs().every((x) => x !== 0) ? 1 : 0;
					case "OR": return xs().some((x) => x !== 0) ? 1 : 0;
					case "NOT": return arg(0) === 0 ? 1 : 0;
					case "MEDIAN": {
						const v = xs().sort((a, b) => a - b);
						if (!v.length) throw new FormulaError("#NUM");
						return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
					}
					case "PRODUCT": return xs().reduce((s, x) => s * x, 1);
					case "ROUNDUP":
					case "ROUNDDOWN": {
						const f = Math.pow(10, arg(1, 0));
						const v = arg(0) * f;
						return (n.fn === "ROUNDUP" ? Math.sign(v) * Math.ceil(Math.abs(v) - 1e-9) : Math.trunc(v + Math.sign(v) * 1e-9)) / f;
					}
					case "NPV": {
						const [rate, ...flows] = xs();
						return flows.reduce((s, x, i) => s + x / Math.pow(1 + rate, i + 1), 0);
					}
					case "IRR": {
						const flows = xs();
						if (!flows.some((x) => x > 0) || !flows.some((x) => x < 0)) throw new FormulaError("#NUM");
						const npv = (rate) => flows.reduce((s, x, i) => s + x / Math.pow(1 + rate, i), 0);
						let lo = -.99;
						let hi = 10;
						if (npv(lo) * npv(hi) > 0) throw new FormulaError("#NUM");
						for (let i = 0; i < 100; i++) {
							const mid = (lo + hi) / 2;
							if (npv(lo) * npv(mid) <= 0) hi = mid;
							else lo = mid;
						}
						return Math.round((lo + hi) / 2 * 1e10) / 1e10;
					}
					case "PMT": {
						const [rate, nper, pv, fv] = [
							arg(0),
							arg(1),
							arg(2),
							arg(3, 0)
						];
						if (nper === 0) throw new FormulaError("#NUM");
						if (rate === 0) return -(pv + fv) / nper;
						const g = Math.pow(1 + rate, nper);
						return -rate * (pv * g + fv) / (g - 1);
					}
					case "FV": {
						const [rate, nper, pmt, pv] = [
							arg(0),
							arg(1),
							arg(2),
							arg(3, 0)
						];
						if (rate === 0) return -(pv + pmt * nper);
						const g = Math.pow(1 + rate, nper);
						return -(pv * g + pmt * (g - 1) / rate);
					}
					case "PV": {
						const [rate, nper, pmt, fv] = [
							arg(0),
							arg(1),
							arg(2),
							arg(3, 0)
						];
						if (rate === 0) return -(fv + pmt * nper);
						const g = Math.pow(1 + rate, nper);
						return -(fv + pmt * (g - 1) / rate) / g;
					}
					case "SUMIF":
					case "COUNTIF": {
						const [range, test, sums] = n.args;
						if (range?.k !== "range" || !test || n.fn === "SUMIF" && sums?.k !== "range") throw new FormulaError("#VALUE");
						const want = evalNode(test);
						const op = typeof want === "string" ? /^(<>|<=|>=|<|>|=)(.*)$/.exec(want) : null;
						const target = op ? parseLiteral(op[2]) : want;
						const matches = (v) => {
							if (op && op[1] !== "=" && op[1] !== "<>" && typeof target === "number") return typeof v === "number" && BINARY[op[1]](v, target) === 1;
							const same = typeof target === "string" && typeof v === "string" ? v.trim().toLowerCase() === target.trim().toLowerCase() : v === target || v === null && target === "";
							return op?.[1] === "<>" ? !same : same;
						};
						const over = rangeCells(range.v[0], range.v[1]);
						const into = sums?.k === "range" ? rangeCells(sums.v[0], sums.v[1]) : [];
						let total = 0;
						over.forEach(([r, c], i) => {
							if (!matches(cell(r, c))) return;
							if (n.fn === "COUNTIF") return void total++;
							const at = into[i];
							if (!at) return;
							const v = cell(at[0], at[1]);
							if (typeof v === "number") total += v;
							else if (typeof v === "string" && v.startsWith("#")) throw new FormulaError(v);
						});
						return total;
					}
					case "SUM": return xs().reduce((s, x) => s + x, 0);
					case "AVG":
					case "AVERAGE": {
						const v = xs();
						if (!v.length) throw new FormulaError("#DIV/0");
						return v.reduce((s, x) => s + x, 0) / v.length;
					}
					case "MIN":
					case "MAX": {
						const v = xs();
						return v.length ? n.fn === "MIN" ? Math.min(...v) : Math.max(...v) : 0;
					}
					case "COUNT": return xs().length;
					case "ABS": return Math.abs(num(evalNode(n.args[0])));
					case "SQRT": {
						const v = num(evalNode(n.args[0]));
						if (v < 0) throw new FormulaError("#NUM");
						return Math.sqrt(v);
					}
					case "INT": return Math.floor(num(evalNode(n.args[0])));
					case "ROUND": {
						const v = num(evalNode(n.args[0]));
						const f = Math.pow(10, arg(1, 0));
						return Math.round(v * f) / f;
					}
					case "MOD": {
						const a = num(evalNode(n.args[0]));
						const b = num(evalNode(n.args[1]));
						if (b === 0) throw new FormulaError("#DIV/0");
						return a - b * Math.floor(a / b);
					}
				}
				throw new FormulaError("#NAME");
			}
		}
	}
	return {
		values: t.rows.map((row, r) => row.map((_, c) => cell(r, c))),
		named
	};
}
/** The table at block `at` (the document's first, unless said) worked out; null where there is no table. */
function evaluate(doc, at = firstTable(doc), today = todaySerial()) {
	const t = tableAt(doc, at);
	return t && evaluateTable(t, today);
}
/** A worked-out value as words: numbers rounded to what is worth showing, errors as they are, nothing for an empty cell. */
function formatValue(v) {
	if (v === null) return "";
	if (typeof v === "number") {
		if (!isFinite(v)) return "#NUM";
		return Math.abs(v) >= 0x38d7ea4c68000 || Math.abs(v) < 1e-6 && v !== 0 ? v.toExponential(4) : String(Math.round(v * 1e8) / 1e8);
	}
	return v;
}
/**
* An amount of money as a column shows it: two decimals and commas, after the currency's symbol ("$" where none is
* named); a code ("GBP") as the browser writes that currency for its reader (Intl.NumberFormat).
*/
function formatMoney(v, currency = "$") {
	if (/^[A-Z]{3}$/.test(currency)) try {
		return new Intl.NumberFormat(void 0, {
			style: "currency",
			currency
		}).format(v);
	} catch {}
	return (v < 0 ? "-" : "") + currency + Math.abs(v).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}
/** A value as its column shows it: a date, money (in its currency), a percentage, a number with its commas, a check box. */
function formatCell(v, type = "text", currency) {
	if (typeof v !== "number" || !isFinite(v)) return type === "check" && v === null ? "" : formatValue(v);
	const tidy = (n, digits) => n.toLocaleString("en-US", {
		minimumFractionDigits: digits,
		maximumFractionDigits: Math.max(digits, 6)
	});
	if (type === "date") return serialToIso(v);
	if (type === "money") return formatMoney(v, currency || "$");
	if (type === "percent") return tidy(Math.round(v * 1e8) / 1e6, 0) + "%";
	if (type === "number") return Math.abs(v) >= 0x38d7ea4c68000 ? formatValue(v) : tidy(Math.round(v * 1e8) / 1e8, 0);
	if (type === "check") return v ? "☑" : "☐";
	return formatValue(v);
}
/**
* The text layer: a document as what it says, in the order it says it, for whoever cannot see its pages (a screen
* reader on a Display Link), for whoever would rather read it reflowed (the Display Link's Text), for a web page made
* of it (kit/file/exports.ts htmlOf) and for an agent (src/api.ts `text`, as Markdown). A small tree of nodes: headings,
* paragraphs (runs with their marks and links), lists (nested, a task with its state), tables (the values a reader
* sees, worked out), fences as written, a document held in this one, footnotes, and the breaks between pages or slides.
*
* textOf builds it from the blocks every text-shaped app shares (Word Processor, Outliner, Presentation Builder,
* Spreadsheet, Calculator); an app whose model is spatial gives its own in the same shape (kit/core/app.ts
* AppDef.text). A fence naming an app is another document: the host says how to read it (`inner`); with none, it is
* its text as written. textMarkdown writes the nodes as Markdown through the kernel's own writer (TLO is Markdown),
* so read back and written again it is the same bytes. Read-only: nothing here edits a document.
*/
var ARROWS = {
	"->": "→",
	"<-": "←",
	"<->": "↔",
	"--": "—"
};
/** Columns whose cells are words as typed, shown as written unless a formula. */
var WORDS = /* @__PURE__ */ new Set([
	"text",
	"long",
	"name",
	"option",
	"url",
	"icon"
]);
/** Runs for reading: an icon left out, a footnote's mark its number, neighbours with the same marks joined, the ends trimmed. */
function readable(runs, notes) {
	const out = [];
	for (const r of runs) {
		if (r.ic) continue;
		const next = r.fn !== void 0 ? {
			t: String(notes.push(r.fn)),
			note: r.fn
		} : { ...r };
		const last = out[out.length - 1];
		if (last && last.note === void 0 && next.note === void 0 && same$1(last, next)) out[out.length - 1] = {
			...last,
			t: last.t + next.t
		};
		else if (next.t) out.push(next);
	}
	const first = out[0], end = out[out.length - 1];
	if (first && first.note === void 0) out[0] = {
		...first,
		t: first.t.trimStart()
	};
	if (end && end.note === void 0) out[out.length - 1] = {
		...out[out.length - 1],
		t: out[out.length - 1].t.trimEnd()
	};
	return out.filter((r) => r.t);
}
var same$1 = (a, b) => a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s && a.h === b.h && a.c === b.c && a.href === b.href;
/** A table as a reader sees it: each column's name, each cell worked out and formatted, empty rows and nameless empty columns left out. */
function tableNode(doc, at) {
	const b = doc.blocks[at];
	const table = tableAt(doc, at);
	let values = [];
	try {
		values = evaluateTable(table).values;
	} catch {}
	const shown = b.rows.map((row, r) => b.cols.map((col, c) => {
		const raw = row[c] ?? "";
		if (col.type === "rich") return plainText(parseInline(raw));
		const v = values[r]?.[c];
		if (!raw.trim().startsWith("=") && WORDS.has(col.type)) return typeof v === "string" ? v : raw;
		return v === void 0 ? raw : formatCell(v, col.type, col.currency || doc.head.currency);
	}));
	const keep = b.cols.map((col, c) => !!col.name.trim() || shown.some((row) => row[c].trim()));
	return {
		k: "table",
		head: b.cols.filter((_, c) => keep[c]).map((col) => col.name),
		rows: shown.filter((row) => row.some((x) => x.trim())).map((row) => row.filter((_, c) => keep[c]))
	};
}
/** The text layer of a document's blocks. */
function textOf(doc, opts = {}) {
	const out = [];
	const notes = [];
	let open = [];
	let edges = null;
	doc.blocks.forEach((b, at) => {
		if (b.k !== "li") open = [];
		if (b.k !== "edge") edges = null;
		switch (b.k) {
			case "h": {
				const runs = readable(b.runs, notes);
				if (runs.length) out.push({
					k: "h",
					level: Math.min(4, b.level),
					runs
				});
				return;
			}
			case "p": {
				const runs = readable(b.runs, notes);
				if (runs.length) out.push({
					k: "p",
					runs
				});
				return;
			}
			case "quote": {
				const runs = readable(b.runs, notes);
				if (runs.length) out.push({
					k: "quote",
					runs
				});
				return;
			}
			case "li": {
				const item = {
					runs: readable(b.runs, notes),
					...b.done !== void 0 ? { done: b.done } : {}
				};
				while (open.length && open[open.length - 1].depth > b.depth) open.pop();
				const top = open[open.length - 1];
				if (!top) {
					const list = {
						k: "list",
						ord: !!b.ord,
						items: [item]
					};
					out.push(list);
					open = [{
						depth: b.depth,
						list
					}];
				} else if (top.depth === b.depth) top.list.items.push(item);
				else {
					const parent = top.list.items[top.list.items.length - 1];
					parent.list ??= {
						k: "list",
						ord: !!b.ord,
						items: []
					};
					parent.list.items.push(item);
					open.push({
						depth: b.depth,
						list: parent.list
					});
				}
				return;
			}
			case "hr":
				out.push({ k: "break" });
				return;
			case "table":
				out.push(tableNode(doc, at));
				return;
			case "fence":
				if (isImage(b)) {
					const alt = imageOf(b)?.alt.trim();
					alt && out.push({
						k: "p",
						runs: [{ t: alt }]
					});
					return;
				}
				out.push(b.lang && opts.inner?.(b.lang, b.body) || {
					k: "pre",
					lang: b.lang,
					body: b.body
				});
				return;
			case "edge": {
				const item = { runs: [{ t: `${b.from.trim()} ${ARROWS[b.dir]} ${b.to.trim()}${b.label?.trim() ? `: ${b.label.trim()}` : ""}` }] };
				if (edges) edges.items.push(item);
				else out.push(edges = {
					k: "list",
					ord: false,
					items: [item]
				});
				return;
			}
		}
	});
	if (notes.length) out.push({
		k: "notes",
		notes: notes.map((n) => readable(noteRuns(n), []))
	});
	return out;
}
/** Runs as the kernel's again: a footnote's number back to its note. */
var kernelRuns = (runs) => runs.map(({ note, ...r }) => note !== void 0 ? {
	t: "",
	fn: note
} : r);
function blocksOf(nodes) {
	const out = [];
	const items = (list, depth) => {
		for (const it of list.items) {
			out.push({
				k: "li",
				depth,
				...list.ord ? { ord: true } : {},
				...it.done !== void 0 ? { done: it.done } : {},
				runs: kernelRuns(it.runs)
			});
			if (it.list) items(it.list, depth + 1);
		}
	};
	for (const n of nodes) if (n.k === "h") out.push({
		k: "h",
		level: n.level,
		runs: kernelRuns(n.runs)
	});
	else if (n.k === "p" || n.k === "quote") out.push({
		k: n.k,
		runs: kernelRuns(n.runs)
	});
	else if (n.k === "list") items(n, 0);
	else if (n.k === "table") out.push({
		k: "table",
		cols: n.head.map((name) => ({
			name,
			type: "text"
		})),
		rows: n.rows
	});
	else if (n.k === "pre") out.push({
		k: "fence",
		lang: n.lang,
		body: n.body
	});
	else if (n.k === "doc") out.push(...blocksOf(n.nodes));
	else if (n.k === "break") out.push({ k: "hr" });
	return out;
}
/** The text layer as Markdown: what a document says, for an agent or a file; footnotes in the reference form other readers know. */
var textMarkdown = (nodes) => write(referenceNotes({
	head: {},
	blocks: blocksOf(nodes)
}));
var wordsIn = (s) => s.match(/\S+/g)?.length ?? 0;
var runWords = (runs) => wordsIn(runs.map((r) => r.note === void 0 ? r.t : " ").join(""));
/** How many words a reader hears and how many headings they can move between. */
function textCounts(nodes) {
	let words = 0, headings = 0;
	const list = (l) => l.items.forEach((it) => (words += runWords(it.runs), it.list && list(it.list)));
	const walk = (ns) => {
		for (const n of ns) {
			if (n.k === "h") headings++;
			if (n.k === "h" || n.k === "p" || n.k === "quote") words += runWords(n.runs);
			else if (n.k === "list") list(n);
			else if (n.k === "table") words += wordsIn([...n.head, ...n.rows.flat()].join(" "));
			else if (n.k === "pre") words += wordsIn(n.body);
			else if (n.k === "doc") walk(n.nodes);
			else if (n.k === "notes") n.notes.forEach((r) => words += runWords(r));
		}
	};
	walk(nodes);
	return {
		words,
		headings
	};
}
/** The words a reader hears, in order, one space between them: a footnote's mark and the notes left out (a preview's text: kit/share/card.ts). */
function textWords(nodes) {
	const out = [];
	const said = (runs) => out.push(runs.map((r) => r.note === void 0 ? r.t : "").join(""));
	const list = (l) => l.items.forEach((it) => (said(it.runs), it.list && list(it.list)));
	const walk = (ns) => {
		for (const n of ns) if (n.k === "h" || n.k === "p" || n.k === "quote") said(n.runs);
		else if (n.k === "list") list(n);
		else if (n.k === "table") out.push([...n.head, ...n.rows.flat()].join(" "));
		else if (n.k === "pre") out.push(n.body);
		else if (n.k === "doc") walk(n.nodes);
	};
	walk(nodes);
	return out.join(" ").replace(/\s+/g, " ").trim();
}
/** The most cells the subsequence's table may hold (16 MB): past it the two lists are taken as replaced whole, rather than a version from anyone costing the memory of its length squared. */
var MOST = 4e6;
/**
* Two lists of strings, compared: each kept (' '), taken out ('-') or put in ('+'), in the order they read. What the
* two share at their start and end is kept first, so what one edit leaves to compare is small however long the lists.
*/
function diffLines(x, y) {
	let head = 0;
	while (head < x.length && head < y.length && x[head] === y[head]) head++;
	let tail = 0;
	while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail++;
	const kept = (lines) => lines.map((line) => ({
		kind: " ",
		line
	}));
	return [
		...kept(x.slice(0, head)),
		...between(x.slice(head, x.length - tail), y.slice(head, y.length - tail)),
		...kept(x.slice(x.length - tail))
	];
}
/** The longest common subsequence of two lists that share nothing at either end, as the changes between them. */
function between(x, y) {
	const n = x.length;
	const m = y.length;
	if (!n || !m || n * m > MOST) return [...x.map((line) => ({
		kind: "-",
		line
	})), ...y.map((line) => ({
		kind: "+",
		line
	}))];
	const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const out = [];
	let i = 0;
	let j = 0;
	while (i < n || j < m) if (i < n && j < m && x[i] === y[j]) out.push({
		kind: " ",
		line: x[i++]
	}), j++;
	else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) out.push({
		kind: "-",
		line: x[i++]
	});
	else out.push({
		kind: "+",
		line: y[j++]
	});
	return out;
}
/**
* Tracked changes, for any host whose document is written by several people (docs/library.md, Tracked changes and
* comments for a host): the host gives its versions in order, each with its author, and gets back who put in and who
* took out each word, and who changed its formatting. Each version is compared with the one before it, block by block
* (each block by its kind and its words) and, inside a block that changed, word by word. A word put in carries its
* author and the change that put it in; a word taken out stays, carrying who took it out, so it can be drawn struck
* through; a word someone put in and then took out again themself, before anyone reviewed it, is simply gone. A
* change rejected stays in sight as a change of its own (its words struck through as rejected, or words taken out put
* back as restored), for its author and everyone else to accept: the host says which changes were rejected, and which
* reviewed, before each version.
* Formatting is tracked as words are (Paul, 2026-10-16: "When I bold and change formatting you should track that as a
* change"): a word whose marks change (bold, italic, underline, struck, highlighted, code, a link) and a block whose
* kind or alignment changes, its words the same, carry who changed them and what they were, to be drawn, accepted or
* put back; so does a field of the head (the title, the paper). The words are a block's text as the editor counts it
* (an icon or a footnote mark one character, U+FFFC), so a token's place is a place in the editor (kit/text/text.ts
* domPoint), where kit/text/redline.ts draws them. Pure: no DOM, nothing kept between calls.
*/
/** A token's, a block's or a setting's restylings, the latest first, each with what it was and what it made. */
function restylings(x) {
	const out = [];
	let at = x.fmtId && x.fmt ? {
		fmt: x.fmt,
		fmtId: x.fmtId,
		was: x.was,
		wasKind: x.wasKind,
		wasLook: x.wasLook,
		rejected: x.rejected,
		under: x.under
	} : void 0;
	while (at) out.push(at), at = at.under;
	return out;
}
/** The restyling now on top taken off, the one beneath (if any) on top again. */
function popped(x) {
	const { fmt: _f, fmtId: _i, was: _w, wasKind: _k, wasLook: _l, rejected: _r, under, ...rest } = x;
	return under ? {
		...rest,
		fmt: under.fmt,
		fmtId: under.fmtId,
		was: under.was,
		wasKind: under.wasKind,
		wasLook: under.wasLook,
		rejected: under.rejected,
		under: under.under
	} : rest;
}
/** What lies beneath a new restyling: the one there now, if any. */
var beneath = (x) => restylings(x)[0];
/**
* The marks a run carries, as one string: the letters of its marks in order, and its link after a ">" ("bi>https://…");
* an icon or a footnote, what it is ("!ic:star", "!fn:the note's words"), so a note rewritten is a change too.
*/
function marksOf(r) {
	if (r.ic) return `!ic:${r.ic}`;
	if (r.fn !== void 0) return `!fn:${r.fn}`;
	const letters = [
		"b",
		"i",
		"u",
		"s",
		"h",
		"c"
	].filter((k) => r[k]).join("");
	return r.href ? `${letters}>${r.href}` : letters;
}
/** Words with the marks a string of marksOf's names (an icon or a footnote, itself). */
function runOf(t, sig = "") {
	if (sig.startsWith("!ic:")) return {
		t: "",
		ic: sig.slice(4)
	};
	if (sig.startsWith("!fn:")) return {
		t: "",
		fn: sig.slice(4)
	};
	const [letters, href] = sig.split(">");
	const r = { t };
	for (const k of [
		"b",
		"i",
		"u",
		"s",
		"h",
		"c"
	]) if (letters.includes(k)) r[k] = true;
	if (href) r.href = href;
	return r;
}
/** What changed between two strings of marks: "+b" for bold put on, "-i" for italic taken off, "+a" and "-a" for a link. */
function styleDiff(was = "", now = "") {
	if (was.startsWith("!fn:") || now.startsWith("!fn:")) return ["note"];
	if (was.startsWith("!ic:") || now.startsWith("!ic:")) return ["icon"];
	const [a, ha = ""] = was.split(">");
	const [b, hb = ""] = now.split(">");
	const out = [];
	for (const k of "biushc") {
		if (b.includes(k) && !a.includes(k)) out.push(`+${k}`);
		if (a.includes(k) && !b.includes(k)) out.push(`-${k}`);
	}
	if (ha !== hb) out.push(hb ? "+a" : "-a");
	return out;
}
/**
* Everything about a block but its kind and its words, as one string, so that any of it changed is a change: its id,
* classes (alignment, the title, a rule) and attributes, a task's tick, a table's columns, a connection's direction and
* label. Read back by lookTo, to put a block back as it was.
*/
function lookOf(b) {
	const a = b.a ?? {};
	const parts = [];
	if (a.id) parts.push(`#${a.id}`);
	for (const c of a.cls ?? []) parts.push(`.${c}`);
	for (const k of Object.keys(a.kv ?? {})) parts.push(`${k}=${JSON.stringify(a.kv[k])}`);
	if (b.k === "li" && b.done !== void 0) parts.push(b.done ? "+done" : "+todo");
	if (b.k === "table") parts.push(`+cols=${JSON.stringify(b.cols)}`);
	if (b.k === "edge") parts.push(`+dir=${b.dir}`, ...b.label ? [`+label=${JSON.stringify(b.label)}`] : []);
	return parts.join(" ");
}
/** A block with another look (lookOf's string) put on it: its id, classes and attributes, tick, columns, direction. */
function lookTo(b, look) {
	const a = {};
	const out = { ...b };
	if (out.k === "li") delete out.done;
	for (const part of look.match(/(?:[^\s"]+|"(?:\\.|[^"\\])*")+/g) ?? []) if (part.startsWith("#")) a.id = part.slice(1);
	else if (part.startsWith(".")) (a.cls ??= []).push(part.slice(1));
	else if (part === "+done" || part === "+todo") out.done = part === "+done";
	else if (part.startsWith("+cols=") && out.k === "table") out.cols = JSON.parse(part.slice(6));
	else if (part.startsWith("+dir=") && out.k === "edge") out.dir = part.slice(5);
	else if (part.startsWith("+label=") && out.k === "edge") out.label = JSON.parse(part.slice(7));
	else if (part.startsWith("+")) continue;
	else if (part.includes("=")) (a.kv ??= {})[part.slice(0, part.indexOf("="))] = JSON.parse(part.slice(part.indexOf("=") + 1));
	if (a.id || a.cls || a.kv) out.a = a;
	else delete out.a;
	return out;
}
/** A block from its source as written (a card's, kept by the tracking): read after a line of words, so a rule ("---") is not taken for a head's opening. */
var blockFrom = (src) => parse(`x\n\n${src}\n`).blocks[1];
/** A block's kind, from kindOf's name, holding these runs. */
function kindTo(b, kind) {
	const runs = "runs" in b ? b.runs : [];
	if (/^h[1-6]$/.test(kind)) return {
		k: "h",
		level: Number(kind[1]),
		runs,
		...b.a ? { a: b.a } : {}
	};
	if (kind.startsWith("li")) return {
		k: "li",
		depth: parseInt(kind.slice(2)) || 0,
		...kind.endsWith("o") ? { ord: true } : {},
		runs,
		...b.a ? { a: b.a } : {}
	};
	if (kind === "quote") return {
		k: "quote",
		runs,
		...b.a ? { a: b.a } : {}
	};
	if (kind === "p") return {
		k: "p",
		runs,
		...b.a ? { a: b.a } : {}
	};
	return b;
}
/** A document as written, its head's fields in one order: a field's place among them is no part of what it says. */
var same = (d) => write({
	head: Object.fromEntries(Object.entries(d.head).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
	blocks: d.blocks
});
/** A head field (the document's title, paper, look…) tracked as an entry of its own: kind "head:<key>", its value its look. */
var isHead = (b) => b.kind.startsWith("head:");
/** The entry that stands for changes no part of the tracking could say where they are: never empty-handed. */
var OTHER = "head:~";
var ATOM = "￼";
function kindOf(b) {
	if (b.k === "h") return `h${b.level}`;
	if (b.k === "li") return `li${b.depth}${b.ord ? "o" : ""}`;
	if (b.k === "fence") return `fence:${b.lang}`;
	return b.k;
}
/** A block's words as the editor counts them. */
function textOf$1(b) {
	if (b.k === "h" || b.k === "p" || b.k === "li" || b.k === "quote") return b.runs.map((r) => r.ic || r.fn !== void 0 ? ATOM : r.t).join("");
	if (b.k === "fence") return b.body;
	if (b.k === "table") return [b.cols.map((c) => c.name).join(" | "), ...b.rows.map((r) => r.join(" | "))].join("\n");
	if (b.k === "edge") return `${b.from} ${b.to}`;
	return "";
}
/** Words, the spaces between them and each mark of punctuation, each a token: "days." is "days" and ".". */
var tokens = (s) => s.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
/** A block's tokens, each with its marks: a run at a time, so a word bolded is a word with new marks. */
function toksOf(b) {
	if (b.k === "h" || b.k === "p" || b.k === "li" || b.k === "quote") return b.runs.flatMap((r) => r.ic || r.fn !== void 0 ? [{
		t: ATOM,
		m: marksOf(r)
	}] : tokens(r.t).map((t) => ({
		t,
		m: marksOf(r)
	})));
	return tokens(textOf$1(b)).map((t) => ({
		t,
		m: ""
	}));
}
/** A block as the tracking reads it: its kind, its look, its tokens with their marks, its words. */
var TEXT$1 = /^(p|h[1-6]|li\d+o?|quote)$/;
var readBlock = (b) => ({
	kind: kindOf(b),
	look: lookOf(b),
	toks: toksOf(b),
	text: textOf$1(b),
	...TEXT$1.test(kindOf(b)) ? {} : { src: writeBlock(b) }
});
/** What a block is, to tell it changed: its kind, its look and its words with their marks. */
var keyOf = (kind, look, toks) => `${kind}\0${look}\0${toks.map((x) => `${x.t}\u0001${x.m ?? ""}`).join("")}`;
var live = (b) => !b.del;
var liveText = (b) => b.toks.filter((x) => !x.del).map((x) => x.t).join("");
/**
* Two blocks' tokens compared, word by word, and made to read as a person reads an edit: where only spaces stand
* between changes, or words restyled beside them (an italic hint written over, which shares its spaces and perhaps a
* word with what replaces it), those are part of the change, taken out and put in again; and in each stretch of
* changes the words taken out come first, together, then the words put in. So a hint replaced is one replacement,
* not a word taken out and a word put in by turns.
*/
function tidy(was, now) {
	let ia = 0;
	let ib = 0;
	let list = diffLines(was.map((x) => x.t), now.map((x) => x.t)).map((c) => c.kind === " " ? {
		kind: c.kind,
		a: ia++,
		b: ib++
	} : c.kind === "-" ? {
		kind: c.kind,
		a: ia++
	} : {
		kind: c.kind,
		b: ib++
	});
	const restyled = (e) => (was[e.a].m ?? "") !== (now[e.b].m ?? "");
	const loose = (e) => e.kind === " " && (!was[e.a].t.trim() || restyled(e));
	for (let changed = true; changed;) {
		changed = false;
		for (let i = 0; i < list.length; i++) {
			if (!loose(list[i])) continue;
			let j = i;
			while (j < list.length && loose(list[j])) j++;
			const before = i > 0 && list[i - 1].kind !== " ";
			const after = j < list.length && list[j].kind !== " ";
			const edge = i === 0 || j === list.length;
			if (before && after || (before || after) && edge && list.slice(i, j).some(restyled)) {
				list = [
					...list.slice(0, i),
					...list.slice(i, j).flatMap((e) => [{
						kind: "-",
						a: e.a
					}, {
						kind: "+",
						b: e.b
					}]),
					...list.slice(j)
				];
				changed = true;
				break;
			}
			i = j;
		}
	}
	const out = [];
	for (let i = 0; i < list.length;) {
		if (list[i].kind === " ") {
			out.push(list[i++]);
			continue;
		}
		let j = i;
		while (j < list.length && list[j].kind !== " ") j++;
		const stretch = list.slice(i, j);
		out.push(...stretch.filter((e) => e.kind === "-"), ...stretch.filter((e) => e.kind === "+"));
		i = j;
	}
	return out;
}
/** A block's tokens brought to `next`'s words and marks, `by` putting in, taking out and restyling; `touch` hears of each. */
function retoken(b, next, by, mint, rejected, open, touch) {
	const was = b.toks;
	const alive = was.filter((x) => !x.del);
	const now = next.toks;
	let j = 0;
	const out = [];
	let k = 0;
	const flushDead = () => {
		while (k < was.length && was[k].del) out.push(was[k++]);
	};
	let run = "";
	const goesOn = () => {
		const prev = out.at(-1);
		if (prev?.del === by && open(prev.delId)) return prev.delId;
		if (prev && !prev.del && prev.ins === by && open(prev.insId)) return prev.insId;
		if (prev && !prev.del && prev.fmt === by && open(prev.fmtId)) return prev.fmtId;
		const after = was.slice(k).find((x) => !x.del);
		if (after?.ins === by && open(after.insId)) return after.insId;
		if (after?.fmt === by && open(after.fmtId)) return after.fmtId;
		return "";
	};
	for (const c of tidy(alive, now)) {
		if (c.kind === "+") {
			touch();
			run ||= goesOn() || mint();
			const nt = now[j++];
			if (k < was.length && was[k].del && was[k].t === nt.t) {
				const { del: who, delId, ...back } = was[k++];
				out.push(who === by && open(delId) ? {
					...back,
					m: nt.m
				} : {
					...back,
					m: nt.m,
					ins: by,
					insId: run,
					restored: true,
					from: {
						del: who,
						delId,
						m: back.m
					}
				});
			} else out.push({
				t: nt.t,
				m: nt.m,
				ins: by,
				insId: run
			});
			continue;
		}
		flushDead();
		const tok = was[k++];
		if (c.kind === " ") {
			const nt = now[j++];
			if ((tok.m ?? "") === (nt.m ?? "")) {
				run = "";
				out.push(tok);
				continue;
			}
			touch();
			if (tok.ins === by && open(tok.insId)) out.push({
				...tok,
				m: nt.m
			});
			else if (tok.fmt === by && open(tok.fmtId)) out.push(nt.m === tok.was ? {
				...popped(tok),
				m: nt.m
			} : {
				...tok,
				m: nt.m
			});
			else {
				run ||= goesOn() || mint();
				const { rejected: _r, ...rest } = tok;
				out.push({
					...rest,
					m: nt.m,
					fmt: by,
					fmtId: run,
					was: tok.m ?? "",
					under: beneath(tok),
					...rejected(tok.fmtId) ? { rejected: true } : {}
				});
			}
			continue;
		}
		touch();
		run ||= goesOn() || mint();
		if (tok.ins !== by || !open(tok.insId)) out.push({
			...tok,
			del: by,
			delId: run,
			...rejected(tok.insId) ? { rejected: true } : {}
		});
	}
	flushDead();
	return {
		...b,
		toks: out
	};
}
/** A block paired with its next self, its words brought along (retoken) and a change of kind or look, the words the same, tracked. */
function restyle(b, next, by, mint, rejected, open, touch) {
	const r = retoken(b, next, by, mint, rejected, open, touch);
	const look = next.look;
	if (b.kind === next.kind && (b.look ?? "") === look) return r;
	touch();
	const moved = {
		...r,
		kind: next.kind,
		look
	};
	if (b.ins === by && open(b.insId)) return moved;
	if (b.fmt === by && open(b.fmtId)) return next.kind === b.wasKind && look === (b.wasLook ?? "") ? popped(moved) : moved;
	const { rejected: _r, ...rest } = moved;
	return {
		...rest,
		fmt: by,
		fmtId: mint(),
		wasKind: b.kind,
		wasLook: b.look ?? "",
		under: beneath(b),
		...rejected(b.fmtId) ? { rejected: true } : {}
	};
}
/**
* Every version's blocks, tracked from the first given to the last: the head's fields first, each an entry of its
* own, then the blocks. `rejectedBy(id, seq)`: whether a change had been rejected before the version numbered `seq` in
* the host's log (Step's `seq`, its place in the list otherwise); `reviewedBy(id, seq)`: whether anyone had accepted or
* rejected it by then (a change reviewed is closed: an edit beside it is a change of its own). Neither given, nothing
* was.
*/
function track(versions, rejectedBy = () => false, reviewedBy = () => false) {
	if (!versions.length) return [];
	const first = parse(versions[0].text);
	let doc = [...Object.entries(first.head).map(([k, value]) => ({
		kind: `head:${k}`,
		look: value,
		toks: []
	})), ...first.blocks.map((b) => {
		const r = readBlock(b);
		return {
			kind: r.kind,
			look: r.look,
			toks: r.toks,
			...r.src !== void 0 ? { src: r.src } : {}
		};
	})];
	for (const [vi, v] of versions.entries()) if (vi) doc = trackOn(doc, v, vi, rejectedBy, reviewedBy, versions[vi - 1].text);
	return doc;
}
/** The tracked blocks taken one version further: the `vi`th, `v`. (The words being typed and not yet saved are a version too.) */
function trackOn(doc, v, vi, rejectedBy = () => false, reviewedBy = () => false, prev) {
	const by = v.author;
	let touched = false;
	const touch = () => void (touched = true);
	const heads = doc.filter(isHead);
	doc = doc.filter((b) => !isHead(b));
	const open = (id) => !!id && !reviewedBy(id, v.seq ?? vi);
	let n = 0;
	const mint = () => `${v.hash ?? vi}:${n++}`;
	const rejected = (id) => !!id && rejectedBy(id, v.seq ?? vi);
	const parsed = parse(v.text);
	const next = parsed.blocks.map(readBlock);
	const alive = doc.filter(live);
	const out = [];
	let k = 0;
	const flushDead = () => {
		while (k < doc.length && doc[k].del) out.push(doc[k++]);
	};
	const changes = diffLines(alive.map((b) => keyOf(b.kind, b.look ?? "", b.toks.filter((x) => !x.del))), next.map((b) => keyOf(b.kind, b.look, b.toks)));
	let j = 0;
	for (let c = 0; c < changes.length;) {
		if (changes[c].kind === " ") {
			flushDead();
			out.push(doc[k++]);
			j++;
			c++;
			continue;
		}
		const seq = [];
		const come = [];
		while (k < doc.length && doc[k].del) seq.push({
			b: doc[k++],
			dead: true
		});
		for (; c < changes.length && changes[c].kind !== " "; c++) if (changes[c].kind === "-") {
			while (k < doc.length && doc[k].del) seq.push({
				b: doc[k++],
				dead: true
			});
			seq.push({
				b: doc[k++],
				dead: false
			});
		} else come.push(next[j++]);
		const gone = seq.filter((x) => !x.dead).map((x) => x.b);
		let si = 0;
		/** Everything in `seq` up to `g` emitted: the dead as they stand, the others struck; `g` itself left to the caller. */
		const reach = (g) => {
			while (si < seq.length) {
				const e = seq[si++];
				if (e.b === g) return;
				if (e.dead) out.push(e.b);
				else strike(e.b);
			}
		};
		const strike = (g) => {
			touch();
			if (g.ins !== by || !open(g.insId)) out.push({
				...g,
				del: by,
				delId: mint(),
				...rejected(g.insId) ? { rejected: true } : {}
			});
		};
		const left = [...gone];
		for (const n of come) {
			let at = left.findIndex((g) => g.kind === n.kind);
			if (at < 0 && TEXT$1.test(n.kind)) at = left.findIndex((g) => TEXT$1.test(g.kind) && liveText(g) === n.text);
			if (at < 0) {
				const was = seq.slice(si).find((e) => e.dead && e.b.kind === n.kind && liveText(e.b) === n.text);
				if (was) {
					reach(was.b);
					const passed = new Set(seq.slice(0, si).map((e) => e.b));
					for (let i = left.length - 1; i >= 0; i--) if (passed.has(left[i])) left.splice(i, 1);
					touch();
					const { del: who, delId, rejected: _r, ...undead } = was.b;
					if (who === by && open(delId)) {
						out.push(restyle(undead, n, by, mint, rejected, open, touch));
						continue;
					}
					const id = mint();
					const r = restyle(undead, n, by, mint, rejected, open, touch);
					const from = {
						del: who,
						...delId ? { delId } : {}
					};
					out.push({
						...r,
						ins: by,
						insId: id,
						restored: true,
						from,
						...n.src !== void 0 ? {
							src: n.src,
							wasSrc: n.src
						} : {}
					});
					continue;
				}
				touch();
				const prev = out.at(-1);
				const id = prev && !prev.del && prev.ins === by && open(prev.insId) ? prev.insId : mint();
				out.push({
					kind: n.kind,
					look: n.look,
					toks: n.toks.map((x) => ({
						...x,
						ins: by,
						insId: id
					})),
					ins: by,
					insId: id,
					...n.src !== void 0 ? { src: n.src } : {}
				});
				continue;
			}
			const match = left.splice(0, at + 1).pop();
			reach(match);
			const next = restyle(match, n, by, mint, rejected, open, touch);
			if (n.src !== void 0) {
				next.src = n.src;
				next.wasSrc = [match.fmtId, ...match.toks.flatMap((x) => [
					x.insId,
					x.delId,
					x.fmtId
				])].some((id) => id && open(id)) && match.wasSrc !== void 0 ? match.wasSrc : match.src;
			}
			out.push(next);
		}
		reach();
	}
	flushDead();
	const fields = /* @__PURE__ */ new Set([...heads.map((h) => h.kind.slice(5)).filter((k) => k !== "~"), ...Object.keys(parsed.head)]);
	const headsOut = heads.filter((h) => h.kind === OTHER);
	for (const key of fields) {
		const kind = `head:${key}`;
		const old = heads.find((h) => h.kind === kind);
		const was = old?.look ?? "";
		const now = parsed.head[key] ?? "";
		if (was === now) {
			if (old) headsOut.push(old);
			continue;
		}
		touch();
		if (old?.fmt === by && open(old.fmtId)) {
			if (now === (old.wasLook ?? "")) {
				const back = popped({
					...old,
					look: now
				});
				if (now || back.fmtId) headsOut.push(back);
			} else headsOut.push({
				...old,
				look: now
			});
		} else headsOut.push({
			kind,
			look: now,
			toks: [],
			fmt: by,
			fmtId: mint(),
			wasLook: was,
			under: old ? beneath(old) : void 0,
			...rejected(old?.fmtId) ? { rejected: true } : {}
		});
	}
	if (!touched && prev !== void 0 && same(parse(prev)) !== same(parsed)) headsOut.push({
		kind: OTHER,
		look: "",
		toks: [],
		fmt: by,
		fmtId: mint(),
		wasLook: ""
	});
	return [...headsOut, ...out];
}
/** Every change the tracked blocks hold, in the order they read. */
function changesOf(doc) {
	const out = /* @__PURE__ */ new Map();
	const how = /* @__PURE__ */ new Map();
	const last = /* @__PURE__ */ new Map();
	let bi = 0;
	let ti = -1;
	/**
	* What lies between a change's last words of a kind and these, as they read: nothing where they touch; a line
	* between blocks; a space where only spaces stand between (and the change's own other words: a replacement's put in
	* between the words it took out); an ellipsis for words of no part of it.
	*/
	const between = (id, kind) => {
		const was = last.get(`${id}\0${kind}`);
		if (ti >= 0) last.set(`${id}\0${kind}`, {
			bi,
			ti
		});
		if (!was || ti < 0) return "";
		if (was.bi !== bi) return "\n";
		const gap = doc[bi].toks.slice(was.ti + 1, ti).filter((x) => kind === "took" ? x.insId !== id : !x.del).map((x) => x.t).join("");
		return !gap ? "" : gap.trim() ? " … " : " ";
	};
	const add = (id, author, kind, t, h = "edit", styles = []) => {
		if (!id || !author) return;
		const c = out.get(id) ?? {
			id,
			author,
			put: "",
			took: "",
			styled: "",
			styles: [],
			kind: "edit"
		};
		if (t) c[kind] += between(id, kind) + t;
		for (const st of styles) if (!c.styles.includes(st)) c.styles.push(st);
		out.set(id, c);
		how.set(id, (how.get(id) ?? /* @__PURE__ */ new Set()).add(h));
	};
	for (const [i, b] of doc.entries()) {
		bi = i;
		ti = -1;
		if (isHead(b)) {
			let now = b.look ?? "";
			for (const u of restylings(b)) {
				add(u.fmtId, u.fmt, "styled", "", u.rejected ? "rejection" : "format", [b.kind === "head:~" ? "other" : `${b.kind}:${u.wasLook ?? ""}>${now}`]);
				now = u.wasLook ?? "";
			}
			continue;
		}
		if (b.insId && b.ins) add(b.insId, b.ins, "put", b.restored ? liveText(b) : "", b.restored ? "restore" : "edit", [`+block:${b.kind}`]);
		if (b.from?.delId) add(b.from.delId, b.from.del, "took", liveText(b), "edit", [`-block:${b.kind}`]);
		if (b.delId && b.del) add(b.delId, b.del, "took", "", b.rejected ? "rejection" : "edit", [`-block:${b.kind}`]);
		if (b.fmtId) {
			let kind = b.kind;
			let look = b.look ?? "";
			for (const u of restylings(b)) {
				const styles = [...u.wasKind !== kind ? [`kind:${u.wasKind}>${kind}`] : [], ...(u.wasLook ?? "") !== look ? [`look:${u.wasLook ?? ""}>${look}`] : []];
				add(u.fmtId, u.fmt, "styled", liveText(b), u.rejected ? "rejection" : "format", styles);
				kind = u.wasKind ?? kind;
				look = u.wasLook ?? "";
			}
		}
		for (const [k, tok] of b.toks.entries()) {
			ti = k;
			if (tok.fmtId && !tok.del) {
				let now = tok.m ?? "";
				for (const u of restylings(tok)) {
					add(u.fmtId, u.fmt, "styled", tok.t, u.rejected ? "rejection" : "format", styleDiff(u.was, now));
					now = u.was ?? "";
				}
			}
			add(tok.insId, tok.ins, "put", tok.t, tok.restored ? "restore" : "edit");
			if (tok.from?.delId) add(tok.from.delId, tok.from.del, "took", tok.t);
			if (tok.delId) add(tok.delId, tok.del, "took", tok.t, tok.rejected ? "rejection" : "edit");
			else if (b.delId) add(b.delId, b.del, "took", tok.t);
		}
	}
	for (const c of out.values()) {
		const h = how.get(c.id);
		const blocks = c.styles.some((x) => x.startsWith("+block:") || x.startsWith("-block:"));
		c.kind = h.has("rejection") ? "rejection" : h.has("restore") ? "restore" : !c.put && !c.took && !blocks ? "format" : "edit";
	}
	return [...out.values()];
}
/** Blocks of words: kinds whose tokens are the editor's words. */
var TEXT = /^(p|h[1-6]|li\d+o?|quote)$/;
/** A tracked block's words still standing. */
var standing = (b) => b.toks.filter((x) => !x.del).map((x) => x.t).join("");
/** The tracked blocks still standing, by their index among `tracked`, paired with the editor's blocks where their words read the same. */
function align(tracked, blocks) {
	const up = tracked.flatMap((b, i) => !b.del && !isHead(b) ? [i] : []);
	const out = /* @__PURE__ */ new Map();
	let i = 0;
	let j = 0;
	for (const c of diffLines(up.map((k) => standing(tracked[k])), blocks.map((b) => textOf$1(b)))) if (c.kind === " ") out.set(up[i++], j++);
	else if (c.kind === "-") i++;
	else j++;
	return out;
}
/**
* Of a stack of restylings (the latest first), what rejecting the changes `of` names puts back: the latest ones
* rejected, down to the first that is not, give back what the last of them was; none on top rejected, nothing; and
* `false` where one beneath is, since a restyling beneath another cannot be rejected while that one stands.
*/
function restyledBack(levels, of) {
	let back = null;
	for (let i = 0; i < levels.length && of(levels[i].fmtId); i++) back = levels[i];
	if (!back && levels.some((u) => of(u.fmtId))) return false;
	return back;
}
/** Words with their marks as they were where their restylings are rejected too; null where one cannot be. */
function asWas(toks, of) {
	const out = [];
	for (const x of toks) {
		const back = restyledBack(restylings(x), of);
		if (back === false) return null;
		out.push(back ? {
			...x,
			m: back.was ?? ""
		} : x);
	}
	return out;
}
/** Runs from words, each with its marks, neighbors with the same marks joined. */
function runsOf(toks) {
	const out = [];
	const plain = (x) => !x.ic && x.fn === void 0;
	for (const tok of toks) {
		const r = runOf(tok.t, tok.m ?? "");
		const last = out.at(-1);
		if (last && plain(r) && plain(last) && JSON.stringify({
			...last,
			t: ""
		}) === JSON.stringify({
			...r,
			t: ""
		})) last.t += r.t;
		else out.push(r);
	}
	return out;
}
/** A block taken out, as it was: its kind, look and words with their marks, the changes in it rejected too undone. */
function blockBack(b, of) {
	if (b.src !== void 0) return blockFrom((restylings(b).some((u) => of(u.fmtId)) || b.toks.some((x) => of(x.insId) || of(x.delId) || restylings(x).some((u) => of(u.fmtId)))) && b.wasSrc !== void 0 ? b.wasSrc : b.src) ?? null;
	const restyled = restyledBack(restylings(b), of);
	if (restyled === false) return null;
	const kind = restyled ? restyled.wasKind ?? b.kind : b.kind;
	const look = restyled ? restyled.wasLook ?? "" : b.look ?? "";
	const words = asWas(b.toks.filter((x) => !of(x.insId) && (!x.del || x.delId === b.delId || of(x.delId))), of);
	if (!words) return null;
	const text = words.map((x) => x.t).join("");
	let block;
	if (kind.startsWith("fence:")) block = {
		k: "fence",
		lang: kind.slice(6),
		body: text
	};
	else if (kind === "hr") block = { k: "hr" };
	else block = kindTo({
		k: "p",
		runs: runsOf(words)
	}, kind);
	return lookTo(block, look);
}
/**
* The operations that reject the changes `ids` of `tracked` (track's blocks), made against `blocks`, the editor's
* blocks as they are now (the document the host's versions end in, or the words being typed): null where they cannot
* be made (the header). Rejecting every change of a version gives back the version before it; rejecting some leaves
* the others' words as they are, but on a card, which is put back whole.
*/
function rejectOps(tracked, blocks, ids) {
	const of = (x) => !!x && ids.includes(x);
	const at = align(tracked, blocks);
	const ops = [];
	for (const [ti, b] of tracked.entries()) {
		if (isHead(b)) {
			if (!restylings(b).some((u) => of(u.fmtId))) continue;
			if (b.kind === "head:~") return null;
			const back = restyledBack(restylings(b), of);
			if (back === false) return null;
			if (back) ops.push({
				ti,
				block: Infinity,
				from: 0,
				op: {
					op: "head",
					key: b.kind.slice(5),
					value: back.wasLook || void 0
				}
			});
			continue;
		}
		if (b.del && of(b.delId)) {
			if (of(b.insId)) continue;
			const back = blockBack(b, of);
			if (!back) return null;
			const next = [...at.entries()].find(([t]) => t > ti);
			const where = next ? next[1] : blocks.length;
			ops.push({
				ti,
				block: where,
				from: -1,
				op: {
					op: "splice",
					at: where,
					n: 0,
					blocks: [back]
				}
			});
			continue;
		}
		if (b.del) continue;
		const ei = at.get(ti);
		if (ei === void 0) {
			if (of(b.insId) || of(b.fmtId) || b.toks.some((x) => of(x.insId) || of(x.delId) || of(x.fmtId))) return null;
			continue;
		}
		if (b.restored && of(b.insId) && !of(b.from?.delId)) {
			ops.push({
				ti,
				block: ei,
				from: Infinity,
				op: {
					op: "splice",
					at: ei,
					n: 1,
					blocks: []
				}
			});
			continue;
		}
		if (of(b.insId) && !(b.restored && of(b.from?.delId)) && b.toks.every((x) => of(x.insId) || x.del)) {
			ops.push({
				ti,
				block: ei,
				from: Infinity,
				op: {
					op: "splice",
					at: ei,
					n: 1,
					blocks: []
				}
			});
			continue;
		}
		if (!TEXT.test(b.kind) && (restylings(b).some((u) => of(u.fmtId)) || b.toks.some((x) => of(x.insId) || of(x.delId) || restylings(x).some((u) => of(u.fmtId))))) {
			const was = b.wasSrc !== void 0 ? blockFrom(b.wasSrc) : void 0;
			if (!was) return null;
			ops.push({
				ti,
				block: ei,
				from: Infinity,
				op: {
					op: "splice",
					at: ei,
					n: 1,
					blocks: [was]
				}
			});
			continue;
		}
		const restyled = restyledBack(restylings(b), of);
		if (restyled === false) return null;
		if (restyled) ops.push({
			ti,
			block: ei,
			from: Infinity,
			op: {
				op: "splice",
				at: ei,
				n: 1,
				blocks: [lookTo(kindTo(blocks[ei], restyled.wasKind ?? b.kind), restyled.wasLook ?? "")]
			}
		});
		let off = 0;
		let back = null;
		let stuck = false;
		const putBack = () => {
			const words = back && asWas(back.toks, of);
			if (back && !words) stuck = true;
			if (back && words) ops.push({
				ti,
				block: ei,
				from: back.from,
				op: {
					op: "text",
					at: ei,
					from: back.from,
					to: back.from,
					runs: runsOf(words)
				}
			});
			back = null;
		};
		for (const tok of b.toks) {
			const n = tok.t.length;
			if (tok.del) {
				if (of(tok.delId) && !of(tok.insId)) back = back ? {
					from: back.from,
					toks: [...back.toks, tok]
				} : {
					from: off,
					toks: [tok]
				};
				continue;
			}
			putBack();
			if (of(tok.insId) && !(tok.restored && tok.from && (of(tok.from.delId) || !tok.from.delId))) ops.push({
				ti,
				block: ei,
				from: off,
				op: {
					op: "text",
					at: ei,
					from: off,
					to: off + n,
					runs: []
				}
			});
			else if (of(tok.insId)) {
				if ((tok.from?.m ?? "") !== (tok.m ?? "")) ops.push({
					ti,
					block: ei,
					from: off,
					op: {
						op: "text",
						at: ei,
						from: off,
						to: off + n,
						runs: [runOf(tok.t, tok.from?.m ?? "")]
					}
				});
			} else {
				const was = restyledBack(restylings(tok), of);
				if (was === false) return null;
				if (was) ops.push({
					ti,
					block: ei,
					from: off,
					op: {
						op: "text",
						at: ei,
						from: off,
						to: off + n,
						runs: [runOf(tok.t, was.was ?? "")]
					}
				});
			}
			off += n;
		}
		putBack();
		if (stuck) return null;
	}
	const goesBack = (x) => Number(x.op.op === "text" && x.op.from === x.op.to);
	return ops.sort((a, b) => b.block - a.block || b.from - a.from || b.ti - a.ti || goesBack(a) - goesBack(b)).map((x) => x.op);
}
export { COLUMN_TYPES, COL_NAMES, Conflict, FUNCTIONS, IMAGE_LANG, MAX_COLS, MAX_DEPTH, OTHER, ROWS, apply, applyAll, applyEdits, asWords, attr, balanceNote, blockFrom, changesOf, checkOp, clearCells, column, columnText, columnsOf, compareCells, copyCells, cross, currencyOf, dateToSerial, dayToYmd, depthOf, diffLines, docJson, escapeInline, evaluate, evaluateTable, family, fenceRef, fillCells, firstTable, formatCell, formatMoney, formatValue, hasClass, imageBlock, imageOf, imageRefs, inHead, invert, invertAll, isAtomic, isHead, isImage, isInnerDoc, isLocked, isRule, isText, joinBlocks, jsonDoc, keptDoc, kindTo, linkTarget, linkable, linkify, listNumbers, lockText, lockedRanges, lookOf, lookTo, markNotes, marksOf, moveFamily, movedIn, movedOut, nameKey, namedCells, normalRuns, noteNumbers, noteRuns, notesOf, pages, parse, parseInline, parseLines, parseLiteral, pasteCells, placeFamily, plainText, putCells, rangeOf, rangeRef, rcToRef, rebase, refFence, refToRC, referenceNotes, rejectOps, remapLock, removeItem, replaceSpan, restylings, rule, runLength, runLinks, runOf, sayableRuns, sections, serialToIso, seriesOf, shiftFamily, shiftFormula, sliceRuns, sortRows, splitAttrs, splitBlock, tableAt, takeHead, text, textCounts, textMarkdown, textOf, textWords, todaySerial, track, trackOn, transform, usedSize, withAlign, withHead, withLock, withTable, write, writeBlock, writeInline, ymdString, ymdToDay };
