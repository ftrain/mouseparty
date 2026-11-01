// Call (apps/call.go): talking while watching. Joining sends this page's
// microphone to the host's MediaMTX over WebRTC (WHIP, call/send/<secret>), and
// hears everyone else in the call from it (WHEP, call/hear/<voice>), one
// connection a voice, through the same port and STUN as the movie. Browsers
// only lend a page the microphone over https: on the plain http link, it says so.
import type { Start, Status } from '../types.ts';
import * as L from './lib.ts';

const h = L.h;

// someone in the call (apps/call.go caller)
interface Caller {
    id: number;
    name: string;
    voice: string; // what they're heard by
    live: boolean; // their page is sending
    muted: boolean;
}
interface View {
    people: Caller[];
    max: number;
    secret?: string; // in the call: what this page sends to
}
type Out = { kind: 'join' } | { kind: 'live' } | { kind: 'leave' } | { kind: 'mute'; muted: boolean };

// a WebRTC connection to MediaMTX, and the URL that hangs it up
interface Line {
    pc: RTCPeerConnection | null; // null while it starts
    hangUp: string | null;
}
interface Hearing extends Line {
    audio: HTMLAudioElement;
}

const style = document.createElement('style');
style.textContent = `
.ty .call-row { display: flex; align-items: center; gap: 0.5em; padding: 0.2em 0.5em; margin: 0.2em 0; border-radius: 0.6em;
                background: rgb(255 255 255 / 0.06); transition: box-shadow 0.15s, background 0.15s; }
.ty .call-row.speaking { background: rgb(124 242 122 / 0.18); box-shadow: 0 0 0 2px var(--lime); }
.ty .call-dot { width: 0.6em; height: 0.6em; border-radius: 50%; background: rgb(255 255 255 / 0.3); flex: none; }
.ty .call-row.live .call-dot { background: var(--lime); }
.ty .call-row .muted { margin-left: auto; font-size: 0.85em; }`;
document.head.appendChild(style);

const call: Start<View, never, Out> = (ctx, first) => {
    let view = first;
    let mic: MediaStream | null = null; // this page's microphone, while in the call
    let sending: Line | null = null;
    let starting = false; // asking for the microphone, or sending's handshake
    let problem = '';
    const hearing = new Map<string, Hearing>(); // by voice
    const retries = new Map<string, number>(); // by voice: failed tries in a row
    let stopped = false;

    // how loud each voice is, for who's speaking: one AudioContext, an analyser a stream
    let audio: AudioContext | null = null;
    const meters = new Map<string, AnalyserNode>(); // by voice ('me' for this page)
    function meter(key: string, stream: MediaStream) {
        try {
            audio = audio || new AudioContext();
            const a = audio.createAnalyser();
            a.fftSize = 512;
            audio.createMediaStreamSource(stream).connect(a);
            meters.set(key, a);
        } catch (e) {}
    }
    const buf = new Float32Array(512);
    const speaking = (a: AnalyserNode) => {
        a.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) sum += x * x;
        return Math.sqrt(sum / buf.length) > 0.02;
    };
    const glow = setInterval(() => {
        for (const row of m.box.querySelectorAll<HTMLElement>('.call-row')) {
            const a = meters.get(row.dataset.voice!);
            row.classList.toggle('speaking', !!a && speaking(a));
        }
    }, 120);

    let ice: RTCIceServer[] | null = null; // the movie's: STUN when the host shares through Cloudflare
    async function iceServers() {
        if (!ice) {
            try {
                ice = ((await (await fetch(`${ctx.base}/status`, { cache: 'no-store' })).json()) as Status).iceServers || [];
            } catch (e) {
                ice = [];
            }
        }
        return ice;
    }

    // connect: offer, gather every candidate (no trickle), and post it to url
    async function connect(pc: RTCPeerConnection, url: string): Promise<string | null> {
        await pc.setLocalDescription(await pc.createOffer());
        await new Promise<void>((done) => {
            if (pc.iceGatheringState === 'complete') return done();
            pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && done();
            setTimeout(done, ice && ice.length ? 2500 : 1500);
        });
        const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription!.sdp });
        if (!resp.ok) throw new Error(`handshake ${resp.status}`);
        const hangUp = resp.headers.get('Location');
        await pc.setRemoteDescription({ type: 'answer', sdp: await resp.text() });
        return hangUp;
    }

    function close(line: Line) {
        // hung up first: closed first, MediaMTX may end it before the hang-up arrives
        const pc = line.pc;
        if (line.hangUp) fetch(line.hangUp, { method: 'DELETE' }).finally(() => pc && pc.close());
        else if (pc) pc.close();
    }

    const me = () => view.people.find((p) => p.id === ctx.me().id);

    async function join() {
        problem = '';
        if (!ctx.me().name) return;
        starting = true;
        m.redraw();
        try {
            mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        } catch (e) {
            starting = false;
            problem = 'The microphone was turned down: allow it for this page to join.';
            m.redraw();
            return;
        }
        if (stopped) return mic.getTracks().forEach((t) => t.stop());
        meter('me', mic);
        ctx.send({ kind: 'join' }); // the view that comes back has the secret to send to
        setTimeout(() => {
            // no answer: the call filled up meanwhile
            if (!stopped && !me() && mic && !sending) {
                hangUpAll();
                problem = 'Could not join the call.';
                m.redraw();
            }
        }, 5000);
    }

    async function send(secret: string) {
        if (sending || !mic) return;
        const line: Line = { pc: null, hangUp: null };
        sending = line; // taken now: update won't start it twice
        const ice = await iceServers();
        if (sending !== line || !mic) return; // left meanwhile
        const pc = (line.pc = new RTCPeerConnection({ iceServers: ice }));
        for (const t of mic.getAudioTracks()) pc.addTransceiver(t, { direction: 'sendonly', streams: [mic] });
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' && sending === line) {
                problem = 'The call lost its connection.';
                leave();
            }
        };
        try {
            line.hangUp = await connect(pc, `${ctx.base}/call/send/${secret}`);
            if (sending !== line) return close(line); // left meanwhile
            starting = false;
            ctx.send({ kind: 'live' });
        } catch (e) {
            if (sending !== line) return;
            problem = 'Could not reach the host for the call.';
            leave();
        }
        m.redraw();
    }

    // hear: one voice, in its own connection; tried again a few times if it fails
    async function hear(voice: string) {
        const el = new Audio();
        el.autoplay = true;
        const line: Hearing = { pc: null, hangUp: null, audio: el };
        hearing.set(voice, line); // taken now: update won't start it twice
        const again = () => {
            if (hearing.get(voice) !== line) return;
            unhear(voice);
            const tries = (retries.get(voice) || 0) + 1;
            retries.set(voice, tries);
            if (tries < 5) setTimeout(update, 1500 * tries);
        };
        const ice = await iceServers();
        if (hearing.get(voice) !== line) return; // gone meanwhile
        const pc = (line.pc = new RTCPeerConnection({ iceServers: ice }));
        pc.addTransceiver('audio', { direction: 'recvonly' });
        pc.ontrack = (e) => {
            const stream = e.streams[0] || new MediaStream([e.track]);
            el.srcObject = stream;
            el.play().catch(() => {});
            meter(voice, stream);
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') retries.delete(voice);
            else if (pc.connectionState === 'failed') again();
        };
        try {
            line.hangUp = await connect(pc, `${ctx.base}/call/hear/${voice}`);
            if (hearing.get(voice) !== line) close(line); // gone meanwhile
        } catch (e) {
            again();
        }
    }

    // unhear: stop hearing a voice; when they've left, MediaMTX has already hung up
    function unhear(voice: string, left = false) {
        const line = hearing.get(voice);
        if (!line) return;
        if (left) line.hangUp = null;
        close(line);
        line.audio.srcObject = null;
        meters.delete(voice);
        hearing.delete(voice);
    }

    // update: hearing whoever's sending, while in the call, and nobody else
    function update() {
        if (stopped) return;
        const mine = me();
        if (view.secret && mic && !sending) send(view.secret);
        if (!mine && sending) hangUpAll(); // dropped from the call (closed elsewhere, or a new socket)
        const want = new Set(mine ? view.people.filter((p) => p.live && p.id !== mine.id).map((p) => p.voice) : []);
        for (const voice of [...hearing.keys()]) if (!want.has(voice)) unhear(voice, !!mine);
        for (const voice of want) if (!hearing.has(voice) && (retries.get(voice) || 0) < 5) hear(voice);
    }

    function hangUpAll() {
        if (sending) close(sending);
        sending = null;
        starting = false;
        if (mic) mic.getTracks().forEach((t) => t.stop());
        mic = null;
        for (const voice of [...hearing.keys()]) unhear(voice);
        retries.clear();
        meters.clear();
    }

    function leave() {
        ctx.send({ kind: 'leave' });
        hangUpAll();
        m.redraw();
    }

    function mute(muted: boolean) {
        if (mic) mic.getAudioTracks().forEach((t) => (t.enabled = !muted));
        ctx.send({ kind: 'mute', muted });
    }

    const m = L.mount<View, Out>(ctx, 'cover', (v) => {
        const mine = me(),
            secure = window.isSecureContext && !!navigator.mediaDevices;
        const out: L.Kid[] = [h('h2', {}, 'Call')];
        if (!v.people.length) out.push(h('p', { class: 'muted' }, 'Nobody is in the call yet.'));
        for (const p of v.people) {
            const you = mine && p.id === mine.id;
            out.push(
                h(
                    'div',
                    { class: 'call-row' + (p.live ? ' live' : ''), 'data-voice': you ? 'me' : p.voice },
                    h('span', { class: 'call-dot' }),
                    h('span', {}, p.name, you ? h('span', { class: 'muted' }, ' (you)') : null),
                    p.muted ? h('span', { class: 'muted' }, 'muted') : !p.live ? h('span', { class: 'muted' }, 'connecting…') : null,
                ),
            );
        }
        if (mine) {
            out.push(
                h(
                    'p',
                    {},
                    L.button(mine.muted ? 'Unmute' : 'Mute', () => mute(!mine.muted), { on: mine.muted }),
                    L.button('Leave', leave),
                ),
            );
            out.push(h('p', { class: 'muted' }, 'Headphones keep the movie out of your microphone.'));
        } else if (!secure) {
            out.push(h('p', { class: 'muted' }, 'Calls need the https link: browsers only lend the microphone to a secure page. Ask the host for the Cloudflare link.'));
        } else if (!ctx.me().name) {
            out.push(h('p', { class: 'muted' }, 'Join the chat to join the call.'));
        } else if (v.people.length >= v.max) {
            out.push(h('p', { class: 'muted' }, `The call is full (${v.max}).`));
        } else {
            out.push(h('p', {}, L.button(starting ? 'Joining…' : 'Join the call', join, { disabled: starting })));
        }
        if (problem) out.push(h('p', { class: 'muted' }, problem));
        return out;
    });

    m.draw(view);
    return {
        view(v) {
            view = v;
            m.draw(v);
            update();
        },
        stop() {
            stopped = true;
            clearInterval(glow);
            if (me()) ctx.send({ kind: 'leave' });
            hangUpAll();
            if (audio) audio.close().catch(() => {});
        },
    };
};
export default call;
