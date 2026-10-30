// Room (room.go): everyone walks around a floor as a dot with their chat name.
// Click to walk there; what you say in the chat shows over your head. The host
// only says where each one is headed; this page does the walking.
MouseParty.apps.room = (ctx, state) => {
    const SPEED = 0.25;          // floor widths a second
    const SAY_MS = 6000;         // a line stays over someone's head this long
    const people = new Map();    // id -> {name, x, y, tx, ty, said, saidUntil}
    for (const a of state.avatars) people.set(a.id, { name: a.name, x: a.x, y: a.y, tx: a.x, ty: a.y });

    const canvas = document.createElement('canvas');
    ctx.layer.append(canvas);
    const g = canvas.getContext('2d');
    let box = ctx.videoBox(), frame = null, last = performance.now();

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = ctx.layer.clientWidth * dpr;
        canvas.height = ctx.layer.clientHeight * dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        box = ctx.videoBox();
    }

    function tick(now) {
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        for (const p of people.values()) {
            const d = Math.hypot(p.tx - p.x, (p.ty - p.y) * 9 / 16), step = SPEED * dt;   // in floor widths
            if (d <= step) { p.x = p.tx; p.y = p.ty; } else { p.x += (p.tx - p.x) * step / d; p.y += (p.ty - p.y) * step / d; }
        }
        render();
        frame = requestAnimationFrame(tick);
    }

    function render() {
        const { x: bx, y: by, w: bw, h: bh } = box;
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.lineWidth = 1;
        for (let i = 1; i < 16; i++) line(bx + bw * i / 16, by, bx + bw * i / 16, by + bh);
        for (let i = 1; i < 9; i++) line(bx, by + bh * i / 9, bx + bw, by + bh * i / 9);
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        const r = bh * 0.03, now = Date.now(), me = ctx.me();
        g.font = `700 ${Math.max(11, bh * 0.03)}px ui-rounded, system-ui, sans-serif`;
        g.textAlign = 'center';
        for (const [id, p] of people) {
            const px = bx + p.x * bw, py = by + p.y * bh;
            g.beginPath();
            g.arc(px, py, r, 0, Math.PI * 2);
            g.fillStyle = hue(p.name);
            g.shadowColor = hue(p.name);
            g.shadowBlur = r;
            g.fill();
            g.shadowBlur = 0;
            g.lineWidth = id === me.id ? 3 : 1;
            g.strokeStyle = '#fff';
            g.stroke();
            g.lineWidth = 1;
            g.fillStyle = '#fff';
            g.fillText(p.name, px, py + r * 2.4);
            if (p.said && p.saidUntil > now) {
                const text = p.said.length > 60 ? p.said.slice(0, 59) + '…' : p.said;
                const tw = g.measureText(text).width + 12, th = r * 1.6;
                const left = Math.max(bx, Math.min(px - tw / 2, bx + bw - tw)), top = Math.max(by, py - r * 2 - th);
                g.fillStyle = '#fff';
                g.beginPath();
                g.roundRect(left, top, tw, th, th / 2);
                g.fill();
                g.fillStyle = '#1a1030';
                g.fillText(text, left + tw / 2, top + th * 0.7);
            }
        }
        if (!people.has(me.id)) {
            g.fillStyle = 'rgba(255,255,255,0.7)';
            g.fillText(me.name ? 'Click to walk in' : 'Join the chat to walk in', bx + bw / 2, by + bh - r);
        }
    }

    // hue: each name its own colour, the same on every page
    function hue(name) {
        let n = 0;
        for (const ch of name || '') n = (n * 31 + ch.charCodeAt(0)) % 360;
        return `hsl(${n}, 90%, 62%)`;
    }

    function line(x1, y1, x2, y2) {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
    }

    canvas.onpointerdown = (e) => {
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left - box.x) / box.w, y = (e.clientY - r.top - box.y) / box.h;
        if (ctx.me().name && x >= 0 && x <= 1 && y >= 0 && y <= 1) ctx.send({ kind: 'go', x, y });
    };

    resize();
    frame = requestAnimationFrame(tick);
    return {
        message(m) {
            if (m.kind === 'avatar') {
                const a = m.avatar, start = m.from || [a.x, a.y];
                const p = people.get(a.id) || { x: start[0], y: start[1] };
                people.set(a.id, Object.assign(p, { name: a.name, tx: a.x, ty: a.y }));
            } else if (m.kind === 'gone') {
                people.delete(m.id);
            }
        },
        said(name, text) {
            for (const p of people.values()) if (p.name === name) Object.assign(p, { said: text, saidUntil: Date.now() + SAY_MS });
        },
        resize,
        stop() { cancelAnimationFrame(frame); },
    };
};
