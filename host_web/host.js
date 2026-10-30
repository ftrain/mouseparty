// Built from web/viewer/host.ts by `npm run build` (vite.config.ts): change it there.
const BASE = window.MOUSEPARTY_BASE;
const store = window.sessionStorage;
const HOST_GONE_MS = 2e4;
const WEBRTC_TIMEOUT_MS = 8e3;
const STATUS_POLL_MS = 5e3;
const MAX_MESSAGES = 200;
const FRESH_MS = 8e3;
const byId = (id) => document.getElementById(id);
const video = byId("video");
const statusText = byId("statusText");
const statusIndicator = byId("statusIndicator");
let mode = null;
let hlsRef = null;
let playing = false;
function setStatus(text, live) {
	for (const [label, dot] of [[statusText, statusIndicator], [byId("headerStatus"), byId("headerDot")]]) {
		label.textContent = text;
		dot.classList.toggle("live", !!live);
	}
	byId("app").classList.toggle("is-live", !!live);
}
const soundPrompt = byId("soundPrompt");
let soundDismissed = false;
function showSoundButton() {
	soundPrompt.hidden = soundDismissed || !(video.muted || video.volume === 0) || video.paused || byId("app").classList.contains("reading");
}
byId("soundButton").addEventListener("click", () => {
	video.muted = false;
	if (video.volume === 0) video.volume = 1;
	video.play().catch(() => {});
});
byId("soundDismiss").addEventListener("click", () => {
	soundDismissed = true;
	showSoundButton();
});
video.addEventListener("volumechange", showSoundButton);
video.addEventListener("playing", showSoundButton);
video.addEventListener("pause", showSoundButton);
let pcRef = null;
async function startWebRTC() {
	if (ended) return;
	let pc, iceServers = [];
	try {
		iceServers = (await (await fetch(`${BASE}/status`, { cache: "no-store" })).json()).iceServers || [];
	} catch (e) {}
	try {
		pc = new RTCPeerConnection({ iceServers });
		pcRef = pc;
	} catch (err) {
		return startHLS("no WebRTC here");
	}
	pc.addTransceiver("video", { direction: "recvonly" });
	pc.addTransceiver("audio", { direction: "recvonly" });
	pc.ontrack = (e) => {
		video.srcObject = e.streams[0];
	};
	let gaveUp = false;
	const timer = setTimeout(() => {
		gaveUp = true;
		pc.close();
		startHLS("WebRTC did not connect");
	}, WEBRTC_TIMEOUT_MS);
	pc.onconnectionstatechange = () => {
		if (pc.connectionState === "connected") {
			clearTimeout(timer);
			mode = "WebRTC";
			playing = true;
			video.play().catch(() => {});
		} else if (pc.connectionState === "failed" && !gaveUp) {
			clearTimeout(timer);
			pc.close();
			startHLS("WebRTC connection failed");
		} else if (pc.connectionState === "disconnected" && mode === "WebRTC") setTimeout(() => {
			if (pc.connectionState !== "connected") {
				pc.close();
				playing = false;
				startWebRTC();
			}
		}, 4e3);
	};
	try {
		await pc.setLocalDescription(await pc.createOffer());
		await new Promise((done) => {
			if (pc.iceGatheringState === "complete") return done();
			pc.onicegatheringstatechange = () => pc.iceGatheringState === "complete" && done();
			setTimeout(done, iceServers.length ? 2500 : 1500);
		});
		const resp = await fetch(`${BASE}/whep`, {
			method: "POST",
			headers: { "Content-Type": "application/sdp" },
			body: pc.localDescription.sdp
		});
		if (!resp.ok) throw new Error(`handshake ${resp.status}`);
		await pc.setRemoteDescription({
			type: "answer",
			sdp: await resp.text()
		});
	} catch (err) {
		console.log("WebRTC:", err);
		if (!gaveUp) {
			gaveUp = true;
			clearTimeout(timer);
			pc.close();
			startHLS("WebRTC unavailable");
		}
	}
}
function keepUpWithLive(hls) {
	setInterval(() => {
		const latency = hls.latency, target = hls.targetLatency;
		if (latency == null || target == null || video.paused) return;
		const ahead = video.buffered.length ? video.buffered.end(video.buffered.length - 1) - video.currentTime : 0;
		if (latency > target + 1 && ahead > 1) video.playbackRate = 1.1;
		else if (latency < target + .3 || ahead < .5) video.playbackRate = 1;
	}, 1e3);
}
function startHLS(why) {
	console.log(why + "; using HLS");
	mode = "HLS";
	video.srcObject = null;
	const url = `${BASE}/hls/index.m3u8`;
	const Hls = window.Hls;
	if (Hls && Hls.isSupported()) {
		const hls = new Hls({
			lowLatencyMode: true,
			liveSyncDurationCount: 3,
			liveMaxLatencyDurationCount: 20,
			maxBufferLength: 10,
			backBufferLength: 10
		});
		hlsRef = hls;
		hls.loadSource(url);
		hls.attachMedia(video);
		hls.on(Hls.Events.MANIFEST_PARSED, () => {
			playing = true;
			video.play().catch(() => {});
		});
		hls.on(Hls.Events.ERROR, (_e, data) => {
			if (!data.fatal) return;
			if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
			else setTimeout(() => hls.loadSource(url), 3e3);
		});
		keepUpWithLive(hls);
	} else {
		video.src = url;
		video.addEventListener("loadedmetadata", () => {
			playing = true;
			video.play().catch(() => {});
		});
	}
}
async function pollStatus() {
	try {
		const s = await (await fetch(`${BASE}/status`, { cache: "no-store" })).json();
		byId("viewerCount").textContent = s.viewers ? `${s.viewers} watching` : "";
		setSubs(s.subs);
		setClock(s.clock);
		setSchedule(s.schedule);
		setDoc(s.doc && s.doc.doc);
		if (!playing) setStatus("Connecting...", false);
		else setStatus((s.standby ? "Stand by" : "Live") + (mode === "HLS" ? " · HLS" : ""), !s.standby);
		hostSeen = Date.now();
	} catch (e) {
		setStatus("Host unreachable", false);
		if (Date.now() - hostSeen > HOST_GONE_MS) endSession();
	}
}
let ended = false;
let hostSeen = Date.now();
function endSession() {
	if (ended) return;
	ended = true;
	try {
		pcRef && pcRef.close();
	} catch (e) {}
	try {
		hlsRef && hlsRef.destroy();
	} catch (e) {}
	video.pause();
	video.srcObject = null;
	video.removeAttribute("src");
	video.load();
	box.textContent = "";
	cueList = [];
	subs = {
		token: null,
		tracks: []
	};
	captionsEl.textContent = "";
	captionsEl.hidden = true;
	if (chatTrack) for (const cue of [...chatTrack.cues || []]) chatTrack.removeCue(cue);
	byId("onlineUsers").textContent = "";
	schedule = {
		rows: [],
		skew: 0
	};
	closePdf();
	closeDb();
	setApps([]);
	doc = null;
	byId("doc").hidden = true;
	document.title = "Mouse Party";
	byId("guide").hidden = true;
	byId("viewerCount").textContent = "";
	try {
		store.clear();
	} catch (e) {}
	setStatus("Session ended", false);
	const note = Object.assign(document.createElement("div"), { className: "ended" });
	const link = Object.assign(document.createElement("a"), {
		href: "https://github.com/ftrain/mouseparty",
		target: "_blank",
		rel: "noopener",
		textContent: "github.com/ftrain/mouseparty"
	});
	note.append(Object.assign(document.createElement("p"), { textContent: "Your host quit the program." }), Object.assign(document.createElement("p"), { textContent: "Want to run your own? Check out " }));
	note.lastChild.append(link);
	byId("stage").appendChild(note);
	byId("soundPrompt").hidden = true;
	if (ws) {
		ws.onclose = null;
		ws.close();
	}
}
let ws = null;
let myName = null;
try {
	myName = store.getItem("mousepartyName");
} catch (e) {}
let retry = 1e3;
const box = byId("chatMessagesOverlay");
function connectChat() {
	if (ended) return;
	setChatState("connecting");
	ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${BASE}/ws`);
	ws.onopen = () => {
		retry = 1e3;
		setChatState("connected");
		if (myName) send({
			type: "join",
			name: myName
		});
	};
	ws.onclose = (e) => {
		if (e.code === 1001) return endSession();
		if (ended) return;
		setChatState("disconnected");
		setTimeout(connectChat, retry);
		retry = Math.min(retry * 2, 1e4);
	};
	ws.onmessage = (e) => {
		const m = JSON.parse(e.data);
		if (m.type === "hello") {
			box.textContent = "";
			m.history.forEach((h) => show(h, false));
			updateOnline(m.online);
			setSubs(m.subs);
			setClock(m.clock);
			setSchedule(m.schedule);
			setDoc(m.doc && m.doc.doc);
			myId = m.you;
			appKinds = m.kinds || [];
			appsMax = m.appsMax || 8;
			setApps(m.apps || []);
		} else if (m.type === "apps") {
			if (m.op === "open") openApp(m.app);
			else if (m.op === "close") closeApp(m.id);
		} else if (m.type === "app") {
			const w = wins.get(m.id);
			if (!w || !w.inst) return;
			if (m.kind === "view") {
				if (w.inst.view) w.inst.view(m.view);
			} else if (w.inst.message) w.inst.message(m);
		} else if (m.type === "doc") setDoc(m.doc);
		else if (m.type === "subs") setSubs(m);
		else if (m.type === "schedule") setSchedule(m);
		else if (m.type === "clock") setClock(m.clock);
		else if (m.type === "online") updateOnline(m.online);
		else {
			show(m, true);
			if (m.type === "msg") {
				for (const w of wins.values()) if (w.inst && w.inst.said) w.inst.said(m.name, m.text);
			}
		}
	};
}
function send(m) {
	if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}
function join(name) {
	name = name.trim().slice(0, 30);
	if (!name) return;
	myName = name;
	try {
		store.setItem("mousepartyName", name);
	} catch (e) {}
	send({
		type: "join",
		name
	});
	showChatInput();
}
function showChatInput() {
	byId("joinOverlay").style.display = "none";
	byId("chatInputBox").style.display = "";
	byId("currentUserDisplay").textContent = myName;
}
function show(m, live) {
	const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
	const el = document.createElement("div");
	if (m.type === "system") {
		el.className = "msg system";
		el.textContent = m.text;
	} else {
		el.className = "msg";
		const time = (/* @__PURE__ */ new Date(m.at * 1e3)).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit"
		});
		for (const [cls, text] of [
			["name", m.name],
			["text", m.text],
			["time", time]
		]) {
			const span = document.createElement("span");
			span.className = cls;
			span.textContent = text;
			el.appendChild(span);
		}
	}
	if (live && m.type === "msg") subtitleLine(`${m.name}: ${m.text}`, FRESH_MS / 1e3);
	if (live && chatHidden && m.type === "msg" && m.name !== myName) {
		unread += 1;
		showUnread();
	}
	if (live) {
		el.classList.add("fresh");
		setTimeout(() => {
			el.classList.remove("fresh");
			setTimeout(() => el.classList.add("gone"), 900);
		}, FRESH_MS);
	} else el.classList.add("gone");
	box.appendChild(el);
	while (box.children.length > MAX_MESSAGES) box.firstChild.remove();
	if (atBottom || !live || m.name === myName) box.scrollTop = box.scrollHeight;
}
function updateOnline(names) {
	byId("onlineUsers").textContent = names.length ? "here: " + names.join(", ") : "";
}
function setChatState(state) {
	const el = byId("chatConnectionIndicator");
	el.className = "conn " + state;
	el.textContent = {
		connected: "● connected",
		connecting: "connecting…",
		disconnected: "reconnecting…"
	}[state];
}
byId("joinBtn").addEventListener("click", () => join(byId("usernameInput").value));
byId("usernameInput").addEventListener("keydown", (e) => {
	if (e.key === "Enter") join(e.target.value);
});
const messageInput = byId("messageInput");
function growMessageBox() {
	messageInput.style.height = "auto";
	messageInput.style.height = `${messageInput.scrollHeight + 2}px`;
	messageInput.style.overflowY = messageInput.scrollHeight > messageInput.clientHeight + 2 ? "auto" : "hidden";
}
messageInput.addEventListener("input", growMessageBox);
messageInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
		e.preventDefault();
		if (messageInput.value.trim()) send({
			type: "say",
			text: messageInput.value
		});
		messageInput.value = "";
		growMessageBox();
	}
	if (e.key === "Escape") app.classList.remove("composing");
});
byId("nameBtn").addEventListener("click", () => {
	byId("chatInputBox").style.display = "none";
	byId("joinOverlay").style.display = "";
	byId("usernameInput").value = myName || "";
	byId("usernameInput").focus();
});
let chatHidden = false;
try {
	chatHidden = store.getItem("mousepartyChatHidden") === "1";
} catch (e) {}
let unread = 0;
const chatTab = byId("chatTab");
const unreadEl = byId("unread");
function showUnread() {
	unreadEl.hidden = !unread;
	unreadEl.textContent = unread > 99 ? "99+" : String(unread);
	chatTab.title = chatHidden ? unread ? `Show chat (${unread} new)` : "Show chat" : "Chat";
}
function setChatHidden(hidden) {
	chatHidden = hidden;
	byId("app").classList.toggle("chat-hidden", hidden);
	byId("app").classList.remove("composing");
	if (!hidden) {
		unread = 0;
		box.scrollTop = box.scrollHeight;
	}
	showUnread();
	try {
		store.setItem("mousepartyChatHidden", hidden ? "1" : "0");
	} catch (e) {}
}
byId("hideChat").addEventListener("click", () => setChatHidden(true));
setChatHidden(chatHidden);
const app = byId("app");
function layout() {
	const w = window.innerWidth, h = window.innerHeight;
	let m;
	if (w > h && h <= 500) m = "overlay";
	else if (w >= 900 && w > h) m = "side";
	else m = "stacked";
	if (app.dataset.mode !== m) {
		app.dataset.mode = m;
		if (m !== "overlay") app.classList.remove("composing");
		box.scrollTop = box.scrollHeight;
		queueMicrotask(arrangeApps);
	}
}
let nativeFullscreen = false;
let chatTrack = null;
function videoFullscreen(on) {
	if (on === nativeFullscreen) return;
	nativeFullscreen = on;
	if (on && !chatTrack) chatTrack = video.addTextTrack("subtitles", "Chat", "en");
	if (!chatTrack) return;
	chatTrack.mode = on ? "showing" : "hidden";
	if (!on) for (const cue of [...chatTrack.cues || []]) chatTrack.removeCue(cue);
}
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(ev, () => videoFullscreen(fullscreenElement() === video));
video.addEventListener("webkitbeginfullscreen", () => videoFullscreen(true));
video.addEventListener("webkitendfullscreen", () => videoFullscreen(false));
video.addEventListener("webkitpresentationmodechanged", () => videoFullscreen(video.webkitPresentationMode === "fullscreen"));
function subtitleLine(text, seconds) {
	if (!nativeFullscreen || !chatTrack || !text) return;
	const now = video.currentTime;
	for (const cue of [...chatTrack.cues || []]) if (cue.endTime < now - 1) chatTrack.removeCue(cue);
	chatTrack.addCue(new VTTCue(now, now + seconds, text));
}
chatTab.addEventListener("click", () => {
	if (chatHidden) return setChatHidden(false);
	app.classList.toggle("composing");
	if (app.classList.contains("composing")) (myName ? byId("messageInput") : byId("usernameInput")).focus();
});
for (const ev of ["resize", "orientationchange"]) window.addEventListener(ev, layout);
layout();
function fitToKeyboard() {
	const vv = window.visualViewport;
	if (!vv) return;
	app.style.setProperty("--visible-height", `${vv.height}px`);
	app.style.setProperty("--visible-top", `${vv.offsetTop}px`);
	window.scrollTo(0, 0);
	box.scrollTop = box.scrollHeight;
}
if (window.visualViewport) {
	window.visualViewport.addEventListener("resize", fitToKeyboard);
	window.visualViewport.addEventListener("scroll", fitToKeyboard);
	fitToKeyboard();
}
const captionsEl = byId("captions");
const ccBtn = byId("captionsBtn");
const ccMenu = byId("captionsMenu");
let subs = {
	token: null,
	tracks: []
};
let clock = null;
let chosen = null;
let cueList = [];
let nudge = 0;
let wanted = null;
try {
	wanted = store.getItem("mousepartySubs");
} catch (e) {}
function setSubs(s) {
	if (!s) return;
	const changed = s.token !== subs.token;
	subs = {
		token: s.token,
		tracks: s.tracks || []
	};
	ccBtn.hidden = !subs.tracks.length;
	if (!subs.tracks.length) ccMenu.hidden = true;
	if (changed) {
		chosen = null;
		cueList = [];
		const t = wanted ? wanted !== "off" && subs.tracks.find((t) => (t.lang || t.label) === wanted) : subs.tracks.find((t) => t.default);
		if (t) choose(t.id, false);
	}
	ccBtn.classList.toggle("on", !!chosen);
	if (!ccMenu.hidden) buildMenu();
}
function setClock(c) {
	clock = c ? {
		token: c.token,
		position: c.position,
		at: performance.now()
	} : null;
}
async function choose(id, remember = true) {
	chosen = id;
	cueList = [];
	const t = subs.tracks.find((t) => t.id === id);
	if (remember) {
		wanted = t ? t.lang || t.label : "off";
		try {
			store.setItem("mousepartySubs", wanted);
		} catch (e) {}
	}
	ccBtn.classList.toggle("on", !!id);
	buildMenu();
	if (!id) return render();
	const token = subs.token;
	try {
		const r = await fetch(`${BASE}/subs/${encodeURIComponent(token)}/${encodeURIComponent(id)}`);
		if (r.ok && subs.token === token && chosen === id) cueList = await r.json();
	} catch (e) {}
}
function viewerDelay() {
	return mode === "HLS" && hlsRef && hlsRef.latency != null ? hlsRef.latency : .35;
}
function render() {
	let text = "";
	if (chosen && cueList.length && clock && clock.token === subs.token) {
		const t = clock.position + (performance.now() - clock.at) / 1e3 - viewerDelay() - nudge;
		text = cueList.filter((c) => c[0] <= t && t < c[1]).map((c) => c[2]).join("\n");
	}
	if (captionsEl.dataset.text === text) return;
	if (text) {
		const t = clock.position + (performance.now() - clock.at) / 1e3 - viewerDelay() - nudge;
		const end = Math.min(...cueList.filter((c) => c[0] <= t && t < c[1]).map((c) => c[1]));
		subtitleLine(text, Math.max(.5, end - t));
	}
	captionsEl.dataset.text = text;
	captionsEl.textContent = "";
	if (text) {
		const span = document.createElement("span");
		span.textContent = text;
		captionsEl.appendChild(span);
	}
	captionsEl.hidden = !text;
	app.style.setProperty("--captions-room", text ? `${captionsEl.offsetHeight + window.innerHeight * .06}px` : "0px");
}
function buildMenu() {
	ccMenu.textContent = "";
	const item = (label, on, fn, stayOpen = false) => {
		const b = document.createElement("button");
		b.textContent = label;
		if (on) b.classList.add("on");
		b.addEventListener("click", (e) => {
			e.stopPropagation();
			if (!stayOpen) ccMenu.hidden = true;
			fn();
		});
		ccMenu.appendChild(b);
	};
	item("Off", !chosen, () => choose(null));
	subs.tracks.forEach((t) => item(t.label, chosen === t.id, () => choose(t.id)));
	if (!chosen) return;
	ccMenu.appendChild(Object.assign(document.createElement("div"), { className: "sep" }));
	ccMenu.appendChild(Object.assign(document.createElement("div"), {
		className: "small",
		textContent: `Timing: ${nudge > 0 ? "+" : ""}${nudge.toFixed(1)}s`
	}));
	item("Show them earlier", false, () => {
		nudge -= .5;
		buildMenu();
	}, true);
	item("Show them later", false, () => {
		nudge += .5;
		buildMenu();
	}, true);
}
ccBtn.addEventListener("click", (e) => {
	e.stopPropagation();
	ccMenu.hidden = !ccMenu.hidden;
	if (!ccMenu.hidden) buildMenu();
});
document.addEventListener("click", (e) => {
	if (!ccMenu.hidden && !ccMenu.contains(e.target)) ccMenu.hidden = true;
});
setInterval(render, 100);
const guide = byId("guide");
let schedule = {
	rows: [],
	skew: 0
};
function setSchedule(m) {
	if (!m || !m.rows) return;
	schedule = {
		rows: m.rows,
		skew: Date.now() / 1e3 - m.now
	};
	const on = m.rows[0];
	document.title = on && on.start != null ? on.title : "Mouse Party";
	if (!guide.hidden) renderGuide();
}
function runtime(seconds) {
	const m = Math.round(seconds / 60), h = Math.floor(m / 60);
	return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
function clockTime(epoch) {
	return (/* @__PURE__ */ new Date(epoch * 1e3)).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit"
	});
}
function renderGuide() {
	const rowsEl = byId("guideRows");
	const now = Date.now() / 1e3;
	const zone = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { timeZoneName: "short" }).split(" ").pop();
	byId("guideZone").textContent = `times in your time zone (${zone})`;
	byId("guideClock").textContent = clockTime(now);
	rowsEl.textContent = "";
	if (!schedule.rows.length) {
		rowsEl.appendChild(Object.assign(document.createElement("div"), {
			className: "guide-empty",
			textContent: "Nothing scheduled yet."
		}));
		return;
	}
	const started = schedule.rows[0].start != null;
	schedule.rows.forEach((r, i) => {
		const start = r.start != null ? r.start + schedule.skew : null;
		const end = start != null && !r.pages && !r.data ? start + r.duration : null;
		const onNow = start != null && start <= now && (r.pages || r.data ? i === 0 : now < end);
		const row = document.createElement("div");
		row.className = "guide-row" + (onNow ? " now" : "");
		const time = Object.assign(document.createElement("div"), {
			className: "time",
			textContent: start != null ? clockTime(start) : "—"
		});
		const what = Object.assign(document.createElement("div"), { className: "what" });
		what.appendChild(Object.assign(document.createElement("div"), {
			className: "name",
			textContent: r.title
		}));
		const tags = Object.assign(document.createElement("div"), { className: "tags" });
		const tag = (text, cls = "") => tags.appendChild(Object.assign(document.createElement("span"), {
			className: "tag " + cls,
			textContent: text
		}));
		if (onNow) tag("ON NOW", "now");
		else if (i === 0 && !started) tag("UP FIRST");
		else if (i === 0 || i === 1 && onNowFirst()) tag("UP NEXT");
		if (r.cc) tag("CC");
		if (end != null) tags.appendChild(document.createTextNode(onNow ? `ends ${clockTime(end)}` : `until ${clockTime(end)}`));
		what.appendChild(tags);
		row.append(time, what, Object.assign(document.createElement("div"), {
			className: "runtime",
			textContent: r.data ? "data" : r.pages ? `${r.pages} pp` : runtime(r.duration)
		}));
		if (onNow && end != null) {
			const bar = Object.assign(document.createElement("div"), { className: "bar" });
			bar.appendChild(Object.assign(document.createElement("span"), { style: `width: ${Math.min(100, 100 * (now - start) / r.duration)}%` }));
			row.appendChild(bar);
		}
		rowsEl.appendChild(row);
	});
	if (!started) rowsEl.appendChild(Object.assign(document.createElement("div"), {
		className: "guide-note",
		textContent: "Times appear once the host presses Play."
	}));
}
function onNowFirst() {
	const r = schedule.rows[0];
	if (!r || r.start == null) return false;
	const now = Date.now() / 1e3, start = r.start + schedule.skew;
	return start <= now && (r.pages || r.data || now < start + r.duration);
}
function openGuide(open) {
	guide.hidden = !open;
	if (open) renderGuide();
}
byId("guideBtn").addEventListener("click", () => openGuide(true));
byId("guideClose").addEventListener("click", () => openGuide(false));
guide.addEventListener("click", (e) => {
	if (e.target === guide) openGuide(false);
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && !guide.hidden) openGuide(false);
});
setInterval(() => {
	if (!guide.hidden) renderGuide();
}, 15e3);
const docEl = byId("doc");
const docScroll = byId("docScroll");
const docZoom = byId("docZoom");
let doc = null;
let pdf = null;
let pdfTask = null;
let pdfToken = null;
let pdfjs = null;
let fitWidth = false;
let renderTask = null;
let drawing = false;
let drawAgain = false;
let drawnPage = null;
async function setDoc(d) {
	if (ended) return;
	const was = doc;
	doc = d || null;
	docEl.hidden = !doc;
	app.classList.toggle("reading", !!doc);
	showSoundButton();
	docEl.classList.toggle("data", doc?.kind === "db");
	if (doc?.kind !== "db") closeDb();
	if (!doc) return closePdf();
	if (doc.kind === "db") {
		closePdf();
		return showDb(doc);
	}
	byId("docPage").textContent = `${doc.page} / ${doc.pages}`;
	if (pdfToken === doc.token) {
		if (!was || was.page !== doc.page) drawPage();
		return;
	}
	closePdf();
	const token = pdfToken = doc.token;
	try {
		if (!pdfjs) {
			pdfjs = await import(
				/* @vite-ignore */
				`${BASE}/assets/pdf.min.mjs`
);
			pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/assets/pdf.worker.min.mjs`;
		}
		const loaded = await (pdfTask = pdfjs.getDocument({
			url: `${BASE}/doc/${encodeURIComponent(token)}`,
			isEvalSupported: false
		})).promise;
		if (pdfToken !== token) return;
		pdf = loaded;
		drawPage();
	} catch (e) {
		console.log("PDF:", e);
		if (pdfToken === token) pdfToken = null;
	}
}
function closePdf() {
	if (renderTask) renderTask.cancel();
	if (pdfTask) pdfTask.destroy();
	pdf = pdfTask = pdfToken = drawnPage = null;
	docScroll.textContent = "";
}
async function drawPage() {
	if (!pdf || !doc) return;
	if (drawing) {
		drawAgain = true;
		if (renderTask) renderTask.cancel();
		return;
	}
	drawing = true;
	const loaded = pdf, number = Math.min(doc.page, pdf.numPages);
	try {
		const page = await loaded.getPage(number);
		const size = page.getViewport({ scale: 1 });
		const w = docScroll.clientWidth, h = docScroll.clientHeight;
		const scale = fitWidth ? w / size.width : Math.min(w / size.width, h / size.height);
		const dpr = window.devicePixelRatio || 1;
		const viewport = page.getViewport({ scale: scale * dpr });
		const canvas = document.createElement("canvas");
		canvas.width = Math.floor(viewport.width);
		canvas.height = Math.floor(viewport.height);
		canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
		canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
		await (renderTask = page.render({
			canvas,
			viewport
		})).promise;
		if (pdf !== loaded) return;
		docScroll.replaceChildren(canvas);
		if (drawnPage !== number) docScroll.scrollTop = 0;
		drawnPage = number;
	} catch (e) {
		if (e && e.name !== "RenderingCancelledException") console.log("PDF page:", e);
	} finally {
		drawing = false;
		renderTask = null;
		if (drawAgain) {
			drawAgain = false;
			drawPage();
		}
	}
}
let dbFrame = null;
let dbToken = null;
const dbTell = () => dbFrame?.contentWindow?.postMessage({
	type: "go",
	at: doc?.at || "/",
	back: !!doc?.back
}, location.origin);
function showDb(d) {
	if (dbToken === d.token) return dbTell();
	closeDb();
	dbToken = d.token;
	dbFrame = document.createElement("iframe");
	dbFrame.className = "doc-data";
	dbFrame.title = d.title;
	dbFrame.src = `${BASE}/data/${encodeURIComponent(d.token)}/${(d.at || "/").slice(1)}`;
	dbFrame.onload = dbTell;
	docEl.append(dbFrame);
}
function closeDb() {
	dbFrame?.remove();
	dbFrame = dbToken = null;
}
window.addEventListener("message", (e) => {
	if (!dbFrame || e.source !== dbFrame.contentWindow || e.origin !== location.origin) return;
	if (e.data?.type === "went" && typeof e.data.at === "string") send({
		type: "doc_at",
		token: dbToken,
		at: e.data.at
	});
	if (e.data?.type === "back") send({
		type: "doc_at",
		token: dbToken,
		back: true
	});
});
function toggleFit() {
	fitWidth = !fitWidth;
	docEl.classList.toggle("fit-width", fitWidth);
	docZoom.textContent = fitWidth ? "whole page" : "fit width";
	docZoom.title = fitWidth ? "Show the whole page (or double-click it)" : "Fit the width (or double-click the page)";
	drawPage();
}
docZoom.addEventListener("click", toggleFit);
docScroll.addEventListener("dblclick", toggleFit);
let redrawTimer;
new ResizeObserver(() => {
	clearTimeout(redrawTimer);
	redrawTimer = setTimeout(drawPage, 150);
}).observe(docScroll);
if (myName) showChatInput();
connectChat();
startWebRTC();
pollStatus();
setInterval(() => {
	if (!ended) pollStatus();
}, STATUS_POLL_MS);
const desk = byId("desk");
const dock = byId("dock");
const tabsEl = byId("appTabs");
const picker = byId("picker");
let myId = null;
let appKinds = [];
let appsMax = 8;
const wins = /* @__PURE__ */ new Map();
let zTop = 0;
let zGlass = 0;
let tab = null;
let openedHere = null;
const appModule = (name) => import(
	/* @vite-ignore */
	`${BASE}/apps/${encodeURIComponent(name)}.js`
);
async function loadAppScript(name) {
	const start = (await appModule(name)).default;
	if (typeof start !== "function") throw new Error(name);
	return start;
}
let lucide = null;
let iconsLoading = null;
async function icons() {
	if (typeof lucide !== "function") await (iconsLoading = iconsLoading || appModule("icons").then((m) => {
		lucide = m.default;
	}));
}
const icon = (name) => typeof lucide === "function" ? lucide(name) : "";
const compact = () => app.dataset.mode !== "side";
function firstPlace(size) {
	const step = .035 * ([...wins.values()].filter((w) => !w.info.glass).length % 5);
	if (size === "full") return {
		x: 0,
		y: 0,
		w: 1,
		h: 1
	};
	if (size === "small") return {
		x: .6 - step,
		y: .04 + step,
		w: .38,
		h: .55
	};
	return {
		x: .08 + step,
		y: .06 + step,
		w: .8,
		h: .84
	};
}
function setApps(list) {
	for (const id of [...wins.keys()]) if (!list.some((a) => a.id === id)) closeApp(id);
	for (const a of list) openApp(a);
}
const GLASS_KEY = "mousepartyGlass";
const glassOf = (() => {
	try {
		return JSON.parse(localStorage.getItem(GLASS_KEY)) || {};
	} catch (e) {
		return {};
	}
})();
function setGlass(w, value) {
	w.el.style.setProperty("--glass", String(value));
	if (w.inst && w.inst.resize) w.inst.resize();
}
async function openApp(info) {
	let w = wins.get(info.id);
	if (!w) {
		const el = document.createElement("div");
		el.className = "win" + (info.glass ? " glass" : "") + (["office", "reel"].includes(info.script) ? " office" : "");
		el.innerHTML = "<div class=\"win-bar\"><span class=\"win-icon\"></span><span class=\"win-title\"></span><input class=\"win-glass\" type=\"range\" min=\"15\" max=\"100\" title=\"See-through or solid (for you)\" aria-label=\"How solid this window is\"><button class=\"win-btn win-min\" title=\"Hide it (for you)\">–</button><button class=\"win-btn win-close\" title=\"Close it for everyone\">✕</button></div><div class=\"win-body\"></div>" + [
			"nw",
			"ne",
			"sw",
			"se"
		].map((c) => `<div class="win-grip ${c}" data-corner="${c}"></div>`).join("");
		const nw = {
			info,
			place: firstPlace(info.size),
			hidden: false,
			el,
			body: el.querySelector(".win-body"),
			inst: null
		};
		w = nw;
		el.querySelector(".win-title").textContent = info.title;
		el.querySelector(".win-bar").title = info.by ? `${info.title}, opened by ${info.by}` : info.title;
		el.querySelector(".win-close").onclick = () => send({
			type: "app_close",
			id: info.id
		});
		el.querySelector(".win-min").onclick = () => {
			nw.hidden = true;
			arrangeApps();
		};
		const glass = el.querySelector(".win-glass");
		glass.value = String(Math.round(100 * (glassOf[info.name] ?? .6)));
		el.style.setProperty("--glass", String(Number(glass.value) / 100));
		glass.oninput = () => {
			setGlass(nw, Number(glass.value) / 100);
			glassOf[info.name] = Number(glass.value) / 100;
			try {
				localStorage.setItem(GLASS_KEY, JSON.stringify(glassOf));
			} catch (e) {}
		};
		el.addEventListener("pointerdown", () => front(nw), true);
		windowHandles(nw);
		new ResizeObserver(() => {
			if (nw.inst && nw.inst.resize) nw.inst.resize();
		}).observe(nw.body);
		wins.set(info.id, nw);
		if (info.name === openedHere) {
			openedHere = null;
			tab = info.glass ? tab : info.id;
		}
		front(nw);
		arrangeApps();
		icons().then(() => {
			el.querySelector(".win-icon").innerHTML = icon(info.icon);
			renderTabs();
		});
	}
	w.info = info;
	if (w.inst && w.inst.stop) w.inst.stop();
	w.inst = null;
	w.body.textContent = "";
	let start;
	try {
		start = await loadAppScript(info.script || info.name);
	} catch (e) {
		return;
	}
	if (wins.get(info.id) !== w || w.info !== info) return;
	const win = w;
	const ctx = {
		layer: w.body,
		send: (msg) => send({
			...msg,
			type: "app",
			id: info.id
		}),
		me: () => ({
			id: myId,
			name: myName
		}),
		videoBox: () => videoBox(win),
		base: BASE,
		open: (name) => {
			openedHere = name;
			send({
				type: "app_open",
				name
			});
		}
	};
	w.inst = start(ctx, info.view) || {};
}
function closeApp(id) {
	const w = wins.get(id);
	if (!w) return;
	if (w.inst && w.inst.stop) w.inst.stop();
	w.el.remove();
	wins.delete(id);
	if (tab === id) tab = null;
	arrangeApps();
}
function front(w) {
	w.el.style.zIndex = String(w.info.glass ? ++zGlass : 1e5 + ++zTop);
}
function arrangeApps() {
	const mode = app.dataset.mode;
	if (tab !== null && !wins.has(tab)) tab = null;
	for (const w of wins.values()) {
		const parent = mode === "stacked" && !w.info.glass ? dock : desk;
		if (w.el.parentNode !== parent) parent.appendChild(w.el);
		const shown = compact() && !w.info.glass ? tab === w.info.id : !w.hidden;
		w.el.hidden = !shown;
		w.el.classList.toggle("filled", compact() && !w.info.glass);
		if (!compact() || w.info.glass) {
			const p = compact() ? {
				x: 0,
				y: 0,
				w: 1,
				h: 1
			} : w.place;
			Object.assign(w.el.style, {
				left: `${p.x * 100}%`,
				top: `${p.y * 100}%`,
				width: `${p.w * 100}%`,
				height: `${p.h * 100}%`
			});
		} else Object.assign(w.el.style, {
			left: "",
			top: "",
			width: "",
			height: ""
		});
	}
	app.classList.toggle("app-tab", mode === "stacked" && tab !== null);
	renderTabs();
}
function renderTabs() {
	const list = [...wins.values()];
	const mode = app.dataset.mode;
	tabsEl.hidden = !list.length;
	if (mode === "overlay" ? tabsEl.parentNode !== desk : tabsEl.parentNode !== dock.parentNode) {
		if (mode === "overlay") desk.appendChild(tabsEl);
		else dock.parentNode.insertBefore(tabsEl, dock);
	}
	tabsEl.textContent = "";
	const chip = (label, on, click, iconName, title) => {
		const b = document.createElement("button");
		b.className = "app-chip" + (on ? " on" : "");
		b.innerHTML = iconName ? icon(iconName) : "";
		b.append(label);
		b.title = title || "";
		b.onclick = click;
		tabsEl.appendChild(b);
	};
	if (compact()) chip(mode === "stacked" ? "Chat" : "Video", tab === null, () => {
		tab = null;
		arrangeApps();
	});
	for (const w of list) {
		const on = compact() && !w.info.glass ? tab === w.info.id : !w.hidden;
		chip(w.info.title, on, () => {
			if (compact() && !w.info.glass) tab = tab === w.info.id ? null : w.info.id;
			else {
				w.hidden = !w.hidden;
				if (!w.hidden) front(w);
			}
			arrangeApps();
		}, w.info.icon, compact() ? "" : w.hidden ? "Show it" : "Hide it (for you)");
	}
}
function windowHandles(w) {
	const MIN_W = 180, MIN_H = 120;
	const startDrag = (e, corner) => {
		if (compact() || e.button > 0 || e.target.closest(".win-btn, .win-glass")) return;
		e.preventDefault();
		const stage = desk.getBoundingClientRect(), p0 = { ...w.place }, x0 = e.clientX, y0 = e.clientY;
		const minW = Math.min(1, MIN_W / stage.width), minH = Math.min(1, MIN_H / stage.height);
		w.el.classList.add("moving");
		const move = (ev) => {
			const dx = (ev.clientX - x0) / stage.width, dy = (ev.clientY - y0) / stage.height;
			const p = { ...p0 };
			if (!corner) {
				p.x = Math.min(Math.max(p0.x + dx, 0), 1 - p0.w);
				p.y = Math.min(Math.max(p0.y + dy, 0), 1 - p0.h);
			} else {
				if (corner.includes("w")) {
					p.x = Math.min(Math.max(p0.x + dx, 0), p0.x + p0.w - minW);
					p.w = p0.x + p0.w - p.x;
				}
				if (corner.includes("e")) p.w = Math.min(Math.max(p0.w + dx, minW), 1 - p0.x);
				if (corner.includes("n")) {
					p.y = Math.min(Math.max(p0.y + dy, 0), p0.y + p0.h - minH);
					p.h = p0.y + p0.h - p.y;
				}
				if (corner.includes("s")) p.h = Math.min(Math.max(p0.h + dy, minH), 1 - p0.y);
			}
			w.place = p;
			arrangeApps();
		};
		const up = () => {
			w.el.classList.remove("moving");
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
	};
	const bar = w.el.querySelector(".win-bar");
	bar.addEventListener("pointerdown", (e) => startDrag(e, null));
	bar.addEventListener("dblclick", (e) => {
		if (compact() || e.target.closest(".win-btn, .win-glass")) return;
		const full = w.place.x === 0 && w.place.y === 0 && w.place.w === 1 && w.place.h === 1;
		w.place = full ? w.unfull || firstPlace(w.info.size === "full" ? "big" : w.info.size) : {
			x: 0,
			y: 0,
			w: 1,
			h: 1
		};
		if (!full) w.unfull = w.place === w.unfull ? null : { ...w.place };
		arrangeApps();
	});
	for (const g of w.el.querySelectorAll(".win-grip")) g.addEventListener("pointerdown", (e) => startDrag(e, g.dataset.corner));
}
function videoBox(w) {
	const body = w.body.getBoundingClientRect();
	if (w.info.glass) {
		const st = desk.getBoundingClientRect();
		const vw = Math.min(st.width, st.height * 16 / 9), vh = vw * 9 / 16;
		return {
			x: st.left + (st.width - vw) / 2 - body.left,
			y: st.top + (st.height - vh) / 2 - body.top,
			w: vw,
			h: vh
		};
	}
	const vw = Math.min(body.width, body.height * 16 / 9), vh = vw * 9 / 16;
	return {
		x: (body.width - vw) / 2,
		y: (body.height - vh) / 2,
		w: vw,
		h: vh
	};
}
async function togglePicker() {
	if (!picker.hidden) {
		picker.hidden = true;
		return;
	}
	await icons();
	picker.textContent = "";
	const full = wins.size >= appsMax;
	const head = document.createElement("div");
	head.className = "picker-head";
	head.textContent = full ? `${appsMax} apps are open: close one first` : "Open an app for everyone";
	picker.appendChild(head);
	for (const k of appKinds) {
		const b = document.createElement("button");
		b.className = "picker-app";
		b.disabled = full;
		b.innerHTML = icon(k.icon) + "<span></span>";
		b.lastChild.textContent = k.min > 1 ? `${k.title} ${k.min}+` : k.title;
		if (k.min > 1) b.title = `Needs ${k.min} players`;
		b.onclick = () => {
			openedHere = k.name;
			send({
				type: "app_open",
				name: k.name
			});
			picker.hidden = true;
		};
		picker.appendChild(b);
	}
	picker.hidden = false;
}
for (const b of document.querySelectorAll(".plus")) b.addEventListener("click", (e) => {
	e.stopPropagation();
	togglePicker();
});
document.addEventListener("pointerdown", (e) => {
	if (!picker.hidden && !picker.contains(e.target) && !e.target.closest(".plus")) picker.hidden = true;
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") picker.hidden = true;
});
arrangeApps();
