// Anagrams (apps/anagram.go): unscramble the word first. Over the video.
import type { Start } from '../types.ts';
import * as L from './lib.ts';

const h = L.h;

// apps/anagram.go View
interface View {
    phase: 'guess' | 'reveal';
    letters: string;
    left: number;
    winner: string;
    answer: string;
    board: L.Player[];
    named: boolean;
}
type Event = { kind: 'wrong'; guess: string };
type Out = { kind: 'guess'; guess: string };

const anagram: Start<View, Event, Out> = (ctx, view) => {
    const m = L.mount<View, Out>(ctx, 'cover', (v, kit) => [
        h(
            'div',
            { style: 'display:flex;gap:0.25em;flex-wrap:wrap;margin:0.2em 0 0.5em' },
            [...v.letters.toUpperCase()].map((l, i) => h('span', { class: 'cell', style: `width:1.6em;height:1.6em;font-size:2.2em;font-weight:800;animation:ty-pop .4s ${i * 0.04}s backwards` }, l)),
        ),
        v.phase === 'guess'
            ? h(
                  'p',
                  {},
                  v.named ? L.input(kit, 'guess', 'Unscramble it…', (g) => kit.send({ kind: 'guess', guess: g })) : h('span', { class: 'muted' }, 'Join the chat to play. '),
                  ' ',
                  L.timer(v.left),
              )
            : h('p', {}, v.winner ? `${v.winner} got it: ` : 'Nobody got it: ', h('b', {}, v.answer.toUpperCase())),
        v.board.length
            ? h(
                  'p',
                  { class: 'muted' },
                  v.board
                      .slice(0, 5)
                      .map((p) => `${p.name} ${p.score}`)
                      .join(' · '),
              )
            : null,
    ]);
    let last = view;
    const show = (v: View) => {
        if (v.phase !== 'guess' && last.phase === 'guess' && v.winner) L.confetti(ctx, v.winner === ctx.me().name ? 120 : 40);
        last = v;
        m.draw(v);
    };
    m.draw(view);
    return {
        view: show,
        message(e) {
            if (e.kind === 'wrong') m.kit.note(`Not ${e.guess.toUpperCase()}`);
        },
    };
};
export default anagram;
