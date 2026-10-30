// Open House Party viewer for a session hosted from someone's Mac (host.go).
// Video: WebRTC straight from the host (WHEP), or HLS from the host if WebRTC
// can't get through. Chat: a WebSocket to the host. BASE is /<session key>.
// Nothing here talks to any other server, except a STUN server when the host
// shares through Cloudflare (it lists it in /status): that lets WebRTC punch
// through both ends' routers.
const BASE = window.OPENHOUSEPARTY_BASE;
// Sessions are meant to leave nothing behind: what the page remembers (your
// name, subtitle language, whether chat is hidden) lasts only as long as the tab
const store = window.sessionStorage;
const HOST_GONE_MS = 20000;         // no host for this long: the session is over, wipe the page
const WEBRTC_TIMEOUT_MS = 8000;      // no picture by then: fall back to HLS
const STATUS_POLL_MS = 5000;
const MAX_MESSAGES = 200;            // kept in the chat column, like YouTube's
const FRESH_MS = 8000;              // how long a line stays up over the video

const video = document.getElementById('video');
const statusText = document.getElementById('statusText');
const statusIndicator = document.getElementById('statusIndicator');
let mode = null;          // 'WebRTC' | 'HLS'
let hlsRef = null;
let playing = false;

function setStatus(text, live) {
    for (const [label, dot] of [[statusText, statusIndicator],
                                [document.getElementById('headerStatus'), document.getElementById('headerDot')]]) {
        label.textContent = text;
        dot.classList.toggle('live', !!live);
    }
    document.getElementById('app').classList.toggle('is-live', !!live);   // the badge over the video only shows when not
}

// ---------- sound ----------
// Autoplay only works muted; the prompt shows whenever the video plays without
// sound, unless they've dismissed it (for this page load), choosing silence
const soundPrompt = document.getElementById('soundPrompt');
let soundDismissed = false;
function showSoundButton() {      // not over a PDF: the stream is silent while one is up
    soundPrompt.hidden = soundDismissed || !(video.muted || video.volume === 0) || video.paused
        || document.getElementById('app').classList.contains('reading');
}
document.getElementById('soundButton').addEventListener('click', () => {
    video.muted = false;
    if (video.volume === 0) video.volume = 1;
    video.play().catch(() => {});
});
document.getElementById('soundDismiss').addEventListener('click', () => {
    soundDismissed = true;
    showSoundButton();
});
video.addEventListener('volumechange', showSoundButton);
video.addEventListener('playing', showSoundButton);
video.addEventListener('pause', showSoundButton);

// ---------- video: WebRTC first ----------
let pcRef = null;
async function startWebRTC() {
    if (ended) return;
    let pc, iceServers = [];
    try {
        iceServers = (await (await fetch(`${BASE}/status`, { cache: 'no-store' })).json()).iceServers || [];
    } catch (e) {}
    try {
        pc = new RTCPeerConnection({ iceServers });
        pcRef = pc;
    } catch (err) {                                      // no WebRTC in this browser at all
        return startHLS('no WebRTC here');
    }
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = (e) => { video.srcObject = e.streams[0]; };
    let gaveUp = false;
    const timer = setTimeout(() => { gaveUp = true; pc.close(); startHLS('WebRTC did not connect'); }, WEBRTC_TIMEOUT_MS);
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
            setTimeout(() => { if (pc.connectionState !== 'connected') { pc.close(); playing = false; startWebRTC(); } }, 4000);
        }
    };
    try {
        await pc.setLocalDescription(await pc.createOffer());
        await new Promise((done) => {      // send every candidate in one go (no trickle)
            if (pc.iceGatheringState === 'complete') return done();
            pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && done();
            setTimeout(done, iceServers.length ? 2500 : 1500);   // STUN answers take a moment
        });
        const resp = await fetch(`${BASE}/whep`, {
            method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription.sdp,
        });
        if (!resp.ok) throw new Error(`handshake ${resp.status}`);
        await pc.setRemoteDescription({ type: 'answer', sdp: await resp.text() });
    } catch (err) {
        console.log('WebRTC:', err);
        if (!gaveUp) { gaveUp = true; clearTimeout(timer); pc.close(); startHLS('WebRTC unavailable'); }
    }
}

// ---------- video: HLS fallback, from the same host ----------
function keepUpWithLive(hls) {      // catch up after hand-offs by playing 10% faster
    setInterval(() => {
        const latency = hls.latency, target = hls.targetLatency;
        if (latency == null || target == null || video.paused) return;
        const ahead = video.buffered.length ? video.buffered.end(video.buffered.length - 1) - video.currentTime : 0;
        if (latency > target + 1 && ahead > 1) video.playbackRate = 1.1;
        else if (latency < target + 0.3 || ahead < 0.5) video.playbackRate = 1;
    }, 1000);
}

function startHLS(why) {
    console.log(why + '; using HLS');
    mode = 'HLS';
    video.srcObject = null;
    const url = `${BASE}/hls/index.m3u8`;
    if (window.Hls && Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 20,
                              maxBufferLength: 10, backBufferLength: 10 });
        hlsRef = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { playing = true; video.play().catch(() => {}); });
        hls.on(Hls.Events.ERROR, (e, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else setTimeout(() => hls.loadSource(url), 3000);
        });
        keepUpWithLive(hls);
    } else {                                  // Safari plays HLS itself
        video.src = url;
        video.addEventListener('loadedmetadata', () => { playing = true; video.play().catch(() => {}); });
    }
}

async function pollStatus() {
    try {
        const s = await (await fetch(`${BASE}/status`, { cache: 'no-store' })).json();
        document.getElementById('viewerCount').textContent = s.viewers ? `${s.viewers} watching` : '';
        setSubs(s.subs);
        setClock(s.clock);
        setSchedule(s.schedule);
        setDoc(s.doc && s.doc.doc);
        if (!playing) setStatus('Connecting...', false);
        else setStatus((s.standby ? 'Stand by' : 'Live') + (mode === 'HLS' ? ' · HLS' : ''), !s.standby);
        hostSeen = Date.now();
    } catch (e) {
        setStatus('Host unreachable', false);    // they quit, or their connection dropped
        if (Date.now() - hostSeen > HOST_GONE_MS) endSession('The host has gone, and the session with them.');
    }
}

// When the host quits, the session is over: nothing of it stays on this page
let ended = false;
let hostSeen = Date.now();
function endSession(why) {
    if (ended) return;
    ended = true;
    try { pcRef && pcRef.close(); } catch (e) {}
    try { hlsRef && hlsRef.destroy(); } catch (e) {}
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
    document.getElementById('onlineUsers').textContent = '';
    schedule = { rows: [], skew: 0 };
    closePdf();
    setApp(null);
    doc = null;
    document.getElementById('doc').hidden = true;
    document.title = 'Open House Party';
    document.getElementById('guide').hidden = true;
    document.getElementById('viewerCount').textContent = '';
    try { store.clear(); } catch (e) {}
    setStatus('Session ended', false);
    const note = Object.assign(document.createElement('div'), { className: 'ended', textContent: why });
    document.getElementById('stage').appendChild(note);
    document.getElementById('soundPrompt').hidden = true;
    if (ws) { ws.onclose = null; ws.close(); }
}

// ---------- chat ----------
let ws = null;
let myName = null;
try { myName = store.getItem('openhousepartyName'); } catch (e) {}
let retry = 1000;
const box = document.getElementById('chatMessagesOverlay');

function connectChat() {
    if (ended) return;
    setChatState('connecting');
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${BASE}/ws`);
    ws.onopen = () => { retry = 1000; setChatState('connected'); if (myName) send({ type: 'join', name: myName }); };
    ws.onclose = (e) => {
        if (e.code === 1001) return endSession('The host ended the session.');   // they quit the app
        if (ended) return;
        setChatState('disconnected');
        setTimeout(connectChat, retry);
        retry = Math.min(retry * 2, 10000);
    };
    ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'hello') {
            box.textContent = '';
            m.history.forEach((h) => show(h, false));
            updateOnline(m.online);
            setSubs(m.subs);
            setClock(m.clock);
            setSchedule(m.schedule);
            setDoc(m.doc && m.doc.doc);
            myId = m.you;
            setApp(m.apps);
        } else if (m.type === 'apps') {
            setApp(m);
        } else if (m.type === 'app') {
            if (!appNow) return;
            if (m.kind === 'view') { if (appNow.inst.view) appNow.inst.view(m.view); }
            else if (appNow.inst.message) appNow.inst.message(m);
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
            if (m.type === 'msg' && appNow && appNow.inst.said) appNow.inst.said(m.name, m.text);
        }
    };
}

function send(m) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }

function join(name) {
    name = name.trim().slice(0, 30);
    if (!name) return;
    myName = name;
    try { store.setItem('openhousepartyName', name); } catch (e) {}
    send({ type: 'join', name });
    showChatInput();
}

function showChatInput() {
    document.getElementById('joinOverlay').style.display = 'none';
    document.getElementById('chatInputBox').style.display = '';
    document.getElementById('currentUserDisplay').textContent = myName;
}

// Every line stays in the chat column. Over the video (overlay mode) only lines
// marked fresh show, for FRESH_MS, the newest four at a time, like subtitles.
function show(m, live) {
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const el = document.createElement('div');
    if (m.type === 'system') {
        el.className = 'msg system';
        el.textContent = m.text;
    } else {
        el.className = 'msg';
        const time = new Date(m.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        for (const [cls, text] of [['name', m.name], ['text', m.text], ['time', time]]) {
            const span = document.createElement('span');
            span.className = cls;
            span.textContent = text;           // never innerHTML: names and text are other people's
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
        setTimeout(() => { el.classList.remove('fresh'); setTimeout(() => el.classList.add('gone'), 900); }, FRESH_MS);
    } else {
        el.classList.add('gone');
    }
    box.appendChild(el);
    while (box.children.length > MAX_MESSAGES) box.firstChild.remove();
    if (atBottom || !live || m.name === myName) box.scrollTop = box.scrollHeight;   // don't yank someone reading back
}

function updateOnline(names) {
    document.getElementById('onlineUsers').textContent = names.length ? 'here: ' + names.join(', ') : '';
}

function setChatState(state) {
    const el = document.getElementById('chatConnectionIndicator');
    el.className = 'conn ' + state;
    el.textContent = { connected: '● connected', connecting: 'connecting…', disconnected: 'reconnecting…' }[state];
}

document.getElementById('joinBtn').addEventListener('click', () => join(document.getElementById('usernameInput').value));
document.getElementById('usernameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(e.target.value); });
// The message box grows as you type (to its CSS max-height, then scrolls).
// Enter sends; Shift-Enter is a new line.
const messageInput = document.getElementById('messageInput');
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
document.getElementById('nameBtn').addEventListener('click', () => {
    document.getElementById('chatInputBox').style.display = 'none';
    document.getElementById('joinOverlay').style.display = '';
    document.getElementById('usernameInput').value = myName || '';
    document.getElementById('usernameInput').focus();
});

// ---------- hiding the chat ----------
// Remembered per device. While hidden, the chat tab on the video's right edge
// counts the messages that arrive (not your own, not joins and leaves).
let chatHidden = false;
try { chatHidden = store.getItem('openhousepartyChatHidden') === '1'; } catch (e) {}
let unread = 0;
const chatTab = document.getElementById('chatTab');
const unreadEl = document.getElementById('unread');

function showUnread() {
    unreadEl.hidden = !unread;
    unreadEl.textContent = unread > 99 ? '99+' : String(unread);
    chatTab.title = chatHidden ? (unread ? `Show chat (${unread} new)` : 'Show chat') : 'Chat';
}

function setChatHidden(hidden) {
    chatHidden = hidden;
    document.getElementById('app').classList.toggle('chat-hidden', hidden);
    document.getElementById('app').classList.remove('composing');
    if (!hidden) {
        unread = 0;
        box.scrollTop = box.scrollHeight;
    }
    showUnread();
    try { store.setItem('openhousepartyChatHidden', hidden ? '1' : '0'); } catch (e) {}
}
document.getElementById('hideChat').addEventListener('click', () => setChatHidden(true));
setChatHidden(chatHidden);

// ---------- layout, as on YouTube ----------
// side: a desktop window (chat column on the right). stacked: an upright phone
// (chat under the video). overlay: a phone on its side (the video fills; chat
// floats over it).
const app = document.getElementById('app');

function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    let m;
    if (w > h && h <= 500) m = 'overlay';               // a phone on its side
    else if (w >= 900 && w > h) m = 'side';
    else m = 'stacked';
    if (app.dataset.mode !== m) {
        app.dataset.mode = m;
        if (m !== 'overlay') app.classList.remove('composing');
        box.scrollTop = box.scrollHeight;
    }
}

// Full screen is the browser's own player's (its button, or a double-click). It
// shows nothing of the page's on top of the video, only the video's subtitle
// tracks. So while the video is full screen, a "Chat" subtitle track carries the
// chat (and the movie's subtitles, if on), in every browser and on iPhones.
let nativeFullscreen = false;
let chatTrack = null;

function videoFullscreen(on) {
    if (on === nativeFullscreen) return;
    nativeFullscreen = on;
    if (on && !chatTrack) chatTrack = video.addTextTrack('subtitles', 'Chat', 'en');
    if (!chatTrack) return;
    chatTrack.mode = on ? 'showing' : 'hidden';             // back on the page, the page shows chat itself
    if (!on) for (const cue of [...(chatTrack.cues || [])]) chatTrack.removeCue(cue);
}
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(ev, () => videoFullscreen(fullscreenElement() === video));
}
video.addEventListener('webkitbeginfullscreen', () => videoFullscreen(true));     // iPhone, and Safari
video.addEventListener('webkitendfullscreen', () => videoFullscreen(false));
video.addEventListener('webkitpresentationmodechanged', () => videoFullscreen(video.webkitPresentationMode === 'fullscreen'));

function subtitleLine(text, seconds) {
    if (!nativeFullscreen || !chatTrack || !text) return;
    const now = video.currentTime;
    for (const cue of [...(chatTrack.cues || [])]) {          // keep the track small
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
        (myName ? document.getElementById('messageInput') : document.getElementById('usernameInput')).focus();
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
    box.scrollTop = box.scrollHeight;       // keep the newest lines in view above the keyboard
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
const captionsEl = document.getElementById('captions');
const ccBtn = document.getElementById('captionsBtn');
const ccMenu = document.getElementById('captionsMenu');
let subs = { token: null, tracks: [] };
let clock = null;          // {token, position, at: performance.now() when it was that}
let chosen = null;         // the track id showing, or null
let cueList = [];          // [[start, end, text]] in movie seconds
let nudge = 0;             // seconds: positive shows them later
let wanted = null;         // remembered across movies: a language (or label), or 'off'; null until they pick
try { wanted = store.getItem('openhousepartySubs'); } catch (e) {}

function setSubs(s) {
    if (!s) return;
    const changed = s.token !== subs.token;
    subs = { token: s.token, tracks: s.tracks || [] };
    ccBtn.hidden = !subs.tracks.length;
    if (!subs.tracks.length) ccMenu.hidden = true;
    if (changed) {
        chosen = null;
        cueList = [];
        // what this viewer last picked, else the one the host starts on (the host's language, for a foreign film)
        const t = wanted ? wanted !== 'off' && subs.tracks.find((t) => (t.lang || t.label) === wanted)
            : subs.tracks.find((t) => t.default);
        if (t) choose(t.id, false);
    }
    ccBtn.classList.toggle('on', !!chosen);
    if (!ccMenu.hidden) buildMenu();
}

function setClock(c) {
    clock = c ? { token: c.token, position: c.position, at: performance.now() } : null;
}

async function choose(id, remember = true) {
    chosen = id;
    cueList = [];
    const t = subs.tracks.find((t) => t.id === id);
    if (remember) {
        wanted = t ? (t.lang || t.label) : 'off';
        try { store.setItem('openhousepartySubs', wanted); } catch (e) {}
    }
    ccBtn.classList.toggle('on', !!id);
    buildMenu();
    if (!id) return render();
    const token = subs.token;
    try {
        const r = await fetch(`${BASE}/subs/${encodeURIComponent(token)}/${encodeURIComponent(id)}`);
        if (r.ok && subs.token === token && chosen === id) cueList = await r.json();
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
        text = cueList.filter((c) => c[0] <= t && t < c[1]).map((c) => c[2]).join('\n');
    }
    if (captionsEl.dataset.text === text) return;
    if (text) {     // in an iPhone's full screen, the movie's line goes in the same track, for as long as it lasts
        const t = clock.position + (performance.now() - clock.at) / 1000 - viewerDelay() - nudge;
        const end = Math.min(...cueList.filter((c) => c[0] <= t && t < c[1]).map((c) => c[1]));
        subtitleLine(text, Math.max(0.5, end - t));
    }
    captionsEl.dataset.text = text;
    captionsEl.textContent = '';
    if (text) {
        const span = document.createElement('span');
        span.textContent = text;              // never innerHTML: subtitle files are text from anywhere
        captionsEl.appendChild(span);
    }
    captionsEl.hidden = !text;
    // over the video, the chat lines sit above the subtitles
    app.style.setProperty('--captions-room', text ? `${captionsEl.offsetHeight + window.innerHeight * 0.06}px` : '0px');
}

function buildMenu() {
    ccMenu.textContent = '';
    const item = (label, on, fn, stayOpen = false) => {
        const b = document.createElement('button');
        b.textContent = label;
        if (on) b.classList.add('on');
        b.addEventListener('click', (e) => {
            e.stopPropagation();               // the menu is rebuilt; don't let the page think we clicked away
            if (!stayOpen) ccMenu.hidden = true;
            fn();
        });
        ccMenu.appendChild(b);
    };
    item('Off', !chosen, () => choose(null));
    subs.tracks.forEach((t) => item(t.label, chosen === t.id, () => choose(t.id)));
    if (!chosen) return;
    ccMenu.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
    ccMenu.appendChild(Object.assign(document.createElement('div'), {
        className: 'small', textContent: `Timing: ${nudge > 0 ? '+' : ''}${nudge.toFixed(1)}s` }));
    item('Show them earlier', false, () => { nudge -= 0.5; buildMenu(); }, true);
    item('Show them later', false, () => { nudge += 0.5; buildMenu(); }, true);
}

ccBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ccMenu.hidden = !ccMenu.hidden;
    if (!ccMenu.hidden) buildMenu();
});
document.addEventListener('click', (e) => {
    if (!ccMenu.hidden && !ccMenu.contains(e.target)) ccMenu.hidden = true;
});
setInterval(render, 100);

// ---------- the guide ----------
// The host's Mac sends what's on and next, with start times as moments (epoch
// seconds) and its own "now"; shown here in this viewer's own time zone. The
// host's now also corrects for this machine's clock being off.
const guide = document.getElementById('guide');
let schedule = { rows: [], skew: 0 };

function setSchedule(m) {
    if (!m || !m.rows) return;
    schedule = { rows: m.rows, skew: Date.now() / 1000 - m.now };   // add skew to a host time to get ours
    // the tab is named after what's on (the first row has a start time once the host presses Play)
    const on = m.rows[0];
    document.title = on && on.start != null ? on.title : 'Open House Party';
    if (!guide.hidden) renderGuide();
}

function runtime(seconds) {
    const m = Math.round(seconds / 60), h = Math.floor(m / 60);
    return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

function clockTime(epoch) {
    return new Date(epoch * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderGuide() {
    const rowsEl = document.getElementById('guideRows');
    const now = Date.now() / 1000;
    const zone = new Date().toLocaleTimeString([], { timeZoneName: 'short' }).split(' ').pop();
    document.getElementById('guideZone').textContent = `times in your time zone (${zone})`;
    document.getElementById('guideClock').textContent = clockTime(now);
    rowsEl.textContent = '';
    if (!schedule.rows.length) {
        rowsEl.appendChild(Object.assign(document.createElement('div'), {
            className: 'guide-empty', textContent: 'Nothing scheduled yet.' }));
        return;
    }
    const started = schedule.rows[0].start != null;
    schedule.rows.forEach((r, i) => {
        const start = r.start != null ? r.start + schedule.skew : null;
        const end = start != null && !r.pages ? start + r.duration : null;      // a PDF: as long as the reading takes
        const onNow = start != null && start <= now && (r.pages ? i === 0 : now < end);
        const row = document.createElement('div');
        row.className = 'guide-row' + (onNow ? ' now' : '');
        const time = Object.assign(document.createElement('div'), { className: 'time', textContent: start != null ? clockTime(start) : '—' });
        const what = Object.assign(document.createElement('div'), { className: 'what' });
        what.appendChild(Object.assign(document.createElement('div'), { className: 'name', textContent: r.title }));
        const tags = Object.assign(document.createElement('div'), { className: 'tags' });
        const tag = (text, cls = '') => tags.appendChild(Object.assign(document.createElement('span'), { className: 'tag ' + cls, textContent: text }));
        if (onNow) tag('ON NOW', 'now');
        else if (i === 0 && !started) tag('UP FIRST');
        else if (i === 0 || (i === 1 && onNowFirst())) tag('UP NEXT');
        if (r.cc) tag('CC');
        if (end != null) tags.appendChild(document.createTextNode(onNow ? `ends ${clockTime(end)}` : `until ${clockTime(end)}`));
        what.appendChild(tags);
        row.append(time, what, Object.assign(document.createElement('div'), {
            className: 'runtime', textContent: r.pages ? `${r.pages} pp` : runtime(r.duration) }));
        if (onNow && end != null) {
            const bar = Object.assign(document.createElement('div'), { className: 'bar' });
            bar.appendChild(Object.assign(document.createElement('span'), { style: `width: ${Math.min(100, 100 * (now - start) / r.duration)}%` }));
            row.appendChild(bar);
        }
        rowsEl.appendChild(row);
    });
    if (!started) {
        rowsEl.appendChild(Object.assign(document.createElement('div'), {
            className: 'guide-note', textContent: 'Times appear once the host presses Play.' }));
    }
}

function onNowFirst() {
    const r = schedule.rows[0];
    if (!r || r.start == null) return false;
    const now = Date.now() / 1000, start = r.start + schedule.skew;
    return start <= now && (r.pages || now < start + r.duration);
}

function openGuide(open) {
    guide.hidden = !open;
    if (open) renderGuide();
}
document.getElementById('guideBtn').addEventListener('click', () => openGuide(true));
document.getElementById('guideClose').addEventListener('click', () => openGuide(false));
guide.addEventListener('click', (e) => { if (e.target === guide) openGuide(false); });     // click outside the box
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !guide.hidden) openGuide(false); });
setInterval(() => { if (!guide.hidden) renderGuide(); }, 15000);   // the clock and the ON NOW bar move

// ---------- a PDF, read together ----------
// While the host has a PDF up it covers the video (a "reading" card meanwhile):
// the document itself, drawn by pdf.js (fetched the first time one comes up)
// at this screen's size, so it stays sharp, on whatever page the host is on.
// Whole page or fit width is each viewer's own choice.
const docEl = document.getElementById('doc');
const docScroll = document.getElementById('docScroll');
const docZoom = document.getElementById('docZoom');
let doc = null;            // {token, title, pages, page}, from the host
let pdf = null;            // pdf.js's copy of it
let pdfTask = null;        // its loading, which is what lets it go again
let pdfToken = null;       // the doc that is loaded, or loading
let pdfjs = null;
let fitWidth = false;
let renderTask = null, drawing = false, drawAgain = false, drawnPage = null;

async function setDoc(d) {
    if (ended) return;
    const was = doc;
    doc = d || null;
    docEl.hidden = !doc;
    app.classList.toggle('reading', !!doc);
    showSoundButton();
    if (!doc) return closePdf();
    document.getElementById('docPage').textContent = `${doc.page} / ${doc.pages}`;
    if (pdfToken === doc.token) {
        if (!was || was.page !== doc.page) drawPage();
        return;
    }
    closePdf();
    const token = pdfToken = doc.token;
    try {
        if (!pdfjs) {
            pdfjs = await import(`${BASE}/assets/pdf.min.mjs`);
            pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/assets/pdf.worker.min.mjs`;
        }
        const task = pdfTask = pdfjs.getDocument({ url: `${BASE}/doc/${encodeURIComponent(token)}`,
                                                   isEvalSupported: false });
        const loaded = await task.promise;
        if (pdfToken !== token) return;                       // the host moved on while it loaded (closePdf let it go)
        pdf = loaded;
        drawPage();
    } catch (e) {
        console.log('PDF:', e);
        if (pdfToken === token) pdfToken = null;               // the next word from the host tries again
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
    const loaded = pdf, number = Math.min(doc.page, pdf.numPages);
    try {
        const page = await loaded.getPage(number);
        const size = page.getViewport({ scale: 1 });
        const w = docScroll.clientWidth, h = docScroll.clientHeight;
        const scale = fitWidth ? w / size.width : Math.min(w / size.width, h / size.height);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
        if (pdf !== loaded) return;
        docScroll.replaceChildren(canvas);
        if (drawnPage !== number) docScroll.scrollTop = 0;      // a new page starts at its top
        drawnPage = number;
    } catch (e) {
        if (e && e.name !== 'RenderingCancelledException') console.log('PDF page:', e);
    } finally {
        drawing = false;
        renderTask = null;
        if (drawAgain) {
            drawAgain = false;
            drawPage();
        }
    }
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
let redrawTimer = null;
new ResizeObserver(() => {               // a new layout, full screen, a phone turned: draw it at the new size
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(drawPage, 150);
}).observe(docScroll);

if (myName) showChatInput();
connectChat();
startWebRTC();
pollStatus();
setInterval(() => { if (!ended) pollStatus(); }, STATUS_POLL_MS);

// ---------- apps (apps.go) ----------
// The host can put an app on everyone's page for a while: over the video
// (graffiti) or filling the stage (a room). Each is a script, apps/<name>.js, that
// sets OpenHouseParty.apps[name] to a function of (ctx, view) returning whichever of
// {view(v), message(m), said(name, text), resize(), stop()} it needs, usually with
// apps/lib.js's help. ctx.send(m) goes to the app on the host (apps/); this
// viewer's view of it comes back to view(v) whenever it changes, and its events
// to message(m).
window.OpenHouseParty = { apps: {} };
const appLayer = document.getElementById('appLayer');
const appBtn = document.getElementById('appBtn');
let myId = null;           // this page's socket, as the host numbers them
let appNow = null;         // {info, inst}
let appGen = 0;            // a newer setApp wins over one still loading its script
let appTimer = null;

function script(name) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `${BASE}/apps/${encodeURIComponent(name)}.js`;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

// loadAppScript: lib.js (what they all share) once, then the app's own
async function loadAppScript(name) {
    if (!OpenHouseParty.lib) await script('lib');
    if (!OpenHouseParty.apps[name]) await script(name);
    if (!OpenHouseParty.apps[name]) throw new Error(name);
    return OpenHouseParty.apps[name];
}

async function setApp(m) {
    const gen = ++appGen;
    if (appNow && appNow.inst.stop) appNow.inst.stop();
    appNow = null;
    clearInterval(appTimer);
    appLayer.textContent = '';
    const info = m && m.app;
    app.classList.toggle('app-cover', !!(info && info.cover));
    app.classList.remove('app-off');
    appLayer.hidden = appBtn.hidden = !info;
    if (!info) return;
    let start;
    try { start = await loadAppScript(info.name); } catch (e) { return; }
    if (gen !== appGen) return;
    const ends = Date.now() + info.left * 1000;
    const ctx = {
        layer: appLayer,
        send: (msg) => send({ ...msg, type: 'app', app: info.name }),
        me: () => ({ id: myId, name: myName }),
        videoBox,
    };
    appNow = { info, inst: start(ctx, m.view) || {} };
    const tick = () => {
        const s = Math.max(0, Math.round((ends - Date.now()) / 1000));
        appBtn.textContent = `${info.title.toUpperCase()} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    appTimer = setInterval(tick, 1000);
}

// over the video: let clicks through to the player; a room: peek at the video
appBtn.onclick = () => app.classList.toggle('app-off');
new ResizeObserver(() => { if (appNow && appNow.inst.resize) appNow.inst.resize(); }).observe(appLayer);

// videoBox: where the 16:9 picture sits in the app layer (which covers the stage, as the video does)
function videoBox() {
    const w = appLayer.clientWidth, h = appLayer.clientHeight;
    const vw = Math.min(w, h * 16 / 9), vh = vw * 9 / 16;
    return { x: (w - vw) / 2, y: (h - vh) / 2, w: vw, h: vh };
}
