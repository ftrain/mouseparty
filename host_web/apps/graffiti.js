// Graffiti (graffiti.go): everyone draws on the video. Lines are in the
// picture's own 0-1 coordinates, so they land on the same spot for everyone.
// What you draw shows at once, and again when the host sends it back to all.
TubeYap.apps.graffiti = (ctx, state) => {
    const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#000000'];
    const WIDTHS = [3, 8, 20];   // in a 720-line picture; scaled with it
    const SEND_MS = 60;          // a piece of the stroke this often while the pen is down
    const lines = state.lines.slice();
    let color = Math.floor(Math.random() * 4), width = 1;

    const canvas = document.createElement('canvas');
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:8px;top:8px;display:flex;gap:4px;background:#fff;border:1px solid #000;padding:4px';
    COLORS.forEach((c, i) => tool(c, '', () => { color = i; }));
    WIDTHS.forEach((w, i) => tool('#fff', ['thin', 'mid', 'fat'][i], () => { width = i; }));
    ctx.layer.append(canvas, bar);
    const g = canvas.getContext('2d');
    let box = ctx.videoBox();

    function tool(bg, label, pick) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = `background:${bg};border:1px solid #000;min-width:22px;height:22px;font:11px monospace;padding:0 4px`;
        b.onclick = pick;
        bar.append(b);
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = ctx.layer.clientWidth * dpr;
        canvas.height = ctx.layer.clientHeight * dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        box = ctx.videoBox();
        g.clearRect(0, 0, canvas.width, canvas.height);
        lines.forEach(draw);
    }

    function draw(l) {
        g.strokeStyle = COLORS[l.c];
        g.lineWidth = WIDTHS[l.w] * box.h / 720;
        g.lineCap = g.lineJoin = 'round';
        g.beginPath();
        l.p.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, box.x + x * box.w, box.y + y * box.h));
        g.stroke();
    }

    // drawing: pending is the stroke not yet sent, starting where the last piece ended
    let pending = null, timer = null;
    function at(e) {
        const r = canvas.getBoundingClientRect();
        const clamp = (v) => Math.round(Math.min(Math.max(v, 0), 1) * 10000) / 10000;
        return [clamp((e.clientX - r.left - box.x) / box.w), clamp((e.clientY - r.top - box.y) / box.h)];
    }
    function flush() {
        if (pending && pending.length > 1) {
            ctx.send({ kind: 'line', c: color, w: width, p: pending });
            pending = [pending[pending.length - 1]];
        }
    }
    canvas.onpointerdown = (e) => {
        canvas.setPointerCapture(e.pointerId);
        pending = [at(e)];
        timer = setInterval(flush, SEND_MS);
    };
    canvas.onpointermove = (e) => {
        if (!pending) return;
        const p = at(e);
        draw({ c: color, w: width, p: [pending[pending.length - 1], p] });
        pending.push(p);
        if (pending.length >= 60) flush();
    };
    canvas.onpointerup = canvas.onpointercancel = () => {
        flush();
        clearInterval(timer);
        pending = null;
    };

    resize();
    return {
        message(m) {
            if (m.kind === 'line') {
                lines.push(m.line);
                draw(m.line);
            }
        },
        resize,
        stop() { clearInterval(timer); },
    };
};
