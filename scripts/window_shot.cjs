// A picture of the Mac window for the website (website/shots/window.png): frontend/ in headless Chromium
// with a stand-in for the Go side and a made-up list (home movies that don't exist: never a real film, song or book).
//   node scripts/window_shot.cjs frontend website/shots/window.png   (node with Playwright, as browser_test.go wants)
const { chromium } = require('playwright');
const path = require('path');
const [, , frontend, out] = process.argv;
const view = {
    play: 'stop', playOn: true, link: 'copy', linkOn: true, linkPress: true, linkNote: '',
    rows: [
        { title: "Beach Trip, Summer 2019", icon: 'video', length: '1:36:00', now: false, played: true, off: false },
        { title: "Grandma's 80th Birthday", icon: 'video', length: '42:10 of 1:32:00', now: true, played: false, off: false },
        { title: "Our Band, Live in the Garage", icon: 'audio', length: '9:22', now: false, played: false, off: false },
        { title: 'The Zine We Made', icon: 'pdf', length: '24 pages', now: false, played: false, off: false },
        { title: 'Trip Notes', icon: 'text', length: '6 pages', now: false, played: false, off: false },
        { title: 'Recipes', icon: 'db', length: '2.1 MB', now: false, played: false, off: false },
        { title: "The Wedding Video", icon: 'download', length: '312 MB of 1.1 GB', now: false, played: false, off: false },
    ],
    selected: 1, slider: { on: true, min: 0, max: 5520, value: 2530, label: '42:10', pages: false }, locked: false, sealed: false,
};
(async () => {
    const browser = await chromium.launch();
    for (const scheme of ['light']) {
        const page = await browser.newPage({ viewport: { width: 520, height: 470 }, deviceScaleFactor: 2, colorScheme: scheme });
        await page.addInitScript((view) => {
            const app = new Proxy({}, { get: (_, name) => async () => (name === 'GetView' ? view : name === 'Welcome' ? false : '') });
            window.go = { main: { App: app } };
            window.runtime = new Proxy({}, { get: () => () => {} });
        }, view);
        await page.route('http://window.test/**', (route) => {
            const u = new URL(route.request().url());
            const file = path.resolve(frontend, '.' + (u.pathname === '/' ? '/index.html' : u.pathname));
            route.fulfill({ path: file }).catch(() => route.fulfill({ status: 404, body: '' }));
        });
        page.on('pageerror', (e) => console.log('page error:', e.message));
        await page.goto('http://window.test/');
        await page.waitForTimeout(800);
        await page.screenshot({ path: out });
    }
    await browser.close();
})();
