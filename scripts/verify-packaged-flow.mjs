import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.platform !== 'darwin') {
  throw new Error('Packaged flow verification currently supports macOS only.');
}

const onboardingOnly = process.argv.includes('--onboarding');
const screenshotDirectory = process.env.STRATA_SCREENSHOT_DIR
  ? resolve(process.env.STRATA_SCREENSHOT_DIR)
  : null;
assert.equal(
  process.arch,
  'arm64',
  'Run packaged verification on Apple Silicon.',
);
const appPath = resolve('out/Strata AI-darwin-arm64/Strata AI.app');
const executable = join(appPath, 'Contents', 'MacOS', 'Strata AI');
const profile = await mkdtemp(join(tmpdir(), 'strata-packaged-flow-'));

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

const port = await freePort();
const child = spawn(
  executable,
  [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let processOutput = '';
child.stdout.on('data', (chunk) => (processOutput += chunk.toString()));
child.stderr.on('data', (chunk) => (processOutput += chunk.toString()));

async function waitForTarget() {
  const deadline = Date.now() + 30_000;
  let lastTargets = [];
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged app exited early.\n${processOutput}`);
    }
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
        (response) => response.json(),
      );
      lastTargets = targets;
      const page = targets.find(
        (target) =>
          target.type === 'page' &&
          target.url &&
          target.url !== 'about:blank' &&
          target.title,
      );
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // The debugging endpoint is not ready yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(
    `Timed out waiting for packaged renderer.\nTargets: ${JSON.stringify(lastTargets, null, 2)}\nProcess output:\n${processOutput}`,
  );
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.consoleProblems = [];
    this.webRequests = [];
  }

  async open() {
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.consoleProblems.push(message.params.exceptionDetails.text);
      }
      if (
        message.method === 'Log.entryAdded' &&
        ['error', 'warning'].includes(message.params.entry.level)
      ) {
        this.consoleProblems.push(message.params.entry.text);
      }
      if (message.method === 'Network.requestWillBeSent') {
        const url = message.params.request.url;
        if (/^https?:/u.test(url)) this.webRequests.push(url);
      }
    });
    await Promise.all([
      this.send('Runtime.enable'),
      this.send('Page.enable'),
      this.send('Log.enable'),
      this.send('Network.enable'),
    ]);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async captureScreenshot(name) {
    if (!screenshotDirectory) return;
    await mkdir(screenshotDirectory, { recursive: true });
    const metrics = await this.send('Page.getLayoutMetrics');
    const { width, height } = metrics.cssContentSize;
    const result = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    await writeFile(
      join(screenshotDirectory, `${name}.png`),
      Buffer.from(result.data, 'base64'),
    );
  }

  close() {
    this.socket.close();
  }
}

let cdp;

function bodyIncludes(text) {
  return `(document.body?.innerText.includes(${JSON.stringify(text)}) ?? false)`;
}

async function waitFor(expression, description, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 75));
  }
  const body = await cdp.evaluate('document.body?.innerText ?? ""');
  throw new Error(
    `Timed out waiting for ${description}.\nVisible text:\n${body}\nProcess output:\n${processOutput}`,
  );
}

function fieldExpression(label, action) {
  return `(() => {
    const field = [...document.querySelectorAll('input, textarea')].find((item) => {
      const ownLabel = item.getAttribute('aria-label');
      const linked = item.id ? document.querySelector('label[for="' + CSS.escape(item.id) + '"]')?.textContent : '';
      return ownLabel === ${JSON.stringify(label)} || linked?.includes(${JSON.stringify(label)});
    });
    if (!field) return false;
    ${action}
    return true;
  })()`;
}

async function setField(label, value) {
  const changed = await cdp.evaluate(
    fieldExpression(
      label,
      `const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set;
       setter.call(field, ${JSON.stringify(value)});
       field.dispatchEvent(new Event('input', { bubbles: true }));
       field.focus();`,
    ),
  );
  assert.equal(changed, true, `Field not found: ${label}`);
}

async function clickButton(label) {
  const clicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent.replace(/\\s+/gu, ' ').trim().startsWith(${JSON.stringify(label)}) || item.getAttribute('aria-label') === ${JSON.stringify(label)}
    );
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Enabled button not found: ${label}`);
}

async function activeElement() {
  return cdp.evaluate(`(() => {
    const item = document.activeElement;
    if (!item) return null;
    const linked = item.id ? document.querySelector('label[for="' + CSS.escape(item.id) + '"]')?.textContent : '';
    return { tag: item.tagName, text: item.textContent?.trim() ?? '', label: item.getAttribute('aria-label') ?? linked ?? '', id: item.id };
  })()`);
}

try {
  cdp = new CdpClient(await waitForTarget());
  await cdp.open();

  if (onboardingOnly) {
    await waitFor(bodyIncludes('First, connect DeepSeek.'), 'fresh onboarding');
    await cdp.captureScreenshot('01-onboarding');
    const active = await activeElement();
    assert.equal(active.tag, 'INPUT');
    assert.match(active.label, /DeepSeek API key/u);
    assert.equal(cdp.webRequests.length, 0);
    assert.deepEqual(cdp.consoleProblems, []);
    console.log('Verified normal packaged onboarding with a fresh profile.');
  } else {
    await waitFor(
      bodyIncludes('Find the edge of what you know.'),
      'configured home',
    );
    await cdp.captureScreenshot('02-home');
    let active = await activeElement();
    assert.equal(active.tag, 'INPUT');
    assert.match(active.label, /Topic/u);

    await setField('Topic or question', 'Database indexes');
    await waitFor(
      `[...document.querySelectorAll('button')].some((item) => item.textContent.includes('Start diagnostic') && !item.disabled)`,
      'enabled keyboard submission',
    );
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      nativeVirtualKeyCode: 36,
      windowsVirtualKeyCode: 13,
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'char',
      key: 'Enter',
      code: 'Enter',
      text: '\r',
      unmodifiedText: '\r',
      nativeVirtualKeyCode: 36,
      windowsVirtualKeyCode: 13,
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      nativeVirtualKeyCode: 36,
      windowsVirtualKeyCode: 13,
    });
    await waitFor(
      bodyIncludes('Why can an index avoid scanning every row?'),
      'diagnostic question',
    );
    await cdp.captureScreenshot('03-question');

    await clickButton('Rephrase it · uses AI');
    await waitFor(
      bodyIncludes('What lets a database narrow the rows it checks?'),
      'graduated help',
    );
    await cdp.captureScreenshot('04-graduated-help');

    const answer = 'Indexes avoid scanning every row.';
    await setField('Your explanation', answer);
    await clickButton('Check my thinking · uses AI');
    await waitFor(bodyIncludes('Try again · uses AI'), 'planned retry state');
    assert.equal(
      await cdp.evaluate(
        fieldExpression('Your explanation', 'return field.value;'),
      ),
      answer,
    );
    await clickButton('Try again · uses AI');
    await waitFor(bodyIncludes('You have the shape of it.'), 'feedback');
    await cdp.captureScreenshot('05-feedback');
    active = await activeElement();
    assert.equal(active.id, 'feedback-heading');

    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(
      bodyIncludes('In progress · 1 answered · 1 developing'),
      'pending session history',
    );
    await clickButton('Continue');
    await waitFor(
      bodyIncludes('You have the shape of it.'),
      'persisted pending feedback',
    );
    active = await activeElement();
    assert.equal(active.id, 'feedback-heading');

    await setField(
      'Why should Strata reconsider?',
      'My answer clearly explains the avoided scan.',
    );
    await clickButton('Challenge evaluation · uses AI');
    await waitFor(
      bodyIncludes('Evaluation history · 2 revisions'),
      'challenge revision',
    );
    await clickButton('Evaluation history');
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    await cdp.captureScreenshot('06-evaluation-history');
    assert.ok((await activeElement()).id === 'feedback-heading');

    await clickButton('Finish session');
    await waitFor(bodyIncludes('SESSION COMPLETE'), 'session summary');
    await cdp.captureScreenshot('07-session-summary');
    active = await activeElement();
    assert.equal(active.tag, 'H1');
    assert.equal(active.text, 'Database indexes');

    await clickButton('Start a new topic');
    await waitFor(bodyIncludes('Continue learning'), 'history home');
    await cdp.captureScreenshot('08-session-history');
    assert.equal(await cdp.evaluate(bodyIncludes('Database indexes')), true);
    await clickButton('Delete Database indexes session');
    await waitFor(bodyIncludes('Delete this local session?'), 'delete dialog');
    assert.equal(
      await cdp.evaluate(
        'document.querySelector("[role=dialog]")?.contains(document.activeElement) ?? false',
      ),
      true,
    );
    await clickButton('Delete session');
    await waitFor(
      `${bodyIncludes('Your learning evidence will appear here.')} && ${bodyIncludes('Deleted Database indexes session.')}`,
      'local deletion',
    );
    await waitFor(
      'document.activeElement?.id === "recent-sessions-heading"',
      'post-deletion focus restoration',
    );
    active = await activeElement();
    assert.equal(active.id, 'recent-sessions-heading');

    assert.equal(cdp.webRequests.length, 0, 'Renderer made an HTTP request.');
    assert.deepEqual(cdp.consoleProblems, []);
    console.log(
      'Verified packaged fake-provider flow: keyboard start, help, retry, pending feedback reload, challenge, summary, deletion, focus, and zero renderer network.',
    );
  }
} finally {
  cdp?.close();
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolveExit) => child.once('exit', () => resolveExit(true))),
    new Promise((resolveWait) => setTimeout(() => resolveWait(false), 2_000)),
  ]);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolveExit) => child.once('exit', resolveExit));
  }
  await rm(profile, { recursive: true, force: true });
}
