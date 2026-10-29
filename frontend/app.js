// The window: it draws the View the Go side sends (app.go) and tells it what was
// pressed. It keeps nothing of its own but a drag in progress and a held slider.
const App = () => window.go.main.App;
const $ = (id) => document.getElementById(id);

const ICONS = {
    play: '<svg viewBox="0 0 46 46"><path d="M15 9v28l23-14z" fill="white"/></svg>',
    stop: '<svg viewBox="0 0 46 46"><rect x="10" y="10" width="26" height="26" rx="4" fill="white"/></svg>',
    copy: '<svg viewBox="0 0 46 46" fill="none" stroke="white" stroke-width="3.5" stroke-linejoin="round">' +
        '<rect x="7" y="6" width="22" height="25" rx="4"/><rect x="17" y="15" width="22" height="25" rx="4" fill="var(--c)"/></svg>',
    spinner: '<svg class="spinner" viewBox="0 0 46 46"><path d="M23 6a17 17 0 1 1-16.2 11.8" fill="none" stroke="white" ' +
        'stroke-width="4" stroke-linecap="round"/></svg>',
};

let view = null;
let dragFrom = null;     // row being dragged to a new place
let sliderHeld = false;  // don't move the slider under the mouse

function tile(el, icon, on, press, note, cls) {
    const key = [icon, on, press, note, cls].join('|');
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.className = `tile ${on ? 'on' : ''} ${press ? 'press' : ''} ${cls || ''}`;
    el.innerHTML = ICONS[icon] + `<span class="note">${note || ''}</span>`;
}

function render(v) {
    view = v;
    tile($('play'), v.play, v.playOn, v.playOn, '', v.play === 'stop' ? 'stop' : '');
    $('play').setAttribute('aria-label', v.play === 'stop' ? 'Stop' : 'Play');
    tile($('link'), v.link, v.linkOn, v.linkPress, v.linkNote);

    const s = v.slider, slider = $('slider');
    if (!sliderHeld) {
        slider.min = s.min;
        slider.max = s.max;
        slider.step = s.pages ? 1 : 'any';
        slider.value = s.value;
        slider.disabled = !s.on;
        $('time').textContent = s.label;
    }

    // the rows, changed in place: the view comes twice a second while playing, and
    // rows swapped out from under the mouse would lose clicks
    const list = $('list');
    const rows = list.querySelectorAll('.row');
    for (let i = v.rows.length; i < rows.length; i++) rows[i].remove();
    v.rows.forEach((r, i) => {
        let row = rows[i];
        if (!row) {
            row = document.createElement('div');
            row.dataset.index = i;
            row.innerHTML = '<span class="mark"></span><span class="title"></span><span class="length"></span>';
            list.appendChild(row);
        }
        row.className = 'row' + (r.played ? ' played' : '') + (r.now ? ' now' : '') + (r.off ? ' off' : '') +
            (i === v.selected ? ' selected' : '');
        row.title = r.off ? "Can't play this now: its file isn't there, or can't be read" : '';
        row.children[0].textContent = r.now ? '▶' : '';
        if (row.children[1].textContent !== r.title) row.children[1].textContent = r.title;
        row.children[2].textContent = r.length;
    });
    $('hint').style.display = v.rows.length ? 'none' : '';
}

function rowAt(x, y) {
    const row = document.elementFromPoint(x, y)?.closest('.row');
    return row ? Number(row.dataset.index) : null;
}

$('play').addEventListener('click', () => view?.playOn && App().PlayClicked());
$('link').addEventListener('click', () => view?.linkPress && App().LinkClicked());

// rows: click selects, double-click plays, drag moves. The second click of a
// double-click is caught here, by row and time, not by the browser's dblclick.
let lastDown = { row: null, at: 0 };
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
window.addEventListener('mouseup', () => { dragFrom = null; });

// keys: Backspace removes the selected one; arrows and Page Up/Down turn a PDF's pages
window.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') App().Remove();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') App().TurnPage(-1);
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') App().TurnPage(1);
    else return;
    e.preventDefault();
});

// the slider: drag to move around in the movie, or to another page
const slider = $('slider');
const clock = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
slider.addEventListener('pointerdown', () => { sliderHeld = true; });
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

// files from Finder; a subtitle file goes to the movie it's dropped on
window.addEventListener('load', async () => {
    window.runtime.OnFileDrop((x, y, paths) => App().AddPaths(paths, rowAt(x, y) ?? -1), false);
    window.runtime.EventsOn('view', render);
    render(await App().GetView());
});
