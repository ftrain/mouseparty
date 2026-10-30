// Built from web/window/party.ts by `npm run build` (vite.config.ts): change it there.
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
	form.append(el("h1", { textContent: opts.title }));
	if (opts.words) form.append(el("p", {
		className: "sheet-words",
		textContent: opts.words
	}));
	for (const f of opts.fields) {
		let input;
		if (f.kind === "text") {
			const area = document.createElement("textarea");
			area.spellcheck = false;
			area.rows = 16;
			input = area;
		} else {
			const field = document.createElement("input");
			field.type = "password";
			field.autocomplete = "off";
			input = field;
		}
		input.name = f.name;
		inputs[f.name] = input;
		form.append(el("label", {}, el("span", { textContent: f.label }), input));
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
		const values = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
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
		} else close();
	});
	form.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && opts.cancel !== false) close();
	});
	sheet.append(form);
	sheet.hidden = false;
	Object.values(inputs)[0]?.focus();
	return inputs;
}
function close() {
	sheet.hidden = true;
	sheet.textContent = "";
}
const sheetOpen = () => !sheet.hidden;
const twice = (v) => !v.next ? "Type a passcode" : v.next !== v.again ? "The two passcodes aren't the same" : "";
const FORGET = "If it is forgotten, nothing in the party can be recovered.";
async function ask(mode) {
	if (mode === "settings") {
		const text = await App().SettingsText();
		const inputs = show({
			title: "Settings",
			words: "The list and the settings, as text. A movie’s subtitles are its \"subs\"; the others are in the README.",
			fields: [{
				name: "text",
				label: "",
				kind: "text"
			}],
			go: "Save",
			done: (v) => App().SetSettingsText(v.text)
		});
		inputs.text.value = text;
	} else if (mode === "on") show({
		title: "Use Encryption",
		words: `The party file is sealed with this passcode, and Mouse Party asks for it each time it starts. ${FORGET}`,
		fields: [{
			name: "next",
			label: "Passcode",
			kind: "password"
		}, {
			name: "again",
			label: "Again",
			kind: "password"
		}],
		go: "Seal the party",
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
		words: "The party file is kept unsealed from now on: anyone with it can read it.",
		fields: [{
			name: "current",
			label: "Passcode",
			kind: "password"
		}],
		go: "Stop",
		done: (v) => App().SetPasscode(v.current, "")
	});
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
		words: "The sealed party is put aside, beside the new one, and nothing in it is deleted; it opens only with its passcode.",
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
		words: "This party is sealed. Its passcode opens it.",
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
export { ask, lock, sheetOpen };
