// Polls (apps/poll.go): ask a question, everyone votes. Over the video.
MouseParty.apps.poll = (ctx, view) => {
    const L = MouseParty.lib, h = L.h;
    const m = L.mount(ctx, 'cover', (v, kit) => {
        const out = [h('h2', {}, 'Poll')];
        const p = v.poll;
        if (p) {
            const total = p.counts.reduce((a, b) => a + b, 0) || 1;
            out.push(h('p', {}, h('b', {}, p.question), h('span', { class: 'muted' }, ` — ${p.by}`)));
            p.options.forEach((o, i) => out.push(h('div', { style: 'margin:3px 0' },
                L.button(o, () => kit.send({ kind: 'vote', i }), { disabled: !p.open, on: p.choice === i }),
                h('span', { style: `display:inline-block;vertical-align:middle;height:0.7em;border-radius:1em;margin-left:0.4em;transition:width .4s;background:linear-gradient(90deg,var(--cyan),var(--pink));width:${(8 * p.counts[i] / total).toFixed(2)}em` }),
                ` ${p.counts[i]}`)));
            out.push(p.open ? h('p', {}, 'Closes in ', L.timer(p.left), ' ', p.mine ? L.button('Close it', () => kit.send({ kind: 'close' })) : null)
                : h('p', { class: 'muted' }, 'Closed.'));
        }
        if (v.canAsk) {
            const q = L.field(kit, 'q', 'Ask something…', { max: 80, size: 28 });
            const opts = [0, 1, 2, 3].map((i) => L.field(kit, 'o' + i, `Answer ${i + 1}`, { max: 80, size: 24 }));
            out.push(h('h3', {}, p ? 'Ask the next one' : 'Ask everyone'), h('div', {}, q), opts.map((o) => h('div', {}, o)),
                L.button('Ask', () => {
                    kit.send({ kind: 'ask', question: q.value, options: opts.map((o) => o.value) });
                    [q, ...opts].forEach((el) => { el.value = ''; });
                }));
        } else if (!p) {
            out.push(h('p', { class: 'muted' }, 'Join the chat to ask a question.'));
        }
        return out;
    });
    m.draw(view);
    return { view: m.draw };
};
