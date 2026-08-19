const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

function getExecutablePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
}

async function launchBrowser() {
  const execPath = getExecutablePath();

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--lang=en-US,en',
    '--window-size=1366,768'
  ];

  // Wire in proxy if configured — works with any HTTP/HTTPS/SOCKS5 proxy URL
  // e.g. PROXY_URL=http://user:pass@gate.smartproxy.com:10000
  const proxy = process.env.PROXY_URL;
  if (proxy) {
    args.push(`--proxy-server=${proxy}`);
    console.log(`[Browser] Proxy active: ${proxy.replace(/:[^:@]+@/, ':***@')}`);
  }

  const options = { headless: 'new', args };
  if (execPath) options.executablePath = execPath;

  return await puppeteer.launch(options);
}

// Random fingerprint to use per page — call randomFingerprint() and apply with applyFingerprint(page, fp)
const UA_POOL = [
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', platform: 'Win32', vendor: 'Google Inc.' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', platform: 'Win32', vendor: 'Google Inc.' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', platform: 'MacIntel', vendor: 'Google Inc.' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15', platform: 'MacIntel', vendor: 'Apple Computer, Inc.' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0', platform: 'Win32', vendor: 'Google Inc.' },
];

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
];

function randomFingerprint() {
  const fp = UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
  const vp = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  return { ...fp, viewport: vp };
}

async function applyFingerprint(page, fp) {
  await page.setUserAgent(fp.ua);
  await page.setViewport(fp.viewport);
  // Override navigator properties so they match the spoofed UA
  await page.evaluateOnNewDocument((platform, vendor) => {
    Object.defineProperty(navigator, 'platform',     { get: () => platform });
    Object.defineProperty(navigator, 'vendor',       { get: () => vendor });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 + Math.floor(Math.random() * 5) });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => [4, 8, 16][Math.floor(Math.random() * 3)] });
    // Randomize screen so it matches viewport
    Object.defineProperty(screen, 'width',  { get: () => window.innerWidth  + 80 });
    Object.defineProperty(screen, 'height', { get: () => window.innerHeight + 80 });
  }, fp.platform, fp.vendor);
}

module.exports = { launchBrowser, randomFingerprint, applyFingerprint };
