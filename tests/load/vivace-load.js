/*
 * vivace-load.js — k6 load / stress test for the Vivace stamp card.
 *
 * Models one visitor's session: GET / (HTML with inlined boothCodes + CCA
 * catalog), then the CSS/JS/logo assets a fresh browser would fetch, then
 * an idle spell, then an occasional re-open.  The app has no server-side
 * state per user (all localStorage), no auth, no writes — so the test only
 * exercises HTML render + static assets.
 *
 * Stages: smoke → load (expected event peak) → stress (worst-case + margin).
 * Fails the run if any threshold breaches.
 *
 * Install:   brew install k6   (or Linux equivalent)
 * Run:
 *     export VIVACE_URL="https://your-vercel-url"
 *     k6 run tests/load/vivace-load.js --out json=tests/load/raw.json
 *
 * Report:  tests/load/report.html (via handleSummary + k6-reporter).
 */

import http     from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { htmlReport }   from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary }  from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE = __ENV.VIVACE_URL || 'http://localhost:8000';

// Total number of CCA logo files in public/images/ccas (1..86).
const CCA_COUNT = 86;

// The CCA logos that ship as .jpg instead of .png (see public/images/ccas/).
const JPG_IDS = new Set([
    4, 8, 9, 11, 20, 25, 29, 31, 35, 43, 56, 60, 61, 62, 65, 67, 78,
]);

const notFound = new Rate('not_found');

export const options = {
    stages: [
        // Smoke — sanity that we're hitting the right URL and thresholds hold.
        { duration: '30s', target:   5 },
        // Load — the expected event peak.
        { duration: '2m',  target: 300 },
        { duration: '3m',  target: 300 },
        { duration: '1m',  target: 300 },
        // Stress — worst case + safety margin.
        { duration: '3m',  target: 800 },
        { duration: '2m',  target: 800 },
        { duration: '30s', target:   0 },
    ],
    thresholds: {
        'http_req_failed{expected_response:true}':    ['rate<0.01'],
        'http_req_duration{expected_response:true}':  ['p(95)<800'],
        'checks':                                     ['rate>0.99'],
        'not_found':                                  ['rate<0.001'],
    },
};

function pick11() {
    const ids = [];
    while (ids.length < 11) {
        const n = 1 + Math.floor(Math.random() * CCA_COUNT);
        if (!ids.includes(n)) ids.push(n);
    }
    return ids;
}

function ccaLogoPath(id) {
    return `/images/ccas/${id}.${JPG_IDS.has(id) ? 'jpg' : 'png'}`;
}

// Parse ?v=<hash> out of the served HTML so subsequent asset requests carry
// the same version query string a real browser would use.
function extractAssetVersion(html) {
    const m = html.match(/\/js\/state\.js\?v=([^"'&]+)/);
    return m ? m[1] : '';
}

export default function () {
    // 1. Homepage HTML.  Once s-maxage is live this is edge-cached.
    const homepage = http.get(`${BASE}/`, {
        headers: { 'Accept-Encoding': 'gzip, br' },
        tags:    { name: 'GET /' },
    });
    const ok = check(homepage, {
        'GET / is 200':            (r) => r.status === 200,
        'GET / has boothCodes':    (r) => r.body.includes('BOOTH_CODES'),
        'GET / gzipped':           (r) => (r.headers['Content-Encoding'] || '').match(/gzip|br/),
    });
    if (homepage.status === 404) notFound.add(1); else notFound.add(0);
    if (!ok) { sleep(1); return; }

    const v = extractAssetVersion(homepage.body);
    const q = v ? `?v=${v}` : '';

    // 2. CSS.
    const cssBatch = ['tokens', 'base', 'card', 'modals', 'install'].map(
        (name) => ['GET', `${BASE}/css/${name}.css${q}`, null,
                   { tags: { name: 'GET /css/*' } }]);
    // 3. JS.
    const jsBatch  = ['state', 'ui', 'install', 'app'].map(
        (name) => ['GET', `${BASE}/js/${name}.js${q}`, null,
                   { tags: { name: 'GET /js/*' } }]);
    // 4. Vivace header logo + 11 random CCA logos (per-user selection).
    const imgs = [['GET', `${BASE}/images/vivace-logo.png`, null,
                   { tags: { name: 'GET /images/logo' } }]];
    for (const id of pick11()) {
        imgs.push(['GET', `${BASE}${ccaLogoPath(id)}`, null,
                   { tags: { name: 'GET /images/ccas/*' } }]);
    }

    const responses = http.batch([...cssBatch, ...jsBatch, ...imgs]);
    check(responses[0], { 'css tokens 200': (r) => r.status === 200 });
    check(responses[cssBatch.length], { 'js state 200': (r) => r.status === 200 });

    // 5. Idle: user reads / walks to next booth.
    sleep(15 + Math.random() * 30);

    // 6. Occasionally re-open the app from the home screen (10% of sessions).
    if (Math.random() < 0.1) {
        const r2 = http.get(`${BASE}/`, { tags: { name: 'GET / (reopen)' } });
        check(r2, { 'reopen 200': (r) => r.status === 200 });
    }
}

export function handleSummary(data) {
    return {
        'tests/load/report.html': htmlReport(data),
        stdout: textSummary(data, { indent: '  ', enableColors: true }),
    };
}
