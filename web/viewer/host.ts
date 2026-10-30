// Mouse Party viewer for a session hosted from someone's Mac (host.go).
// Video: WebRTC straight from the host (WHEP), or HLS from the host if WebRTC
// can't get through. Chat: a WebSocket to the host. BASE is /<session key>.
// Nothing here talks to any other server, except a STUN server when the host
// shares through Cloudflare (it lists it in /status): that lets WebRTC punch
// through both ends' routers.
import type { Hls, PdfDocument, PdfJs, PdfLoading } from './globals.d.ts';
import type { App, AppInfo, AppKind, AppMsg, Box, ChatLine, Clock, Cue, Ctx, Doc, FromHost, Schedule, Start, Status, Subs, ToHost } from './types.ts';

const BASE = window.MOUSEPARTY_BASE;
// Sessions are meant to leave nothing behind: what the page remembers (your
// name, subtitle language, whether chat is hidden) lasts only as long as the tab
const store = window.sessionStorage;
const HOST_GONE_MS = 20000; // no host for this long: the session is over, wipe the page
const WEBRTC_TIMEOUT_MS = 8000; // no picture by then: fall back to HLS
const STATUS_POLL_MS = 5000;
const MAX_MESSAGES = 200; // kept in the chat column, like YouTube's
const FRESH_MS = 8000; // how long a line stays up over the video

// the page's own elements (viewer.html), by id
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const video = byId<HTMLVideoElement>('video');
const statusText = byId('statusText');
const statusIndicator = byId('statusIndicator');
let mode: 'WebRTC' | 'HLS' | null = null;
let hlsRef: Hls | null = null;
let playing = false;

function setStatus(text: string, live: boolean) {
    for (const [label, dot] of [
        [statusText, statusIndicator],
        [byId('headerStatus'), byId('headerDot')],
    ]) {
        label.textContent = text;
        dot.classList.toggle('live', !!live);
    }
    byId('app').classList.toggle('is-live', !!live); // the badge over the video only shows when not
}

// ---------- sound ----------
// Autoplay only works muted; the prompt shows whenever the video plays without
// sound, unless they've dismissed it (for this page load), choosing silence
const soundPrompt = byId('soundPrompt');
let soundDismissed = false;
function showSoundButton() {
    // not over a PDF: the stream is silent while one is up
    soundPrompt.hidden = soundDismissed || !(video.muted || video.volume === 0) || video.paused || byId('app').classList.contains('reading');
}
byId('soundButton').addEventListener('click', () => {
    video.muted = false;
    if (video.volume === 0) video.volume = 1;
    video.play().catch(() => {});
});
byId('soundDismiss').addEventListener('click', () => {
    soundDismissed = true;
    showSoundButton();
});
video.addEventListener('volumechange', showSoundButton);
video.addEventListener('playing', showSoundButton);
video.addEventListener('pause', showSoundButton);

// ---------- video: WebRTC first ----------
let pcRef: RTCPeerConnection | null = null;
async function startWebRTC() {
    if (ended) return;
    let pc: RTCPeerConnection,
        iceServers: RTCIceServer[] = [];
    try {
        iceServers = ((await (await fetch(`${BASE}/status`, { cache: 'no-store' })).json()) as Status).iceServers || [];
    } catch (e) {}
    try {
        pc = new RTCPeerConnection({ iceServers });
        pcRef = pc;
    } catch (err) {
        // no WebRTC in this browser at all
        return startHLS('no WebRTC here');
    }
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = (e) => {
        video.srcObject = e.streams[0];
    };
    let gaveUp = false;
    const timer = setTimeout(() => {
        gaveUp = true;
        pc.close();
        startHLS('WebRTC did not connect');
    }, WEBRTC_TIMEOUT_MS);
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
            clearTimeout(timer);
            mode = 'WebRTC';
            playing = true;
            video.play().catch(() => {});
        } else if (pc.connectionState === 'failed' && !gaveUp) {
            clearTimeout(timer);
            pc.close();
            startHLS('WebRTC connection failed');
        } else if (pc.connectionState === 'disconnected' && mode === 'WebRTC') {
            // the host's network blinked; try again rather than falling back for good
            setTimeout(() => {
                if (pc.connectionState !== 'connected') {
                    pc.close();
                    playing = false;
                    startWebRTC();
                }
            }, 4000);
        }
    };
    try {
        await pc.setLocalDescription(await pc.createOffer());
        await new Promise<void>((done) => {
            // send every candidate in one go (no trickle)
            if (pc.iceGatheringState === 'complete') return done();
            pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && done();
            setTimeout(done, iceServers.length ? 2500 : 1500); // STUN answers take a moment
        });
        const resp = await fetch(`${BASE}/whep`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/sdp' },
            body: pc.localDescription!.sdp,
        });
        if (!resp.ok) throw new Error(`handshake ${resp.status}`);
        await pc.setRemoteDescription({ type: 'answer', sdp: await resp.text() });
    } catch (err) {
        console.log('WebRTC:', err);
        if (!gaveUp) {
            gaveUp = true;
            clearTimeout(timer);
            pc.close();
            startHLS('WebRTC unavailable');
        }
    }
}

// ---------- video: HLS fallback, from the same host ----------
function keepUpWithLive(hls: Hls) {
    // catch up after hand-offs by playing 10% faster
    setInterval(() => {
        const latency = hls.latency,
            target = hls.targetLatency;
        if (latency == null || target == null || video.paused) return;
        const ahead = video.buffered.length ? video.buffered.end(video.buffered.length - 1) - video.currentTime : 0;
        if (latency > target + 1 && ahead > 1) video.playbackRate = 1.1;
        else if (latency < target + 0.3 || ahead < 0.5) video.playbackRate = 1;
    }, 1000);
}

function startHLS(why: string) {
    console.log(why + '; using HLS');
    mode = 'HLS';
    video.srcObject = null;
    const url = `${BASE}/hls/index.m3u8`;
    const Hls = window.Hls;
    if (Hls && Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 20, maxBufferLength: 10, backBufferLength: 10 });
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
            else setTimeout(() => hls.loadSource(url), 3000);
        });
        keepUpWithLive(hls);
    } else {
        // Safari plays HLS itself
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
            playing = true;
            video.play().catch(() => {});
        });
    }
}

async function pollStatus() {
    try {
        const s = (await (await fetch(`${BASE}/status`, { cache: 'no-store' })).json()) as Status;
        byId('viewerCount').textContent = s.viewers ? `${s.viewers} watching` : '';
        setSubs(s.subs);
        setClock(s.clock);
        setSchedule(s.schedule);
        setDoc(s.doc && s.doc.doc);
        if (!playing) setStatus('Connecting...', false);
        else setStatus((s.standby ? 'Stand by' : 'Live') + (mode === 'HLS' ? ' · HLS' : ''), !s.standby);
        hostSeen = Date.now();
    } catch (e) {
        setStatus('Host unreachable', false); // they quit, or their connection dropped
        if (Date.now() - hostSeen > HOST_GONE_MS) endSession();
    }
}

// When the host quits, the session is over: nothing of it stays on this page
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
    video.removeAttribute('src');
    video.load();
    box.textContent = '';
    cueList = [];
    subs = { token: null, tracks: [] };
    captionsEl.textContent = '';
    captionsEl.hidden = true;
    if (chatTrack) for (const cue of [...(chatTrack.cues || [])]) chatTrack.removeCue(cue);
    byId('onlineUsers').textContent = '';
    schedule = { rows: [], skew: 0 };
    closePdf();
    closeDb();
    setApps([]);
    doc = null;
    byId('doc').hidden = true;
    document.title = 'Mouse Party';
    byId('guide').hidden = true;
    byId('viewerCount').textContent = '';
    try {
        store.clear();
    } catch (e) {}
    setStatus('Session ended', false);
    const note = Object.assign(document.createElement('div'), { className: 'ended' });
    const link = Object.assign(document.createElement('a'), { href: 'https://github.com/ftrain/mouseparty', target: '_blank', rel: 'noopener', textContent: 'github.com/ftrain/mouseparty' });
    note.append(
        Object.assign(document.createElement('p'), { textContent: 'Your host quit the program.' }),
        Object.assign(document.createElement('p'), { textContent: 'Want to run your own? Check out ' }),
    );
    (note.lastChild as HTMLElement).append(link);
    byId('stage').appendChild(note);
    byId('soundPrompt').hidden = true;
    if (ws) {
        ws.onclose = null;
        ws.close();
    }
}

// ---------- chat ----------
let ws: WebSocket | null = null;
let myName: string | null = null;
try {
    myName = store.getItem('mousepartyName');
} catch (e) {}
let retry = 1000;
const box = byId('chatMessagesOverlay');

function connectChat() {
    if (ended) return;
    setChatState('connecting');
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${BASE}/ws`);
    ws.onopen = () => {
        retry = 1000;
        setChatState('connected');
        if (myName) send({ type: 'join', name: myName });
    };
    ws.onclose = (e) => {
        if (e.code === 1001) return endSession(); // they quit the app
        if (ended) return;
        setChatState('disconnected');
        setTimeout(connectChat, retry);
        retry = Math.min(retry * 2, 10000);
    };
    ws.onmessage = (e) => {
        const m = JSON.parse(e.data) as FromHost;
        if (m.type === 'hello') {
            box.textContent = '';
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
        } else if (m.type === 'apps') {
            if (m.op === 'open') openApp(m.app);
            else if (m.op === 'close') closeApp(m.id);
        } else if (m.type === 'app') {
            const w = wins.get(m.id);
            if (!w || !w.inst) return;
            if (m.kind === 'view') {
                if (w.inst.view) w.inst.view(m.view);
            } else if (w.inst.message) w.inst.message(m);
        } else if (m.type === 'doc') {
            setDoc(m.doc);
        } else if (m.type === 'subs') {
            setSubs(m);
        } else if (m.type === 'schedule') {
            setSchedule(m);
        } else if (m.type === 'clock') {
            setClock(m.clock);
        } else if (m.type === 'online') {
            updateOnline(m.online);
        } else {
            show(m, true);
            if (m.type === 'msg') for (const w of wins.values()) if (w.inst && w.inst.said) w.inst.said(m.name!, m.text);
        }
    };
}

function send(m: ToHost) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function join(name: string) {
    name = name.trim().slice(0, 30);
    if (!name) return;
    myName = name;
    try {
        store.setItem('mousepartyName', name);
    } catch (e) {}
    send({ type: 'join', name });
    showChatInput();
}

function showChatInput() {
    byId('joinOverlay').style.display = 'none';
    byId('chatInputBox').style.display = '';
    byId('currentUserDisplay').textContent = myName;
}

// Every line stays in the chat column. Over the video (overlay mode) only lines
// marked fresh show, for FRESH_MS, the newest four at a time, like subtitles.
function show(m: ChatLine, live: boolean) {
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const el = document.createElement('div');
    if (m.type === 'system') {
        el.className = 'msg system';
        el.textContent = m.text;
    } else {
        el.className = 'msg';
        const time = new Date(m.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        for (const [cls, text] of [
            ['name', m.name],
            ['text', m.text],
            ['time', time],
        ]) {
            const span = document.createElement('span');
            span.className = cls!;
            span.textContent = text!; // never innerHTML: names and text are other people's
            el.appendChild(span);
        }
    }
    if (live && m.type === 'msg') subtitleLine(`${m.name}: ${m.text}`, FRESH_MS / 1000);
    if (live && chatHidden && m.type === 'msg' && m.name !== myName) {
        unread += 1;
        showUnread();
    }
    if (live) {
        el.classList.add('fresh');
        setTimeout(() => {
            el.classList.remove('fresh');
            setTimeout(() => el.classList.add('gone'), 900);
        }, FRESH_MS);
    } else {
        el.classList.add('gone');
    }
    box.appendChild(el);
    while (box.children.length > MAX_MESSAGES) box.firstChild!.remove();
    if (atBottom || !live || m.name === myName) box.scrollTop = box.scrollHeight; // don't yank someone reading back
}

function updateOnline(names: string[]) {
    byId('onlineUsers').textContent = names.length ? 'here: ' + names.join(', ') : '';
}

function setChatState(state: 'connected' | 'connecting' | 'disconnected') {
    const el = byId('chatConnectionIndicator');
    el.className = 'conn ' + state;
    el.textContent = { connected: '● connected', connecting: 'connecting…', disconnected: 'reconnecting…' }[state];
}

byId('joinBtn').addEventListener('click', () => join(byId<HTMLInputElement>('usernameInput').value));
byId('usernameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join((e.target as HTMLInputElement).value);
});
// The message box grows as you type (to its CSS max-height, then scrolls).
// Enter sends; Shift-Enter is a new line.
const messageInput = byId<HTMLTextAreaElement>('messageInput');
function growMessageBox() {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${messageInput.scrollHeight + 2}px`;
    messageInput.style.overflowY = messageInput.scrollHeight > messageInput.clientHeight + 2 ? 'auto' : 'hidden';
}
messageInput.addEventListener('input', growMessageBox);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (messageInput.value.trim()) send({ type: 'say', text: messageInput.value });
        messageInput.value = '';
        growMessageBox();
    }
    if (e.key === 'Escape') app.classList.remove('composing');
});
byId('nameBtn').addEventListener('click', () => {
    byId('chatInputBox').style.display = 'none';
    byId('joinOverlay').style.display = '';
    byId<HTMLInputElement>('usernameInput').value = myName || '';
    byId('usernameInput').focus();
});

// ---------- hiding the chat ----------
// Remembered per device. While hidden, the chat tab on the video's right edge
// counts the messages that arrive (not your own, not joins and leaves).
let chatHidden = false;
try {
    chatHidden = store.getItem('mousepartyChatHidden') === '1';
} catch (e) {}
let unread = 0;
const chatTab = byId('chatTab');
const unreadEl = byId('unread');

function showUnread() {
    unreadEl.hidden = !unread;
    unreadEl.textContent = unread > 99 ? '99+' : String(unread);
    chatTab.title = chatHidden ? (unread ? `Show chat (${unread} new)` : 'Show chat') : 'Chat';
}

function setChatHidden(hidden: boolean) {
    chatHidden = hidden;
    byId('app').classList.toggle('chat-hidden', hidden);
    byId('app').classList.remove('composing');
    if (!hidden) {
        unread = 0;
        box.scrollTop = box.scrollHeight;
    }
    showUnread();
    try {
        store.setItem('mousepartyChatHidden', hidden ? '1' : '0');
    } catch (e) {}
}
byId('hideChat').addEventListener('click', () => setChatHidden(true));
setChatHidden(chatHidden);

// ---------- layout, as on YouTube ----------
// side: a desktop window (chat column on the right). stacked: an upright phone
// (chat under the video). overlay: a phone on its side (the video fills; chat
// floats over it).
const app = byId('app');

function layout() {
    const w = window.innerWidth,
        h = window.innerHeight;
    let m;
    // a phone on its side, a desktop, or upright
    if (w > h && h <= 500) m = 'overlay';
    else if (w >= 900 && w > h) m = 'side';
    else m = 'stacked';
    if (app.dataset.mode !== m) {
        app.dataset.mode = m;
        if (m !== 'overlay') app.classList.remove('composing');
        box.scrollTop = box.scrollHeight;
        queueMicrotask(arrangeApps); // the apps' windows move too (after the page's script has all run)
    }
}

// Full screen is the browser's own player's (its button, or a double-click). It
// shows nothing of the page's on top of the video, only the video's subtitle
// tracks. So while the video is full screen, a "Chat" subtitle track carries the
// chat (and the movie's subtitles, if on), in every browser and on iPhones.
let nativeFullscreen = false;
let chatTrack: TextTrack | null = null;

function videoFullscreen(on: boolean) {
    if (on === nativeFullscreen) return;
    nativeFullscreen = on;
    if (on && !chatTrack) chatTrack = video.addTextTrack('subtitles', 'Chat', 'en');
    if (!chatTrack) return;
    chatTrack.mode = on ? 'showing' : 'hidden'; // back on the page, the page shows chat itself
    if (!on) for (const cue of [...(chatTrack.cues || [])]) chatTrack.removeCue(cue);
}
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(ev, () => videoFullscreen(fullscreenElement() === video));
}
video.addEventListener('webkitbeginfullscreen', () => videoFullscreen(true)); // iPhone, and Safari
video.addEventListener('webkitendfullscreen', () => videoFullscreen(false));
video.addEventListener('webkitpresentationmodechanged', () => videoFullscreen(video.webkitPresentationMode === 'fullscreen'));

function subtitleLine(text: string, seconds: number) {
    if (!nativeFullscreen || !chatTrack || !text) return;
    const now = video.currentTime;
    for (const cue of [...(chatTrack.cues || [])]) {
        // keep the track small
        if (cue.endTime < now - 1) chatTrack.removeCue(cue);
    }
    chatTrack.addCue(new VTTCue(now, now + seconds, text));
}

// The chat tab: brings a hidden chat back; on a phone on its side, opens the
// panel with the header and the message box
chatTab.addEventListener('click', () => {
    if (chatHidden) return setChatHidden(false);
    app.classList.toggle('composing');
    if (app.classList.contains('composing')) {
        (myName ? byId('messageInput') : byId('usernameInput')).focus();
    }
});
for (const ev of ['resize', 'orientationchange']) window.addEventListener(ev, layout);
layout();

// The on-screen keyboard: fit the page to what it leaves visible, so the video
// stays put at the top and the chat shrinks, as on YouTube. iOS reports this as
// the visual viewport (and nudges it down to show the input); Android Chrome
// resizes the page itself (interactive-widget in the viewport meta).
function fitToKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    app.style.setProperty('--visible-height', `${vv.height}px`);
    app.style.setProperty('--visible-top', `${vv.offsetTop}px`);
    window.scrollTo(0, 0);
    box.scrollTop = box.scrollHeight; // keep the newest lines in view above the keyboard
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitToKeyboard);
    window.visualViewport.addEventListener('scroll', fitToKeyboard);
    fitToKeyboard();
}

// ---------- subtitles ----------
// The host sends which tracks this movie has and the movie's position (as it
// leaves the Mac). Each viewer turns subtitles on or off for themselves, and
// shows the line for that position less their own delay behind the host.
const captionsEl = byId('captions');
const ccBtn = byId('captionsBtn');
const ccMenu = byId('captionsMenu');
let subs: Pick<Subs, 'token' | 'tracks'> = { token: null, tracks: [] };
let clock: (Clock & { at: number }) | null = null; // {token, position, at: performance.now() when it was that}
let chosen: string | null = null; // the track id showing, or null
let cueList: Cue[] = []; // [[start, end, text]] in movie seconds
let nudge = 0; // seconds: positive shows them later
let wanted: string | null = null; // remembered across movies: a language (or label), or 'off'; null until they pick
try {
    wanted = store.getItem('mousepartySubs');
} catch (e) {}

function setSubs(s: Subs | undefined) {
    if (!s) return;
    const changed = s.token !== subs.token;
    subs = { token: s.token, tracks: s.tracks || [] };
    ccBtn.hidden = !subs.tracks.length;
    if (!subs.tracks.length) ccMenu.hidden = true;
    if (changed) {
        chosen = null;
        cueList = [];
        // what this viewer last picked, else the one the host starts on (the host's language, for a foreign film)
        const t = wanted ? wanted !== 'off' && subs.tracks.find((t) => (t.lang || t.label) === wanted) : subs.tracks.find((t) => t.default);
        if (t) choose(t.id, false);
    }
    ccBtn.classList.toggle('on', !!chosen);
    if (!ccMenu.hidden) buildMenu();
}

function setClock(c: Clock | null) {
    clock = c ? { token: c.token, position: c.position, at: performance.now() } : null;
}

async function choose(id: string | null, remember = true) {
    chosen = id;
    cueList = [];
    const t = subs.tracks.find((t) => t.id === id);
    if (remember) {
        wanted = t ? t.lang || t.label : 'off';
        try {
            store.setItem('mousepartySubs', wanted);
        } catch (e) {}
    }
    ccBtn.classList.toggle('on', !!id);
    buildMenu();
    if (!id) return render();
    const token = subs.token;
    try {
        const r = await fetch(`${BASE}/subs/${encodeURIComponent(token!)}/${encodeURIComponent(id)}`);
        if (r.ok && subs.token === token && chosen === id) cueList = (await r.json()) as Cue[];
    } catch (e) {}
}

// How far behind the host this viewer is: HLS knows; WebRTC is a fraction of a second
function viewerDelay() {
    return mode === 'HLS' && hlsRef && hlsRef.latency != null ? hlsRef.latency : 0.35;
}

function render() {
    let text = '';
    if (chosen && cueList.length && clock && clock.token === subs.token) {
        const t = clock.position + (performance.now() - clock.at) / 1000 - viewerDelay() - nudge;
        text = cueList
            .filter((c) => c[0] <= t && t < c[1])
            .map((c) => c[2])
            .join('\n');
    }
    if (captionsEl.dataset.text === text) return;
    if (text) {
        // in an iPhone's full screen, the movie's line goes in the same track, for as long as it lasts
        const t = clock!.position + (performance.now() - clock!.at) / 1000 - viewerDelay() - nudge;
        const end = Math.min(...cueList.filter((c) => c[0] <= t && t < c[1]).map((c) => c[1]));
        subtitleLine(text, Math.max(0.5, end - t));
    }
    captionsEl.dataset.text = text;
    captionsEl.textContent = '';
    if (text) {
        const span = document.createElement('span');
        span.textContent = text; // never innerHTML: subtitle files are text from anywhere
        captionsEl.appendChild(span);
    }
    captionsEl.hidden = !text;
    // over the video, the chat lines sit above the subtitles
    app.style.setProperty('--captions-room', text ? `${captionsEl.offsetHeight + window.innerHeight * 0.06}px` : '0px');
}

function buildMenu() {
    ccMenu.textContent = '';
    const item = (label: string, on: boolean, fn: () => void, stayOpen = false) => {
        const b = document.createElement('button');
        b.textContent = label;
        if (on) b.classList.add('on');
        b.addEventListener('click', (e) => {
            e.stopPropagation(); // the menu is rebuilt; don't let the page think we clicked away
            if (!stayOpen) ccMenu.hidden = true;
            fn();
        });
        ccMenu.appendChild(b);
    };
    item('Off', !chosen, () => choose(null));
    subs.tracks.forEach((t) => item(t.label, chosen === t.id, () => choose(t.id)));
    if (!chosen) return;
    ccMenu.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
    ccMenu.appendChild(
        Object.assign(document.createElement('div'), {
            className: 'small',
            textContent: `Timing: ${nudge > 0 ? '+' : ''}${nudge.toFixed(1)}s`,
        }),
    );
    item(
        'Show them earlier',
        false,
        () => {
            nudge -= 0.5;
            buildMenu();
        },
        true,
    );
    item(
        'Show them later',
        false,
        () => {
            nudge += 0.5;
            buildMenu();
        },
        true,
    );
}

ccBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ccMenu.hidden = !ccMenu.hidden;
    if (!ccMenu.hidden) buildMenu();
});
document.addEventListener('click', (e) => {
    if (!ccMenu.hidden && !ccMenu.contains(e.target as Node)) ccMenu.hidden = true;
});
setInterval(render, 100);

// ---------- the guide ----------
// The host's Mac sends what's on and next, with start times as moments (epoch
// seconds) and its own "now"; shown here in this viewer's own time zone. The
// host's now also corrects for this machine's clock being off.
const guide = byId('guide');
let schedule: { rows: Schedule['rows']; skew: number } = { rows: [], skew: 0 };

function setSchedule(m: Schedule | undefined) {
    if (!m || !m.rows) return;
    schedule = { rows: m.rows, skew: Date.now() / 1000 - m.now }; // add skew to a host time to get ours
    // the tab is named after what's on (the first row has a start time once the host presses Play)
    const on = m.rows[0];
    document.title = on && on.start != null ? on.title : 'Mouse Party';
    if (!guide.hidden) renderGuide();
}

function runtime(seconds: number) {
    const m = Math.round(seconds / 60),
        h = Math.floor(m / 60);
    return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

function clockTime(epoch: number) {
    return new Date(epoch * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderGuide() {
    const rowsEl = byId('guideRows');
    const now = Date.now() / 1000;
    const zone = new Date().toLocaleTimeString([], { timeZoneName: 'short' }).split(' ').pop();
    byId('guideZone').textContent = `times in your time zone (${zone})`;
    byId('guideClock').textContent = clockTime(now);
    rowsEl.textContent = '';
    if (!schedule.rows.length) {
        rowsEl.appendChild(
            Object.assign(document.createElement('div'), {
                className: 'guide-empty',
                textContent: 'Nothing scheduled yet.',
            }),
        );
        return;
    }
    const started = schedule.rows[0].start != null;
    schedule.rows.forEach((r, i) => {
        const start = r.start != null ? r.start + schedule.skew : null;
        const end = start != null && !r.pages && !r.data ? start + r.duration : null; // a PDF or a database: as long as the reading takes
        const onNow = start != null && start <= now && (r.pages || r.data ? i === 0 : now < end!);
        const row = document.createElement('div');
        row.className = 'guide-row' + (onNow ? ' now' : '');
        const time = Object.assign(document.createElement('div'), { className: 'time', textContent: start != null ? clockTime(start) : '—' });
        const what = Object.assign(document.createElement('div'), { className: 'what' });
        what.appendChild(Object.assign(document.createElement('div'), { className: 'name', textContent: r.title }));
        const tags = Object.assign(document.createElement('div'), { className: 'tags' });
        const tag = (text: string, cls = '') => tags.appendChild(Object.assign(document.createElement('span'), { className: 'tag ' + cls, textContent: text }));
        if (onNow) tag('ON NOW', 'now');
        else if (i === 0 && !started) tag('UP FIRST');
        else if (i === 0 || (i === 1 && onNowFirst())) tag('UP NEXT');
        if (r.cc) tag('CC');
        if (end != null) tags.appendChild(document.createTextNode(onNow ? `ends ${clockTime(end)}` : `until ${clockTime(end)}`));
        what.appendChild(tags);
        row.append(
            time,
            what,
            Object.assign(document.createElement('div'), {
                className: 'runtime',
                textContent: r.data ? 'data' : r.pages ? `${r.pages} pp` : runtime(r.duration),
            }),
        );
        if (onNow && end != null) {
            const bar = Object.assign(document.createElement('div'), { className: 'bar' });
            bar.appendChild(Object.assign(document.createElement('span'), { style: `width: ${Math.min(100, (100 * (now - start)) / r.duration)}%` }));
            row.appendChild(bar);
        }
        rowsEl.appendChild(row);
    });
    if (!started) {
        rowsEl.appendChild(
            Object.assign(document.createElement('div'), {
                className: 'guide-note',
                textContent: 'Times appear once the host presses Play.',
            }),
        );
    }
}

function onNowFirst() {
    const r = schedule.rows[0];
    if (!r || r.start == null) return false;
    const now = Date.now() / 1000,
        start = r.start + schedule.skew;
    return start <= now && (r.pages || r.data || now < start + r.duration);
}

function openGuide(open: boolean) {
    guide.hidden = !open;
    if (open) renderGuide();
}
byId('guideBtn').addEventListener('click', () => openGuide(true));
byId('guideClose').addEventListener('click', () => openGuide(false));
guide.addEventListener('click', (e) => {
    if (e.target === guide) openGuide(false); // click outside the box
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !guide.hidden) openGuide(false);
});
// the clock and the ON NOW bar move
setInterval(() => {
    if (!guide.hidden) renderGuide();
}, 15000);

// ---------- a PDF, read together ----------
// While the host has a PDF up it covers the video (a "reading" card meanwhile):
// the document itself, drawn by pdf.js (fetched the first time one comes up)
// at this screen's size, so it stays sharp, on whatever page the host is on.
// Whole page or fit width is each viewer's own choice.
const docEl = byId('doc');
const docScroll = byId('docScroll');
const docZoom = byId('docZoom');
let doc: Doc | null = null; // {token, title, pages, page}, from the host
let pdf: PdfDocument | null = null; // pdf.js's copy of it
let pdfTask: PdfLoading | null = null; // its loading, which is what lets it go again
let pdfToken: string | null = null; // the doc that is loaded, or loading
let pdfjs: PdfJs | null = null;
let fitWidth = false;
let renderTask: { cancel(): void } | null = null,
    drawing = false,
    drawAgain = false,
    drawnPage: number | null = null;

async function setDoc(d: Doc | null | undefined) {
    if (ended) return;
    const was = doc;
    doc = d || null;
    docEl.hidden = !doc;
    app.classList.toggle('reading', !!doc);
    showSoundButton();
    docEl.classList.toggle('data', doc?.kind === 'db');
    docEl.classList.toggle('text', doc?.kind === 'text');
    if (doc?.kind !== 'db') closeDb();
    if (doc?.kind !== 'text') closeText();
    if (!doc) return closePdf();
    if (doc.kind === 'db') {
        closePdf();
        return showDb(doc);
    }
    if (doc.kind === 'text') {
        closePdf();
        return showText(doc);
    }
    byId('docPage').textContent = `${doc.page} / ${doc.pages}`;
    if (pdfToken === doc.token) {
        if (!was || was.page !== doc.page) drawPage();
        return;
    }
    closePdf();
    const token = (pdfToken = doc.token);
    try {
        if (!pdfjs) {
            pdfjs = (await import(/* @vite-ignore */ `${BASE}/assets/pdf.min.mjs`)) as PdfJs;
            pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/assets/pdf.worker.min.mjs`;
        }
        const task = (pdfTask = pdfjs.getDocument({ url: `${BASE}/doc/${encodeURIComponent(token)}`, isEvalSupported: false }));
        const loaded = await task.promise;
        if (pdfToken !== token) return; // the host moved on while it loaded (closePdf let it go)
        pdf = loaded;
        drawPage();
    } catch (e) {
        console.log('PDF:', e);
        if (pdfToken === token) pdfToken = null; // the next word from the host tries again
    }
}

function closePdf() {
    if (renderTask) renderTask.cancel();
    if (pdfTask) pdfTask.destroy();
    pdf = pdfTask = pdfToken = drawnPage = null;
    docScroll.textContent = '';
}

// Into a new canvas, swapped in when done, so turning a page never flashes blank
async function drawPage() {
    if (!pdf || !doc) return;
    if (drawing) {
        drawAgain = true;
        if (renderTask) renderTask.cancel();
        return;
    }
    drawing = true;
    const loaded = pdf,
        number = Math.min(doc.page, pdf.numPages);
    try {
        const page = await loaded.getPage(number);
        const size = page.getViewport({ scale: 1 });
        const w = docScroll.clientWidth,
            h = docScroll.clientHeight;
        const scale = fitWidth ? w / size.width : Math.min(w / size.width, h / size.height);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        const task = (renderTask = page.render({ canvas, viewport }));
        await task.promise;
        if (pdf !== loaded) return;
        docScroll.replaceChildren(canvas);
        if (drawnPage !== number) docScroll.scrollTop = 0; // a new page starts at its top
        drawnPage = number;
    } catch (e) {
        if (e && (e as Error).name !== 'RenderingCancelledException') console.log('PDF page:', e);
    } finally {
        drawing = false;
        renderTask = null;
        if (drawAgain) {
            drawAgain = false;
            drawPage();
        }
    }
}

// ---------- a database, looked through together ----------
// Its pages, Datasette's (datasette.go; the file stays on the Mac), in a frame
// over the video, on whatever page anyone went to last: where someone here goes
// is sent to everyone ({type: 'doc_at'}).
let dbFrame: HTMLIFrameElement | null = null,
    dbToken: string | null = null;

// tell the frame where everyone is, and whether there's a page before it
const dbTell = () => dbFrame?.contentWindow?.postMessage({ type: 'go', at: doc?.at || '/', back: !!doc?.back }, location.origin);

function showDb(d: Doc) {
    if (dbToken === d.token) return dbTell();
    closeDb();
    dbToken = d.token;
    dbFrame = document.createElement('iframe');
    dbFrame.className = 'doc-data';
    dbFrame.title = d.title;
    dbFrame.src = `${BASE}/data/${encodeURIComponent(d.token)}/${(d.at || '/').slice(1)}`;
    dbFrame.onload = dbTell;
    docEl.append(dbFrame);
}

function closeDb() {
    dbFrame?.remove();
    dbFrame = dbToken = null;
}

// what the frame says (the script datasette.go adds to its pages): where it went, or Back
window.addEventListener('message', (e: MessageEvent<{ type?: string; at?: unknown } | null>) => {
    if (!dbFrame || e.source !== dbFrame.contentWindow || e.origin !== location.origin) return;
    if (e.data?.type === 'went' && typeof e.data.at === 'string') send({ type: 'doc_at', token: dbToken, at: e.data.at });
    if (e.data?.type === 'back') send({ type: 'doc_at', token: dbToken, back: true });
});

// ---------- another document, read together ----------
// A Word file, a PowerPoint, a spreadsheet, an EPUB...: the host reads it (pandoc, session.go) and it's drawn here,
// in the PDF's place, by Tiny Little Office's own editors, read-only (office.js, loaded the first time one comes up)
let textEl: HTMLElement | null = null;
let textKey = ''; // the doc drawn, and how far along it was: reading, read, or couldn't be

async function showText(d: Doc) {
    const key = `${d.token}|${d.ready ? 1 : 0}|${d.error || ''}`;
    if (key === textKey) return;
    closeText();
    textKey = key;
    const el = (textEl = document.createElement('div'));
    el.className = 'doc-text';
    docEl.append(el);
    const note = (words: string) => el.replaceChildren(Object.assign(document.createElement('p'), { className: 'doc-text-note', textContent: words }));
    if (d.error) return note(`Couldn’t read ${d.title}: ${d.error}`);
    if (!d.ready) return note(`Reading ${d.title}…`);
    note(`Opening ${d.title}…`);
    try {
        const r = await fetch(`${BASE}/doc/${encodeURIComponent(d.token)}`);
        if (!r.ok) throw new Error(`${r.status}`);
        const { app, text } = (await r.json()) as { app: string; text: string };
        const office = (await import(/* @vite-ignore */ `${BASE}/apps/office.js`)) as typeof import('./apps/office.ts');
        const lib = await office.library(BASE);
        if (textEl !== el) return; // the host moved on while it loaded
        el.textContent = '';
        await lib.editors.mount(app, text, el, () => {}, { readOnly: true, fill: true });
    } catch (e) {
        console.log('document:', e);
        if (textEl === el) note(`Couldn’t open ${d.title}`);
    }
}

function closeText() {
    textEl?.remove();
    textEl = null;
    textKey = '';
}

function toggleFit() {
    fitWidth = !fitWidth;
    docEl.classList.toggle('fit-width', fitWidth);
    docZoom.textContent = fitWidth ? 'whole page' : 'fit width';
    docZoom.title = fitWidth ? 'Show the whole page (or double-click it)' : 'Fit the width (or double-click the page)';
    drawPage();
}
docZoom.addEventListener('click', toggleFit);
docScroll.addEventListener('dblclick', toggleFit);
let redrawTimer: ReturnType<typeof setTimeout> | undefined;
new ResizeObserver(() => {
    // a new layout, full screen, a phone turned: draw it at the new size
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

// ---------- apps (apps.go) ----------
// Anyone opens an app for everyone with the + by the chat box, and anyone closes
// one with its ✕. Several can be open; each is a window over the video that this
// viewer alone moves (its title bar), sizes (its corners) and hides (–), like a
// desktop with the movie always playing behind it. On a phone there's no room
// for windows: upright, each app is a tab beside Chat under the video; on its
// side, the app chosen fills the screen. A see-through app (Graffiti) stays on
// the picture itself, lined up with it, in every layout.
//
// Each app is a module, apps/<name>.js, whose default export is a function of
// (ctx, view) returning whichever of {view(v), message(m), said(name, text),
// resize(), stop()} it needs (types.ts Start), usually with apps/lib.js's help.
// ctx.layer is the window's inside; ctx.send(m) goes to the app on the host;
// this viewer's view comes back to view(v) whenever it changes, events to message(m).
// A document of any kind is drawn by one script, apps/office.js (info.script).
const desk = byId('desk');
const dock = byId('dock');
const tabsEl = byId('appTabs');
const picker = byId('picker');
let myId: number | null = null; // this page's socket, as the host numbers them
let appKinds: AppKind[] = []; // what the + offers: {name, title, icon}
let appsMax = 8;
interface Place {
    x: number;
    y: number;
    w: number;
    h: number;
}
interface Win {
    info: AppInfo;
    el: HTMLElement;
    body: HTMLElement;
    inst: App | null;
    place: Place; // of the stage
    unfull?: Place | null;
    hidden: boolean;
}
const wins = new Map<number, Win>(); // app id -> its window
let zTop = 0,
    zGlass = 0; // stacking: see-through windows are on the picture, so always under the others
let tab: number | null = null; // on a phone: the app shown (its id), or null for the chat (upright) or the video (on its side)
let openedHere: string | null = null; // the name of the app this page just asked for: shown when it arrives

// a module of apps/ (each is fetched the first time it's wanted, and kept)
const appModule = (name: string): Promise<{ default?: unknown }> => import(/* @vite-ignore */ `${BASE}/apps/${encodeURIComponent(name)}.js`);

// loadAppScript: the app's own module (what they all share, apps/lib.js, comes with it)
async function loadAppScript(name: string) {
    const start = (await appModule(name)).default;
    if (typeof start !== 'function') throw new Error(name);
    return start as Start;
}

let lucide: ((name: string) => string) | null = null;
let iconsLoading: Promise<unknown> | null = null; // one load, however many windows ask at once
async function icons() {
    if (typeof lucide !== 'function')
        await (iconsLoading =
            iconsLoading ||
            appModule('icons').then((m) => {
                lucide = m.default as (name: string) => string;
            }));
}
const icon = (name: string) => (typeof lucide === 'function' ? lucide(name) : '');

const compact = () => app.dataset.mode !== 'side';

// where a new window goes, in fractions of the stage: the whole picture, most of it, or a corner
function firstPlace(size: AppInfo['size']): Place {
    const n = [...wins.values()].filter((w) => !w.info.glass).length % 5,
        step = 0.035 * n;
    if (size === 'full') return { x: 0, y: 0, w: 1, h: 1 };
    if (size === 'small') return { x: 0.6 - step, y: 0.04 + step, w: 0.38, h: 0.55 };
    return { x: 0.08 + step, y: 0.06 + step, w: 0.8, h: 0.84 };
}

function setApps(list: AppInfo[]) {
    for (const id of [...wins.keys()]) if (!list.some((a) => a.id === id)) closeApp(id);
    for (const a of list) openApp(a); // the ones already up start again, where they were, from the view just sent
}

// how solid each kind of window is for this viewer (the slider in its bar), 0.02 to 1: the movie shows through the rest
const GLASS_KEY = 'mousepartyGlass';
const glassOf: Record<string, number> = (() => {
    try {
        return JSON.parse(localStorage.getItem(GLASS_KEY)!) || {};
    } catch (e) {
        return {};
    }
})();
function setGlass(w: Win, value: number) {
    w.el.style.setProperty('--glass', String(value));
    if (w.inst && w.inst.resize) w.inst.resize(); // what paints its own background (Sketch's paper) paints it again
}

async function openApp(info: AppInfo) {
    let w = wins.get(info.id);
    if (!w) {
        const el = document.createElement('div');
        el.className = 'win' + (info.glass ? ' glass' : '') + (['office', 'reel'].includes(info.script) ? ' office' : '');
        el.innerHTML =
            '<div class="win-bar"><span class="win-icon"></span><span class="win-title"></span>' +
            '<input class="win-glass" type="range" min="2" max="100" title="See-through or solid (for you)" aria-label="How solid this window is">' +
            '<button class="win-btn win-min" title="Hide it (for you)">–</button>' +
            '<button class="win-btn win-close" title="Close it for everyone">✕</button></div>' +
            '<div class="win-body"></div>' +
            ['nw', 'ne', 'sw', 'se'].map((c) => `<div class="win-grip ${c}" data-corner="${c}"></div>`).join('');
        const nw: Win = { info, place: firstPlace(info.size), hidden: false, el, body: el.querySelector<HTMLElement>('.win-body')!, inst: null };
        w = nw;
        el.querySelector('.win-title')!.textContent = info.title;
        el.querySelector<HTMLElement>('.win-bar')!.title = info.by ? `${info.title}, opened by ${info.by}` : info.title;
        el.querySelector<HTMLElement>('.win-close')!.onclick = () => send({ type: 'app_close', id: info.id });
        el.querySelector<HTMLElement>('.win-min')!.onclick = () => {
            nw.hidden = true;
            arrangeApps();
        };
        const glass = el.querySelector<HTMLInputElement>('.win-glass')!;
        glass.value = String(Math.round(100 * (glassOf[info.name] ?? 0.6)));
        el.style.setProperty('--glass', String(Number(glass.value) / 100));
        glass.oninput = () => {
            setGlass(nw, Number(glass.value) / 100);
            glassOf[info.name] = Number(glass.value) / 100;
            try {
                localStorage.setItem(GLASS_KEY, JSON.stringify(glassOf));
            } catch (e) {}
        };
        el.addEventListener('pointerdown', () => front(nw), true);
        windowHandles(nw);
        new ResizeObserver(() => {
            if (nw.inst && nw.inst.resize) nw.inst.resize();
        }).observe(nw.body);
        wins.set(info.id, nw);
        if (info.name === openedHere) {
            // asked for here: show it
            openedHere = null;
            tab = info.glass ? tab : info.id;
        }
        front(nw);
        arrangeApps();
        icons().then(() => {
            el.querySelector('.win-icon')!.innerHTML = icon(info.icon);
            renderTabs();
        });
    }
    w.info = info;
    if (w.inst && w.inst.stop) w.inst.stop();
    w.inst = null;
    w.body.textContent = '';
    let start: Start;
    try {
        start = await loadAppScript(info.script || info.name);
    } catch (e) {
        return;
    }
    if (wins.get(info.id) !== w || w.info !== info) return; // closed, or started again, meanwhile
    const win = w;
    const ctx: Ctx = {
        layer: w.body,
        send: (msg: AppMsg) => send({ ...msg, type: 'app', id: info.id }),
        me: () => ({ id: myId, name: myName }),
        videoBox: () => videoBox(win),
        base: BASE, // the session's path: pictures (img/), the documents' editors (office/)
        // another app, for everyone
        open: (name) => {
            openedHere = name;
            send({ type: 'app_open', name });
        },
    };
    w.inst = start(ctx, info.view) || {};
}

function closeApp(id: number) {
    const w = wins.get(id);
    if (!w) return;
    if (w.inst && w.inst.stop) w.inst.stop();
    w.el.remove();
    wins.delete(id);
    if (tab === id) tab = null;
    arrangeApps();
}

function front(w: Win) {
    w.el.style.zIndex = String(w.info.glass ? ++zGlass : 100000 + ++zTop);
}

// arrangeApps: every window where it belongs for this layout, and the tabs
function arrangeApps() {
    const mode = app.dataset.mode;
    if (tab !== null && !wins.has(tab)) tab = null;
    for (const w of wins.values()) {
        const docked = mode === 'stacked' && !w.info.glass; // upright phone: under the video, in the chat's place
        const parent = docked ? dock : desk;
        if (w.el.parentNode !== parent) parent.appendChild(w.el);
        const shown = compact() && !w.info.glass ? tab === w.info.id : !w.hidden;
        w.el.hidden = !shown;
        w.el.classList.toggle('filled', compact() && !w.info.glass);
        if (!compact() || w.info.glass) {
            const p = compact() ? { x: 0, y: 0, w: 1, h: 1 } : w.place;
            Object.assign(w.el.style, { left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%` });
        } else {
            Object.assign(w.el.style, { left: '', top: '', width: '', height: '' });
        }
    }
    app.classList.toggle('app-tab', mode === 'stacked' && tab !== null);
    renderTabs();
}

// the tabs: on a desktop, a chip each to hide or show it; on a phone, Chat (or the video) and a tab each
function renderTabs() {
    const list = [...wins.values()];
    const mode = app.dataset.mode;
    tabsEl.hidden = !list.length;
    if (mode === 'overlay' ? tabsEl.parentNode !== desk : tabsEl.parentNode !== dock.parentNode) {
        if (mode === 'overlay') desk.appendChild(tabsEl);
        else dock.parentNode!.insertBefore(tabsEl, dock);
    }
    tabsEl.textContent = '';
    const chip = (label: string, on: boolean, click: () => void, iconName?: string, title?: string) => {
        const b = document.createElement('button');
        b.className = 'app-chip' + (on ? ' on' : '');
        b.innerHTML = iconName ? icon(iconName) : '';
        b.append(label);
        b.title = title || '';
        b.onclick = click;
        tabsEl.appendChild(b);
    };
    if (compact())
        chip(mode === 'stacked' ? 'Chat' : 'Video', tab === null, () => {
            tab = null;
            arrangeApps();
        });
    for (const w of list) {
        const on = compact() && !w.info.glass ? tab === w.info.id : !w.hidden;
        chip(
            w.info.title,
            on,
            () => {
                if (compact() && !w.info.glass) tab = tab === w.info.id ? null : w.info.id;
                else {
                    w.hidden = !w.hidden;
                    if (!w.hidden) front(w);
                }
                arrangeApps();
            },
            w.info.icon,
            compact() ? '' : w.hidden ? 'Show it' : 'Hide it (for you)',
        );
    }
}

// moving a window by its title bar, and sizing it by its corners, within the stage
function windowHandles(w: Win) {
    const MIN_W = 180,
        MIN_H = 120;
    const startDrag = (e: PointerEvent, corner: string | null) => {
        if (compact() || e.button > 0 || (e.target as Element).closest('.win-btn, .win-glass')) return;
        e.preventDefault();
        const stage = desk.getBoundingClientRect(),
            p0 = { ...w.place },
            x0 = e.clientX,
            y0 = e.clientY;
        const minW = Math.min(1, MIN_W / stage.width),
            minH = Math.min(1, MIN_H / stage.height);
        w.el.classList.add('moving');
        const move = (ev: PointerEvent) => {
            const dx = (ev.clientX - x0) / stage.width,
                dy = (ev.clientY - y0) / stage.height;
            const p = { ...p0 };
            if (!corner) {
                p.x = Math.min(Math.max(p0.x + dx, 0), 1 - p0.w);
                p.y = Math.min(Math.max(p0.y + dy, 0), 1 - p0.h);
            } else {
                if (corner.includes('w')) {
                    p.x = Math.min(Math.max(p0.x + dx, 0), p0.x + p0.w - minW);
                    p.w = p0.x + p0.w - p.x;
                }
                if (corner.includes('e')) p.w = Math.min(Math.max(p0.w + dx, minW), 1 - p0.x);
                if (corner.includes('n')) {
                    p.y = Math.min(Math.max(p0.y + dy, 0), p0.y + p0.h - minH);
                    p.h = p0.y + p0.h - p.y;
                }
                if (corner.includes('s')) p.h = Math.min(Math.max(p0.h + dy, minH), 1 - p0.y);
            }
            w.place = p;
            arrangeApps();
        };
        const up = () => {
            w.el.classList.remove('moving');
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    };
    const bar = w.el.querySelector<HTMLElement>('.win-bar')!;
    bar.addEventListener('pointerdown', (e) => startDrag(e, null));
    bar.addEventListener('dblclick', (e) => {
        // the whole picture, and back to where it was before
        if (compact() || (e.target as Element).closest('.win-btn, .win-glass')) return;
        const full = w.place.x === 0 && w.place.y === 0 && w.place.w === 1 && w.place.h === 1;
        if (full) {
            w.place = w.unfull || firstPlace(w.info.size === 'full' ? 'big' : w.info.size);
            w.unfull = null;
        } else {
            w.unfull = { ...w.place }; // kept before it's made full, so it can go back
            w.place = { x: 0, y: 0, w: 1, h: 1 };
        }
        arrangeApps();
    });
    for (const g of w.el.querySelectorAll<HTMLElement>('.win-grip')) g.addEventListener('pointerdown', (e) => startDrag(e, g.dataset.corner!));
}

// videoBox: a 16:9 picture in the app's window, for apps that draw. See-through
// apps: where the video's picture really is, so what's drawn lines up with the
// movie for everyone; the others: the biggest 16:9 that fits the window.
function videoBox(w: Win): Box {
    const body = w.body.getBoundingClientRect();
    if (w.info.glass) {
        const st = desk.getBoundingClientRect();
        const vw = Math.min(st.width, (st.height * 16) / 9),
            vh = (vw * 9) / 16;
        return { x: st.left + (st.width - vw) / 2 - body.left, y: st.top + (st.height - vh) / 2 - body.top, w: vw, h: vh };
    }
    const vw = Math.min(body.width, (body.height * 16) / 9),
        vh = (vw * 9) / 16;
    return { x: (body.width - vw) / 2, y: (body.height - vh) / 2, w: vw, h: vh };
}

// the +: a grid of every app, to open one for everyone
async function togglePicker() {
    if (!picker.hidden) {
        picker.hidden = true;
        return;
    }
    await icons();
    picker.textContent = '';
    const full = wins.size >= appsMax;
    const head = document.createElement('div');
    head.className = 'picker-head';
    head.textContent = full ? `${appsMax} apps are open: close one first` : 'Open an app for everyone';
    picker.appendChild(head);
    for (const k of appKinds) {
        const b = document.createElement('button');
        b.className = 'picker-app';
        b.disabled = full;
        b.innerHTML = icon(k.icon) + '<span></span>';
        b.lastChild!.textContent = k.min > 1 ? `${k.title} ${k.min}+` : k.title;
        if (k.min > 1) b.title = `Needs ${k.min} players`;
        b.onclick = () => {
            openedHere = k.name;
            send({ type: 'app_open', name: k.name });
            picker.hidden = true;
        };
        picker.appendChild(b);
    }
    picker.hidden = false;
}
for (const b of document.querySelectorAll('.plus'))
    b.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePicker();
    });
document.addEventListener('pointerdown', (e) => {
    if (!picker.hidden && !picker.contains(e.target as Node) && !(e.target as Element).closest('.plus')) picker.hidden = true;
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') picker.hidden = true;
});
arrangeApps();
