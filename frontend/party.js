// Built from web/window/party.ts by `npm run build` (vite.config.ts): change it there.
import { openPrefs } from "./prefs.js";
const App = () => window.go.main.App;
const sheet = document.getElementById("sheet");
const el = (tag, props = {}, ...kids) => {
	const e = Object.assign(document.createElement(tag), props);
	e.append(...kids);
	return e;
};
function show(opts) {
	sheet.textContent = "";
	const form = el("form", { className: "sheet-box" });
	const error = el("p", { className: "sheet-error" });
	const inputs = {};
	const labels = {};
	form.append(el("h1", { textContent: opts.title }));
	if (opts.words) form.append(el("p", {
		className: "sheet-words",
		textContent: opts.words
	}));
	for (const f of opts.fields) {
		let input;
		if (f.kind === "check") {
			const box = Object.assign(document.createElement("input"), {
				type: "checkbox",
				name: f.name
			});
			inputs[f.name] = box;
			const label = el("label", { className: "sheet-check" }, box, el("span", { textContent: f.label }));
			label.hidden = !!f.hidden;
			labels[f.name] = label;
			form.append(label);
			continue;
		}
		if (f.kind === "text") {
			const area = document.createElement("textarea");
			area.spellcheck = false;
			area.rows = 16;
			input = area;
		} else {
			const field = document.createElement("input");
			field.type = f.kind === "line" ? "text" : "password";
			field.autocomplete = "off";
			field.spellcheck = false;
			input = field;
		}
		input.name = f.name;
		inputs[f.name] = input;
		const label = el("label", {}, el("span", { textContent: f.label }), input);
		label.hidden = !!f.hidden;
		labels[f.name] = label;
		form.append(label);
	}
	const go = el("button", {
		type: "submit",
		className: "go",
		textContent: opts.go
	});
	const buttons = el("div", { className: "sheet-buttons" });
	if (opts.cancel !== false) buttons.append(el("button", {
		type: "button",
		textContent: "Cancel",
		onclick: close
	}));
	buttons.append(go);
	form.append(error, buttons);
	if (opts.more) form.append(opts.more);
	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const values = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i instanceof HTMLInputElement && i.type === "checkbox" ? i.checked ? "yes" : "" : i.value]));
		const wrong = opts.check?.(values) ?? "";
		if (wrong) return void (error.textContent = wrong);
		go.disabled = true;
		error.textContent = "";
		const why = await opts.done(values);
		go.disabled = false;
		if (why) {
			error.textContent = why;
			const first = Object.values(inputs)[0];
			if (first instanceof HTMLInputElement) first.select();
			else (first ?? go).focus();
		} else close();
	});
	form.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && (opts.cancel !== false || opts.dismiss)) close();
	});
	sheet.append(form);
	sheet.hidden = false;
	(Object.values(inputs)[0] ?? go).focus();
	return {
		...inputs,
		labels
	};
}
let back = null;
function askFrom(mode, then) {
	ask(mode).then(() => back = then);
}
function close() {
	stopLog();
	sheet.hidden = true;
	sheet.textContent = "";
	const then = back;
	back = null;
	then?.();
}
const sheetOpen = () => !sheet.hidden;
const twice = (v) => !v.next ? "Type a passcode" : v.next !== v.again ? "The two passcodes aren't the same" : "";
const FORGET = "A forgotten passcode can’t be recovered.";
async function ask(mode) {
	back = null;
	if (mode === "prefs") await openPrefs();
	else if (mode === "updates") await openPrefs("general");
	else if (mode === "settings") {
		const text = await App().SettingsText();
		const inputs = show({
			title: "Edit as Text",
			fields: [{
				name: "text",
				label: "",
				kind: "text"
			}],
			go: "Save",
			done: (v) => App().SetSettingsText(v.text)
		});
		inputs.text.value = text;
	} else if (mode === "link") linkSheet();
	else if (mode === "keys") info("Keyboard Shortcuts", "", shortcuts());
	else if (mode === "welcome") info("Welcome to Mouse Party", "", welcome(), "Get Started");
	else if (mode === "log") await logSheet();
	else if (mode === "clear") {
		const held = await App().CacheText();
		show({
			title: "Clear Download Cache",
			words: held ? `Delete the downloads (${held}) and their rows?` : "There are no downloads.",
			fields: [],
			go: held ? "Clear" : "OK",
			done: () => held ? App().ClearCache() : Promise.resolve("")
		});
	} else if (mode === "erase") show({
		title: "Erase All Data",
		words: "Delete the list, the settings and everything saved. Your own files stay. This can’t be undone.",
		fields: [],
		go: "Erase Everything",
		done: () => App().EraseAll()
	});
	else if (mode === "on") show({
		title: "Use Encryption",
		words: FORGET,
		fields: [{
			name: "next",
			label: "Passcode",
			kind: "password"
		}, {
			name: "again",
			label: "Again",
			kind: "password"
		}],
		go: "Turn On",
		check: twice,
		done: (v) => App().SetPasscode("", v.next)
	});
	else if (mode === "change") show({
		title: "Change Passcode",
		words: FORGET,
		fields: [
			{
				name: "current",
				label: "Passcode now",
				kind: "password"
			},
			{
				name: "next",
				label: "New passcode",
				kind: "password"
			},
			{
				name: "again",
				label: "Again",
				kind: "password"
			}
		],
		go: "Change",
		check: twice,
		done: (v) => App().SetPasscode(v.current, v.next)
	});
	else if (mode === "off") show({
		title: "Stop Using Encryption",
		fields: [{
			name: "current",
			label: "Passcode",
			kind: "password"
		}],
		go: "Stop",
		done: (v) => App().SetPasscode(v.current, "")
	});
}
function info(title, words, more, go = "Done") {
	show({
		title,
		words,
		fields: [],
		go,
		cancel: false,
		dismiss: true,
		more,
		done: () => Promise.resolve("")
	});
}
const KEYS = [
	["↑ ↓", "Select a row"],
	["Return", "Play it"],
	["⌫", "Remove it"],
	["⌘Z  ⇧⌘Z", "Undo, redo"],
	["← →", "Turn the page"],
	["⌘L", "Add a download link"],
	["⌘R", "Clear played files"],
	["⌘,", "Settings"],
	["⌥⌘L", "Show the log"],
	["⌘?", "Help"]
];
function shortcuts() {
	return el("table", { className: "keys" }, ...KEYS.map(([k, what]) => el("tr", {}, el("td", {
		className: "key",
		textContent: k
	}), el("td", { textContent: what }))));
}
function welcome() {
	return el("ol", { className: "welcome" }, ...[
		"Drag in a movie",
		"Copy the link and send it to friends",
		"Press Play"
	].map((head) => el("li", {}, el("strong", { textContent: head }))));
}
let logTimer = 0;
const stopLog = () => {
	clearInterval(logTimer);
	logTimer = 0;
};
async function logSheet() {
	const pre = el("pre", { className: "log" });
	const copy = el("button", {
		type: "button",
		className: "quiet",
		textContent: "Copy Log"
	});
	copy.onclick = () => void window.runtime.ClipboardSetText(pre.textContent ?? "");
	info("Log", "", el("div", { className: "log-box" }, pre, copy));
	const fill = async () => {
		const text = await App().LogText();
		if (pre.textContent === text) return;
		const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
		pre.textContent = text || "Nothing yet.";
		if (atEnd) pre.scrollTop = pre.scrollHeight;
	};
	await fill();
	pre.scrollTop = pre.scrollHeight;
	logTimer = window.setInterval(() => void fill(), 1e3);
}
function edit(what) {
	const f = document.activeElement;
	if (f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement) document.execCommand(what);
	else if (!sheetOpen()) what === "undo" ? App().UndoRemove() : App().RedoRemove();
}
function linkSheet() {
	let site = "";
	let filled = {
		user: "",
		pass: ""
	};
	const inputs = show({
		title: "Add Download Link",
		fields: [
			{
				name: "link",
				label: "Link",
				kind: "line"
			},
			{
				name: "user",
				label: "Username (if needed)",
				kind: "line"
			},
			{
				name: "pass",
				label: "Password",
				kind: "password"
			},
			{
				name: "save",
				label: "Save this login",
				kind: "check",
				hidden: true
			}
		],
		go: "Add",
		check: (v) => !v.link.trim() ? "Paste a link" : v.pass && !v.user.trim() ? "The password needs its username" : "",
		done: (v) => App().AddURL(v.link, v.user, v.pass, !!v.save)
	});
	const save = inputs.save;
	save.checked = true;
	let asked = 0;
	const look = async () => {
		const n = ++asked;
		const l = await App().LoginFor(inputs.link.value);
		if (n !== asked) return;
		if (l.site !== site) {
			site = l.site;
			inputs.labels.save.hidden = !site;
			inputs.labels.save.querySelector("span").textContent = `Save this login for ${site}`;
			if (inputs.user.value === filled.user && inputs.pass.value === filled.pass) {
				inputs.user.value = l.user;
				inputs.pass.value = l.pass;
				filled = {
					user: l.user,
					pass: l.pass
				};
				save.checked = l.saved || !l.user;
			}
		}
	};
	inputs.link.addEventListener("input", () => void look());
}
let locked = false;
function lock(v) {
	if (v.locked === locked) return;
	locked = v.locked;
	if (!locked) return close();
	const startOver = el("button", {
		type: "button",
		className: "quiet",
		textContent: "Forgot the passcode?"
	});
	startOver.onclick = () => show({
		title: "Start a New Party?",
		words: "The locked party is set aside, not deleted.",
		fields: [],
		go: "Start Over",
		done: () => App().StartOver(),
		more: el("button", {
			type: "button",
			className: "quiet",
			textContent: "Back",
			onclick: () => (locked = false, lock(v))
		}),
		cancel: false
	});
	show({
		title: "Mouse Party",
		fields: [{
			name: "passcode",
			label: "Passcode",
			kind: "password"
		}],
		go: "Open",
		cancel: false,
		done: (v) => App().Unlock(v.passcode),
		more: startOver
	});
}
export { ask, askFrom, close, edit, el, lock, sheetOpen, show };
