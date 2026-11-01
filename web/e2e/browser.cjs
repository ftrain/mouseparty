// The pages in headless Chromium, run by browser_test.go (which hosts the real
// App, and serves the window with stand-ins for Wails): node web/e2e/browser.cjs
// <test server> <seed>. Exits non-zero on the first thing wrong.
//
// 1. The window, walked at random: files dropped, Play, the link, rows clicked,
//    double-clicked and dragged, Backspace and the arrows, the slider; after
//    each step, the page must show the view it was last given.
// 2. Two viewers: every app opened, drawn without an error and closed; a line of
//    chat from one reaching the other; a call between them, sound both ways.
//
// Any uncaught error on any page fails it.
'use strict';
const { chromium } = require('playwright');

const [base, seedText] = process.argv.slice(2);
let seed = Number(seedText) || 1;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(random() * list.length)];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const fail = (why) => {
    console.log('FAIL ' + why);
    process.exit(1);
};

// watch: a page's uncaught errors fail the walk; its console errors are only told
function watch(page, who) {
    page.on('pageerror', (e) => fail(`${who}: ${e.stack || e}`));
    page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && console.log(`${who} console: ${m.text()}`));
}

// the window shows the view it was last given (app.ts render)
async function windowMatches(page, what) {
    const wrong = await page.evaluate(() => {
        const v = window.__view;
        if (!v) return null;
        const rows = [...document.querySelectorAll('#list .row')];
        if (rows.length !== v.rows.length) return `${rows.length} rows shown, ${v.rows.length} in the view`;
        for (let i = 0; i < rows.length; i++) {
            const r = v.rows[i],
                el = rows[i];
            if (el.querySelector('.title').textContent !== r.title) return `row ${i} says ${el.querySelector('.title').textContent}`;
            for (const [cls, on] of [
                ['now', r.now],
                ['played', r.played],
                ['off', r.off],
                ['selected', i === v.selected],
            ])
                if (el.classList.contains(cls) !== on) return `row ${i} ${on ? "isn't" : 'is'} ${cls}`;
        }
        const play = document.getElementById('play');
        if (play.classList.contains('stop') !== (v.play === 'stop')) return `the big button, for ${v.play}`;
        if (play.classList.contains('on') !== v.playOn) return `Play ${v.playOn ? "isn't" : 'is'} on`;
        if (document.getElementById('slider').disabled === v.slider.on) return 'the slider';
        if ((document.getElementById('hint').style.display !== 'none') !== (v.rows.length === 0)) return 'the hint';
        return '';
    });
    if (wrong) fail(`the window, after ${what}: ${wrong}`);
}

async function rowCenter(page, i) {
    const box = await page.locator('#list .row').nth(i).boundingBox();
    return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function walkWindow(browser) {
    const page = await browser.newPage({ viewport: { width: 420, height: 640 } });
    watch(page, 'window');
    await page.goto(`${base}/window/`);
    const files = await (await fetch(`${base}/files`)).json();
    const kinds = ['clip', 'clip2', 'song', 'pdf', 'junk', 'gone'];
    // first, something to play
    await page.evaluate((paths) => window.__drop(10, 10, paths), [files.clip, files.song, files.pdf]);
    const steps = [
        ['drop', async () => page.evaluate((paths) => window.__drop(10, 300, paths), [files[pick(kinds)], files[pick(kinds)]])],
        ['Play', async () => page.click('#play')],
        ['the link', async () => page.click('#link')],
        [
            'a click on a row',
            async () => {
                const n = await page.locator('#list .row').count();
                const c = n && (await rowCenter(page, Math.floor(random() * n)));
                if (c) await page.mouse.click(c.x, c.y);
            },
        ],
        [
            'a double-click on a row',
            async () => {
                const n = await page.locator('#list .row').count();
                const c = n && (await rowCenter(page, Math.floor(random() * n)));
                if (c) await page.mouse.click(c.x, c.y, { clickCount: 2 });
            },
        ],
        [
            'a drag',
            async () => {
                const n = await page.locator('#list .row').count();
                if (n < 2) return;
                const from = await rowCenter(page, Math.floor(random() * n)),
                    to = await rowCenter(page, Math.floor(random() * n));
                await page.mouse.move(from.x, from.y);
                await page.mouse.down();
                await page.mouse.move(to.x, to.y, { steps: 5 });
                await page.mouse.up();
            },
        ],
        ['Backspace', async () => page.keyboard.press('Backspace')],
        ['→', async () => page.keyboard.press('ArrowRight')],
        ['←', async () => page.keyboard.press('ArrowLeft')],
        [
            'the slider',
            async () =>
                page.evaluate((f) => {
                    const s = document.getElementById('slider');
                    if (s.disabled) return;
                    s.dispatchEvent(new Event('pointerdown'));
                    s.value = String(Number(s.min) + f * (Number(s.max) - Number(s.min)));
                    s.dispatchEvent(new Event('input'));
                    s.dispatchEvent(new Event('change'));
                }, random()),
        ],
        ['waiting', async () => sleep(500 + random() * 2500)],
    ];
    const taken = {};
    for (let i = 0; i < 45; i++) {
        const [what, act] = pick(steps);
        taken[what] = (taken[what] || 0) + 1;
        await act();
        await sleep(450); // a view or two later
        await windowMatches(page, what);
    }
    console.log(
        'window: ' +
            Object.entries(taken)
                .map(([k, n]) => `${k} ×${n}`)
                .join(', '),
    );
    // and Play, for the viewers: wait for the link and press it if it's off
    for (let i = 0; i < 60; i++) {
        const v = await page.evaluate(() => window.__view);
        if (v && v.rows.length && v.play === 'play' && v.playOn) await page.click('#play');
        if (v && v.play === 'stop') break;
        if (v && !v.rows.length) await page.evaluate((paths) => window.__drop(10, 10, paths), [files.clip]);
        await sleep(500);
    }
    return page;
}

async function viewer(browser, url, name) {
    const context = await browser.newContext({ permissions: ['microphone'] });
    await context.addInitScript(() => {
        // every connection, to read its stats
        const PC = window.RTCPeerConnection;
        window.__pcs = [];
        window.RTCPeerConnection = function (...a) {
            const pc = new PC(...a);
            window.__pcs.push(pc);
            return pc;
        };
        window.RTCPeerConnection.prototype = PC.prototype;
    });
    const page = await context.newPage();
    watch(page, name);
    await page.goto(url);
    await page.fill('#usernameInput', name);
    await page.press('#usernameInput', 'Enter');
    await page.waitForSelector('#chatInputBox', { state: 'visible' });
    return page;
}

async function viewers(browser) {
    let link = '';
    for (let i = 0; i < 60 && !link; i++) {
        link = await (await fetch(`${base}/viewer`)).json();
        if (!link) await sleep(500);
    }
    if (!link) fail('no link to give the viewers');
    const url = link.replace(/^http:\/\/[^:/]+/, 'http://127.0.0.1'); // a secure context, for the microphone
    const ann = await viewer(browser, url, 'Ann'),
        bob = await viewer(browser, url, 'Bob');

    // a line of chat, from one to the other
    await bob.fill('#messageInput', 'hello from Bob');
    await bob.press('#messageInput', 'Enter');
    await ann.waitForFunction(() => document.body.innerText.includes('hello from Bob'), null, { timeout: 5000 }).catch(() => fail('the chat line never reached Ann'));

    // every app: opened by Ann, drawn on both pages, closed by Bob
    const count = await (async () => {
        await ann.locator('.plus:visible').first().click();
        await ann.waitForSelector('.picker-app', { state: 'visible' });
        const n = await ann.locator('.picker-app').count();
        await ann.keyboard.press('Escape');
        return n;
    })();
    if (count < 10) fail(`the picker offers ${count} apps`);
    for (let i = 0; i < count; i++) {
        await ann.locator('.plus:visible').first().click();
        await ann.waitForSelector('.picker-app', { state: 'visible' });
        const title = (await ann.locator('.picker-app').nth(i).innerText()).trim();
        await ann.locator('.picker-app').nth(i).click();
        for (const page of [ann, bob])
            await page
                .waitForFunction(() => document.querySelector('.win .win-body') && document.querySelector('.win .win-body').childElementCount > 0, null, { timeout: 8000 })
                .catch(() => fail(`${title} never drew`));
        await sleep(800); // its script running, a view or two
        await bob.locator('.win-close').first().click();
        await ann.waitForFunction(() => !document.querySelector('.win'), null, { timeout: 5000 }).catch(() => fail(`${title} never closed`));
        await sleep(1100); // a page opens or closes one app a second
    }
    console.log(`viewers: ${count} apps opened, drawn and closed; chat went across`);

    // a call: both in, sound both ways
    await ann.locator('.plus:visible').first().click();
    await ann.waitForSelector('.picker-app', { state: 'visible' });
    await ann.locator('.picker-app', { hasText: 'Call' }).click();
    for (const page of [ann, bob]) {
        await page.getByRole('button', { name: 'Join the call' }).click({ timeout: 8000 });
    }
    await sleep(8000);
    for (const [who, page] of [
        ['Ann', ann],
        ['Bob', bob],
    ]) {
        const audio = await page.evaluate(async () => {
            let sent = 0,
                got = 0;
            for (const pc of window.__pcs) {
                // not the movie's: the one with video
                if (pc.connectionState === 'closed' || pc.getTransceivers().some((t) => t.receiver.track.kind === 'video')) continue;
                (await pc.getStats()).forEach((s) => {
                    if (s.kind !== 'audio') return;
                    if (s.type === 'outbound-rtp') sent += s.packetsSent;
                    if (s.type === 'inbound-rtp' && s.packetsReceived) got += s.packetsReceived;
                });
            }
            return { sent, got };
        });
        if (audio.sent < 50 || audio.got < 50) fail(`${who} in the call: sent ${audio.sent} packets, got ${audio.got}`);
        console.log(`call: ${who} sent ${audio.sent} sound packets, got ${audio.got}`);
    }
}

(async () => {
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    try {
        await walkWindow(browser);
        await viewers(browser);
    } finally {
        await browser.close();
    }
    console.log('ok');
})().catch((e) => fail(e.stack || String(e)));
