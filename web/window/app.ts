// The window: it draws the View the Go side sends (app.go) and tells it what was
// pressed. It keeps nothing of its own but a drag in progress and a held slider.
import type { Icon, View } from './wails.d.ts';
import { ask, edit, lock, sheetOpen } from './party.ts';

const App = () => window.go.main.App;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ICONS = {
    play: '<svg viewBox="0 0 46 46"><path d="M15 9v28l23-14z" fill="white"/></svg>',
    stop: '<svg viewBox="0 0 46 46"><rect x="10" y="10" width="26" height="26" rx="4" fill="white"/></svg>',
    copy:
        '<svg viewBox="0 0 46 46" fill="none" stroke="white" stroke-width="3.5" stroke-linejoin="round">' +
        '<rect x="7" y="6" width="22" height="25" rx="4"/><rect x="17" y="15" width="22" height="25" rx="4" fill="var(--c)"/></svg>',
    spinner: '<svg class="spinner" viewBox="0 0 46 46"><path d="M23 6a17 17 0 1 1-16.2 11.8" fill="none" stroke="white" ' + 'stroke-width="4" stroke-linecap="round"/></svg>',
};

// the list's icon column: what each row is (Lucide icons, lucide 1.57.0, ISC: licenses/lucide/)
const ROW_ICONS: Record<Icon, string> = {
    video: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/>',
    audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    pdf: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8M16 13H8M16 17H8"/>',
    text: '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
    db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
};
const rowIcon = (icon: Icon) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ROW_ICONS[icon] || ''}</svg>`;

let view: View | null = null;
let dragFrom: number | null = null; // row being dragged to a new place
let sliderHeld = false; // don't move the slider under the mouse

function tile(el: HTMLElement, icon: keyof typeof ICONS, on: boolean, press: boolean, note: string, cls?: string) {
    const key = [icon, on, press, note, cls].join('|');
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.className = `tile ${on ? 'on' : ''} ${press ? 'press' : ''} ${cls || ''}`;
    el.innerHTML = ICONS[icon] + `<span class="note">${note || ''}</span>`;
}

function render(v: View) {
    view = v;
    lock(v); // sealed: only the passcode
    tile($('play'), v.play, v.playOn, v.playOn, '', v.play === 'stop' ? 'stop' : '');
    $('play').setAttribute('aria-label', v.play === 'stop' ? 'Stop' : 'Play');
    tile($('link'), v.link, v.linkOn, v.linkPress, v.linkNote);
    $('link').setAttribute('aria-label', v.linkNote ? `Copy link: ${v.linkNote}` : 'Copy link');

    const s = v.slider,
        slider = $<HTMLInputElement>('slider');
    if (!sliderHeld) {
        slider.min = String(s.min);
        slider.max = String(s.max);
        slider.step = s.pages ? '1' : 'any';
        slider.value = String(s.value);
        slider.disabled = !s.on;
        $('time').textContent = s.label;
        slider.setAttribute('aria-valuetext', s.label);
    }

    // the rows, changed in place: the view comes twice a second while playing, and
    // rows swapped out from under the mouse would lose clicks
    const list = $('list');
    const rows = list.querySelectorAll<HTMLElement>('.row');
    for (let i = v.rows.length; i < rows.length; i++) rows[i].remove();
    v.rows.forEach((r, i) => {
        let row = rows[i];
        if (!row) {
            row = document.createElement('div');
            row.dataset.index = String(i);
            row.innerHTML = '<span class="mark"></span><span class="icon"></span><span class="title"></span><span class="length"></span>';
            list.appendChild(row);
        }
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(i === v.selected));
        row.setAttribute('aria-label', [r.title, r.length, r.now ? 'playing' : r.played ? 'played' : '', r.off ? 'unavailable' : ''].filter(Boolean).join(', '));
        row.className = 'row' + (r.played ? ' played' : '') + (r.now ? ' now' : '') + (r.off ? ' off' : '') + (i === v.selected ? ' selected' : '');
        row.title = r.icon === 'download' ? 'Downloading; double-click one that gave up to try again' : r.off ? "Can't play this now: its file isn't there, or can't be read" : '';
        row.children[0].textContent = r.now ? '▶' : '';
        const icon = row.children[1] as HTMLElement;
        if (icon.dataset.icon !== r.icon) {
            icon.dataset.icon = r.icon;
            icon.innerHTML = rowIcon(r.icon);
        }
        if (row.children[2].textContent !== r.title) row.children[2].textContent = r.title;
        row.children[3].textContent = r.length;
    });
    $('hint').style.display = v.rows.length ? 'none' : '';
}

function rowAt(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('.row');
    return row ? Number(row.dataset.index) : null;
}

// where files dropped at y go: before the row they're over, or after it if over
// its lower half; -1 (the end) past the last
function insertAt(y: number) {
    const rows = [...$('list').querySelectorAll<HTMLElement>('.row')];
    const i = rows.findIndex((r) => y < r.getBoundingClientRect().top + r.offsetHeight / 2);
    return i < 0 ? -1 : i;
}

// a line where they'll go while files are dragged over
function showInsert(at: number | null) {
    $('list')
        .querySelectorAll('.insert-before, .insert-after')
        .forEach((r) => r.classList.remove('insert-before', 'insert-after'));
    const rows = $('list').querySelectorAll('.row');
    if (at === null || !rows.length) return;
    if (at < 0) rows[rows.length - 1].classList.add('insert-after');
    else rows[at].classList.add('insert-before');
}
window.addEventListener('dragover', (e) => showInsert(insertAt(e.clientY)));
window.addEventListener('dragleave', (e) => e.relatedTarget === null && showInsert(null));

$('play').addEventListener('click', () => view?.playOn && App().PlayClicked());
$('link').addEventListener('click', () => view?.linkPress && App().LinkClicked());

// rows: click selects, double-click plays, drag moves. The second click of a
// double-click is caught here, by row and time, not by the browser's dblclick.
let lastDown: { row: number | null; at: number } = { row: null, at: 0 };
$('list').addEventListener('mousedown', (e) => {
    const i = rowAt(e.clientX, e.clientY);
    const now = performance.now();
    if (i !== null && i === lastDown.row && now - lastDown.at < 450) {
        lastDown = { row: null, at: 0 };
        dragFrom = null;
        return App().PlayRow(i);
    }
    lastDown = { row: i, at: now };
    dragFrom = i;
    App().Select(i ?? -1);
    $('list').focus();
});
window.addEventListener('mousemove', (e) => {
    if (dragFrom === null || !(e.buttons & 1)) return;
    const j = rowAt(e.clientX, e.clientY);
    if (j !== null && j !== dragFrom) {
        App().Move(dragFrom, j);
        dragFrom = j;
    }
});
window.addEventListener('mouseup', () => {
    dragFrom = null;
});

// keys: ↑/↓ select, Return plays, Backspace removes the selected one; ←/→ and Page Up/Down turn a PDF's pages
window.addEventListener('keydown', (e) => {
    if (sheetOpen() || e.metaKey || e.ctrlKey || e.altKey) return; // typing a passcode, or the settings; the menus' keys
    const rows = view?.rows.length ?? 0;
    const sel = view?.selected ?? -1;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows) {
        const next = e.key === 'ArrowDown' ? (sel < 0 ? 0 : Math.min(rows - 1, sel + 1)) : sel < 0 ? rows - 1 : Math.max(0, sel - 1);
        App().Select(next);
        $('list').querySelectorAll('.row')[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && sel >= 0 && document.activeElement?.tagName !== 'BUTTON') App().PlayRow(sel);
    else if (e.key === 'Backspace' || e.key === 'Delete') App().Remove();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') App().TurnPage(-1);
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') App().TurnPage(1);
    else return;
    e.preventDefault();
});

// the slider: drag to move around in the movie, or to another page
const slider = $<HTMLInputElement>('slider');
const clock = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
slider.addEventListener('pointerdown', () => {
    sliderHeld = true;
});
slider.addEventListener('input', () => {
    const v = Number(slider.value);
    $('time').textContent = view?.slider.pages ? `${Math.round(v)} / ${view.slider.label.split(' / ')[1]}` : clock(v);
});
slider.addEventListener('change', () => {
    sliderHeld = false;
    if (view?.slider.pages) App().ShowPage(Math.round(Number(slider.value)));
    else App().Seek(Number(slider.value));
});
slider.addEventListener('keydown', (e) => e.stopPropagation());

// files from Finder, put where they're dropped; a subtitle file goes to the movie it's dropped on
window.addEventListener('load', async () => {
    window.runtime.OnFileDrop((x, y, paths) => {
        showInsert(null);
        App().AddPaths(paths, rowAt(x, y) ?? -1, insertAt(y));
    }, false);
    window.runtime.EventsOn('view', render);
    window.runtime.EventsOn('ask', ask); // the Party menu
    window.runtime.EventsOn('edit', edit); // Edit > Undo, Redo
    render(await App().GetView());
    if (await App().Welcome()) void ask('welcome'); // someone new
});
