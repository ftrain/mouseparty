// Blanks (apps/blanks.go): fill in the blank, then vote for the best.
import type { Start } from '../types.ts';
import * as L from './lib.ts';

const h = L.h;

// apps/blanks.go View: the entries once the writing's done (who wrote each, and its votes, at the end)
interface View {
    phase: 'write' | 'vote' | 'results';
    prompt: string;
    left: number;
    mine: string;
    answered: number;
    board: L.Player[];
    named: boolean;
    entries?: { text: string; yours: boolean; name?: string; votes?: number }[];
    choice?: number;
}
type Out = { kind: 'answer'; text: string } | { kind: 'vote'; i: number };

const blanks: Start<View, never, Out> = (ctx, view) => {
    const m = L.mount<View, Out>(ctx, 'cover', (v, kit) => {
        const out: L.Kid[] = [h('h2', {}, 'Blanks'), h('p', { style: 'font-size:1.45em;line-height:1.3' }, v.prompt)];
        if (v.phase === 'write') {
            out.push(h('p', {}, 'Fill it in: ', L.timer(v.left), ` · ${v.answered} answered`));
            if (v.named) out.push(L.input(kit, 'answer', 'Your answer, Enter', (t) => kit.send({ kind: 'answer', text: t }), { max: 80, size: 40 }));
            else out.push(h('p', { class: 'muted' }, 'Join the chat to play.'));
            if (v.mine) out.push(h('p', {}, 'Yours: ', h('b', {}, v.mine), h('span', { class: 'muted' }, ' (send another to change it)')));
        } else {
            out.push(h('p', {}, v.phase === 'vote' ? ['Vote for the best: ', L.timer(v.left)] : 'Results'));
            v.entries!.forEach((e, i) =>
                out.push(
                    h(
                        'div',
                        { style: 'margin:4px 0' },
                        v.phase === 'vote'
                            ? L.button(e.text, () => kit.send({ kind: 'vote', i }), { disabled: e.yours, on: v.choice === i })
                            : h('span', {}, h('b', {}, e.text), ` — ${e.name}, `, '★'.repeat(e.votes!) || 'no votes'),
                    ),
                ),
            );
        }
        out.push(L.board(v.board));
        return out;
    });
    let phase = view.phase;
    m.draw(view);
    return {
        view(v) {
            if (v.phase === 'results' && phase !== 'results' && v.entries!.some((e) => e.votes)) L.confetti(ctx, 50);
            phase = v.phase;
            m.draw(v);
        },
    };
};
export default blanks;
