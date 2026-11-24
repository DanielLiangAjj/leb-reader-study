// Screens and flow of the reader study: welcome, the introduction of each part, one trial at a time with a clock,
// a short survey, and the finish screen.
import { h } from './dom.js';
import * as store from './storage.js';
import * as sync from './sync.js';
import * as api from './api.js';
import { TEST } from './mode.js';

/** Stored with every answer; bump it whenever the form or the answer format changes. */
export const APP_VERSION = '1.2'; // 1.1: the form names the drug of the review question; 1.2: the instructions say that the time is a result and ask for each trial in one go
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Rough minutes per trial behind the times on the welcome page. They are guesses, not measurements;
// the practice trials give the first real figures.
const MINUTES = { A: 8, B: 3 };
const COND = {
  A: { name: 'From the paper', short: 'paper', cls: '' },
  B: { name: 'From the evidence base', short: 'evidence base', cls: ' b' },
};
const DOT = {
  saved: ['Saved', 'All answers are saved on the server.'],
  saving: ['Saving…', 'Saving your latest answers to the server.'],
  offline: ['Offline', 'The server cannot be reached. Your answers are kept in this browser and will be sent automatically when the connection returns.'],
  local: ['This browser only', 'No server is configured: answers are saved in this browser only.'],
};

// The extraction form (protocol, section 4). `ng` false means the field has no "not given" tick of its own.
const FIELDS = [
  { id: 'drug_dose', title: 'Drug and dose of the GLP-1 arm', kind: 'text',
    hint: (drug) => `The arm of ${drug}, with its dose and how often it is given. If the trial has several doses of ${drug}, give the highest dose and extract its result below.` },
  { id: 'comparator', title: 'Comparator', kind: 'text',
    hint: 'The placebo arm, as the source names it.' },
  { id: 'n_randomized', title: 'Number of participants randomized', kind: 'number',
    hint: 'All arms of the trial together.' },
  { id: 'weeks', title: 'Time of the body-weight result', kind: 'number', unit: 'weeks',
    hint: 'Weeks from randomization to the main weight result.' },
  { id: 'measure', title: 'How the weight result is expressed', kind: 'choice',
    hint: 'Take the percent change in body weight when the source gives it; if not, the change in kg; if not, what the source gives. Fields 6 to 8 are about this result.',
    options: [['percent', 'Percent change in body weight'], ['kg', 'Change in kg'], ['threshold', 'Share reaching a weight-loss threshold'], ['other', 'Other']] },
  { id: 'direction', title: 'Direction: body weight with the drug against placebo', kind: 'choice',
    hint: 'As the source reports it. A larger share reaching a weight-loss threshold with the drug counts as lower body weight.',
    options: [['lower', 'Lower with the drug'], ['no_difference', 'No difference'], ['higher', 'Higher with the drug']] },
  { id: 'size', title: 'Size of the effect', kind: 'size',
    hint: 'The value in each arm, or the difference between the arms with its interval. Fill what the source gives, with the sign as printed.' },
  { id: 'test', title: 'Statistical test between the two arms', kind: 'test', ng: false,
    hint: 'For the result of fields 5 to 7.' },
];
const TEST_OPTIONS = [['p', 'A P value is given'], ['significant', 'Called significant, no P value'],
  ['not_significant', 'Called not significant, no P value'], ['none', 'No test is given in my source']];
const SURVEY_USE = [['yes', 'Yes, as they are'], ['yes_check', 'Yes, and then check them against the papers'], ['no', 'No']];

let study = null;
let session = null;   // {code, name, email, reader, answers: Map "sheet/item" -> record}
let syncInfo = sync.info();
let work = null;      // the trial on screen: {step, trial, fields, confidence, note, timing, opened, tick}
let bannerSig = '';
let downloaded = false;

const $ = (id) => document.getElementById(id);
const now = () => Date.now();

export function initUI(studyData) {
  study = studyData;
  sync.onStatus((info) => { syncInfo = info; paintStatus(); });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => { if (work) persistDraft(); });
}

function setWide(on) { $('main').classList.toggle('wide', on); }

export function showFatal(message) {
  $('topbar').hidden = true;
  $('main').replaceChildren(h('section', { class: 'panel' }, h('h1', {}, 'Something went wrong'), h('p', {}, message)));
}

// ---- the order of work ----------------------------------------------------------------------

const sequence = () => study.readers[session.reader];
const totalTrials = () => sequence().reduce((n, p) => n + p.items.length, 0);
const doneTrials = () => sequence().reduce((n, p) => n + p.items.filter((id) => session.answers.has(`${p.sheet}/${id}`)).length, 0);
const partLabel = (part) => (part.part === 'practice' ? 'Practice' : `Block ${part.no} of 4`);

/** The first trial without a submitted form, then the survey, then nothing. */
function nextStep() {
  const seq = sequence();
  for (let pi = 0; pi < seq.length; pi++) {
    const part = seq[pi];
    for (let ti = 0; ti < part.items.length; ti++) {
      const id = part.items[ti];
      if (!session.answers.has(`${part.sheet}/${id}`)) return { pi, ti, part, id, trial: study.trials[id] };
    }
  }
  if (!session.answers.has('survey/S1')) return { survey: true };
  return null;
}

function go() {
  closeWork();
  const step = nextStep();
  if (!step) { showFinish(); return; }
  if (step.survey) { showSurvey(); return; }
  const draft = store.loadDraft(session.code, step.part.sheet, step.id);
  if (draft && draft.timing && draft.timing.started_at) { showTrial(step, draft); return; } // the clock of this trial already runs
  if (step.ti === 0) showPartIntro(step); else showReady(step);
}

// ---- shared pieces --------------------------------------------------------------------------

async function copyText(button, text, label) {
  let ok = true;
  try { await navigator.clipboard.writeText(text); } catch { ok = false; }
  button.textContent = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => { button.textContent = label; }, 1600);
}

function statusDot() {
  const node = h('span', { class: 'save-dot', role: 'status' });
  paintDot(node);
  return node;
}

function paintDot(node) {
  const [label, tip] = DOT[syncInfo.status] || DOT.saved;
  let text = tip;
  if (syncInfo.pending && (syncInfo.status === 'saving' || syncInfo.status === 'offline')) text += ` ${syncInfo.pending} waiting to be sent.`;
  if (syncInfo.refused) text += ` ${syncInfo.refused} refused by the server; kept in this browser and in the download.`;
  node.dataset.status = syncInfo.status;
  node.title = text;
  node.setAttribute('aria-label', text);
  node.replaceChildren(h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'dot-label', 'aria-hidden': 'true' }, label));
}

function renderTopbar({ part = null, count = '', clock = false } = {}) {
  const top = $('topbar');
  if (!session) { top.hidden = true; top.replaceChildren(); return; }
  const done = doneTrials();
  const total = totalTrials();
  const copy = h('button', { type: 'button', class: 'btn-link', onclick: () => copyText(copy, session.code, 'Copy') }, 'Copy');
  top.hidden = false;
  top.replaceChildren(
    h('div', { class: 'tb-row' },
      h('div', { class: 'tb-left' },
        h('span', { class: 'brand' }, 'Extracting trial results'),
        TEST ? h('span', { class: 'tb-sheet' }, 'TEST MODE') : null,
        part ? h('span', { class: 'tb-sheet' }, partLabel(part)) : null,
        part ? h('span', { class: `cond-tag${COND[part.condition].cls}` }, COND[part.condition].name) : null,
        count ? h('span', { class: 'tb-count' }, count) : null),
      h('div', { class: 'tb-right' },
        clock ? h('span', { class: 'clock', id: 'clock', title: 'Time on this trial. It stops when you submit the form.' }, '0:00') : null,
        clock ? h('button', { type: 'button', class: 'btn btn-small', onclick: pauseNow }, 'Pause') : null,
        h('span', { class: 'code-chip', title: 'Your code is how you continue on another device: choose "Resume with a code" there.' },
          h('span', { class: 'code-label' }, 'Your code'), h('code', { class: 'code' }, session.code), copy),
        statusDot())),
    h('div', {
      class: 'progress', role: 'progressbar', 'aria-label': 'Overall progress', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done,
      title: `${done} of ${total} trials done, practice included`,
    }, h('div', { class: 'progress-fill', style: `width:${(total ? (100 * done) / total : 0).toFixed(2)}%` })));
}

function renderBanners() {
  const list = [];
  if (TEST) list.push(['banner banner-local', 'Test mode: nothing you enter is sent to the study’s database. It stays in this browser, apart from any real session.']);
  else if (!api.configured()) list.push(['banner banner-local', 'Saving to this browser only (no server configured). Download your answers at the end.']);
  else if (syncInfo.status === 'offline') list.push(['banner banner-offline', "Offline: the server can't be reached right now. Your answers are kept in this browser and will be sent automatically when the connection returns."]);
  if (!store.storageWorks()) list.push(['banner banner-error', 'This browser is not keeping data between visits (private window or storage blocked). Keep this page open, and download your answers before you close it.']);
  const sig = JSON.stringify(list);
  if (sig === bannerSig) return;
  bannerSig = sig;
  $('banners').replaceChildren(...list.map(([cls, text]) => h('div', { class: cls }, text)));
}

function paintStatus() {
  document.querySelectorAll('.save-dot').forEach(paintDot);
  renderBanners();
}

function codeLine() {
  const copy = h('button', { type: 'button', class: 'btn-link', onclick: () => copyText(copy, session.code, 'Copy the code') }, 'Copy the code');
  return h('p', { class: 'code-line' }, 'Your code is ', h('code', {}, session.code),
    '. Keep it: it is how you continue later or on another device (open this page and choose “Resume with a code”). ', copy);
}

function minutesText(min) {
  const m = Math.max(5, Math.round(min / 5) * 5);
  if (m < 60) return `about ${m} min`;
  return m % 60 ? `about ${Math.floor(m / 60)} h ${m % 60} min` : `about ${m / 60} h`;
}

function sequenceTable(seq, { marks = false } = {}) {
  const current = marks ? nextStep() : null;
  return h('table', { class: 'seq' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Part'), h('th', {}, 'You extract'), h('th', {}, 'Trials'), h('th', {}, 'Rough time'))),
    h('tbody', {}, seq.map((part, pi) => {
      const done = marks && part.items.every((id) => session.answers.has(`${part.sheet}/${id}`));
      const cls = done ? 'done' : (current && current.pi === pi ? 'now' : '');
      return h('tr', { class: cls },
        h('td', {}, partLabel(part) + (part.part === 'practice' ? ' (not scored)' : '')),
        h('td', {}, COND[part.condition].name.toLowerCase()),
        h('td', {}, String(part.items.length) + (done ? ', done' : '')),
        h('td', {}, minutesText(part.items.length * MINUTES[part.condition])));
    })));
}

// ---- welcome --------------------------------------------------------------------------------

function readerFromLink() {
  const r = new URLSearchParams(window.location.search).get('r');
  return r === '1' || r === '2' ? r : null;
}

export function showWelcome() {
  closeWork();
  setWide(false);
  session = null;
  renderTopbar();
  renderBanners();
  const current = store.getCurrent();
  const reader = readerFromLink();
  const seq = study.readers[(current && current.reader) || reader || '1'];
  const total = seq.reduce((n, p) => n + p.items.length * MINUTES[p.condition], 0);
  $('main').replaceChildren(h('section', { class: 'welcome' },
    h('h1', {}, 'Extracting trial results'),
    h('p', { class: 'lede' }, 'We built an evidence base automatically from the abstracts of randomized trials. This study asks whether it saves a reviewer time: you fill the same short extraction form for a set of trials, for some of them from the paper and for the others from what the evidence base already holds.'),
    h('p', {}, 'The question is the one of a systematic review: in adults with overweight or obesity, how does body weight change with a GLP-1 receptor agonist compared with placebo? For each trial you fill eight fields (drug and dose, comparator, number randomized, time of the result, how the weight result is expressed, direction, size, statistical test). Any field can be answered “Not given in my source”.'),
    h('p', {}, 'The page times each trial from Start to Submit. That time is one of the two results of the study; the other is whether the fields are right. So please do each trial in one go: press Start only when you can work undisturbed for about ten minutes, and press Pause if you are interrupted. Work at your normal pace, as you would for a real review, and do not hurry; this is a test of the two sources, not of you. You can stop between trials and come back; please finish a block in one sitting if you can.'),
    sequenceTable(seq),
    h('p', { class: 'muted' }, `In all ${minutesText(total)}, over as many sittings as you like. The times are rough guesses.`),
    h('p', { class: 'consent' }, 'Your name and email are stored with your answers so we can credit and contact you; nothing else about you is collected.'),
    TEST ? testPanel(reader) : null,
    current && current.code ? continuePanel(current)
      : [reader ? startPanel(reader) : h('div', { class: 'warn-box' }, 'To start, please open the link you were sent: it ends in ?r=1 or ?r=2. If you have already started, resume with your code below.'), resumePanel()]));
}

/** Test mode only: what the mode does, the other reader's order, and a way to start over. */
function testPanel(reader) {
  const other = reader === '2' ? '1' : '2';
  return h('div', { class: 'warn-box' },
    h('p', {}, h('strong', {}, 'Test mode. '), 'This is the page as a reader sees it, with three differences: nothing is sent to the database, ',
      'each part and each trial has a Skip button, and the name and email you type stay in this browser. Times and answers of a test are not part of the study.'),
    h('div', { class: 'actions' },
      h('a', { class: 'btn btn-small', href: `?r=${other}&test=1` }, `Open the test as reader ${other}`),
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => { store.clearTestData(); window.location.reload(); } }, 'Erase my test and start over')));
}

function continuePanel(cur) {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const label = `Continue as ${cur.name}`;
  const goBtn = h('button', {
    type: 'button', class: 'btn btn-primary',
    onclick: async () => {
      goBtn.disabled = true;
      goBtn.textContent = 'Loading…';
      const problem = await resume(cur.code);
      if (problem) { err.textContent = problem; goBtn.disabled = false; goBtn.textContent = label; }
    },
  }, label);
  const other = h('button', { type: 'button', class: 'btn-link', onclick: () => { store.clearCurrent(); showWelcome(); } }, 'I am someone else');
  return h('div', { class: 'panel' },
    h('h2', {}, 'Welcome back'),
    h('p', {}, 'This browser remembers you (code ', h('code', {}, cur.code), ').'),
    h('div', { class: 'actions' }, goBtn, other),
    err);
}

function startPanel(reader) {
  const name = h('input', { id: 'f-name', type: 'text', autocomplete: 'name', maxlength: 80, required: true });
  const email = h('input', { id: 'f-email', type: 'email', autocomplete: 'email', maxlength: 254, required: true });
  const err = h('p', { class: 'form-error', role: 'alert' });
  return h('form', {
    class: 'panel', novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      const n = name.value.trim().replace(/\s+/g, ' ');
      const m = email.value.trim();
      if (n.length < 2 || n.length > 80) { err.textContent = 'Please enter your full name (2 to 80 characters).'; name.focus(); return; }
      if (m.length > 254 || !EMAIL_RE.test(m)) { err.textContent = 'Please enter a valid email address.'; email.focus(); return; }
      startNew(n, m, reader);
    },
  },
  h('h2', {}, 'Start'),
  h('div', { class: 'fields' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Full name'), name),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Email'), email)),
  err,
  h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Start')));
}

function normalizeCode(text) {
  return String(text || '').toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

function resumePanel() {
  const input = h('input', {
    id: 'f-code', type: 'text', class: 'code-input', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: 'false', maxlength: 20, placeholder: 'for example 7K3QX9M2PA', 'aria-label': 'Your code',
  });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'btn' }, 'Resume');
  return h('form', {
    class: 'panel resume', novalidate: true,
    onsubmit: async (event) => {
      event.preventDefault();
      const code = normalizeCode(input.value);
      if (!CODE_RE.test(code)) { err.textContent = 'A code has 10 letters and digits, for example 7K3QX9M2PA.'; return; }
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Checking…';
      const problem = await resume(code);
      if (problem) { err.textContent = problem; btn.disabled = false; btn.textContent = 'Resume'; }
    },
  },
  h('h2', {}, 'Resume with a code'),
  h('p', { class: 'muted' }, 'Already started, here or on another device? Enter the code you were given.'),
  h('div', { class: 'inline' }, input, btn),
  err);
}

// ---- identity and resume --------------------------------------------------------------------

function newCode() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join('');
}

function startNew(name, email, reader) {
  const who = { code: newCode(), name, email, reader };
  store.setCurrent(who);
  store.setIdentity(who.code, who);
  sync.enqueue({ kind: 'register', code: who.code, reader: Number(reader), name, email, user_agent: navigator.userAgent });
  session = { ...who, answers: new Map() };
  go();
}

/** Open the session of a code: what the server holds and what this browser holds, the later answer winning. Returns '' or a message. */
async function resume(code) {
  let server = null;
  let reached = false;
  if (api.configured()) {
    try { server = await api.getProgress(code); reached = true; } catch { sync.markOffline(); }
  }
  const local = store.getIdentity(code);
  if (!server && !local) {
    return reached || !api.configured()
      ? 'This code is not known here. Check it, or start with your name and email.'
      : 'The server cannot be reached and this browser does not know the code. Please try again later.';
  }
  const who = {
    code,
    name: (server && server.name) || local.name,
    email: (server && server.email) || local.email,
    reader: String((server && server.reader) || local.reader),
  };
  if (!study.readers[who.reader]) return 'This code has no reader number. Please write to the study team.';
  store.setCurrent(who);
  store.setIdentity(code, who);
  const answers = store.loadAnswers(code);
  for (const row of (server && server.forms) || []) {
    const key = `${row.sheet}/${row.item_id}`;
    const mine = answers.get(key);
    if (!mine || (Date.parse(row.client_ts) || 0) > (Date.parse(mine.client_ts) || 0)) {
      const record = { answer: row.answer, elapsed_ms: row.elapsed_ms, client_ts: row.client_ts, app_version: row.app_version };
      answers.set(key, record);
      store.saveAnswer(code, row.sheet, row.item_id, record);
    }
  }
  session = { ...who, answers };
  sync.kick();
  go();
  return '';
}

// ---- introduction of a part and the screen before a trial -------------------------------------

function rulesFor(part) {
  const common = [
    'The clock starts when you press Start and stops when you submit the form. That time is a result of the study, so do each trial in one go, without a break. If you are interrupted, press Pause.',
    'Work at your normal pace, as you would when extracting for a real review. Do not hurry: a correct form matters as much as the time.',
    'A field your source does not give is answered “Not given in my source”. That is an answer, not a failure.',
  ];
  const own = part.condition === 'A'
    ? ['For each trial the page names the main report and links to it. Extract from its full text, as a reviewer would. If the journal asks you to sign in, use the library’s access.',
      'Do not open the evidence base, its record sheets or any summary of the trial.']
    : ['For each trial the page shows a record sheet: the arms the evidence base lists for the trial and every result on body weight it holds, each with the sentence it was read from.',
      'Extract from the sheet only. Do not open the paper, PubMed or any other source.'];
  return h('ul', { class: 'rule-list' }, [...own, ...common].map((t) => h('li', {}, t)));
}

function showPartIntro(step) {
  setWide(false);
  renderTopbar({ part: step.part });
  renderBanners();
  const { part } = step;
  const practice = part.part === 'practice';
  $('main').replaceChildren(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, partLabel(part)),
    h('h1', {}, COND[part.condition].name),
    h('p', { class: 'lede' }, practice
      ? `Two practice trials, to get used to the form and the source. They are not scored. Allow ${minutesText(part.items.length * MINUTES[part.condition])}.`
      : `${part.items.length} trials. Allow ${minutesText(part.items.length * MINUTES[part.condition])}, and please finish this block in one sitting if you can.`),
    h('div', { class: 'panel' }, h('h2', {}, 'In this part'), rulesFor(part)),
    codeLine(),
    h('details', { class: 'guide' }, h('summary', {}, 'Where you are in the study'), sequenceTable(sequence(), { marks: true })),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => showReady(step) }, 'Continue'),
      TEST ? h('button', { type: 'button', class: 'btn', onclick: () => skipInTest(restOfPart(step)) }, 'Skip this whole part (test mode)') : null)));
  window.scrollTo(0, 0);
}

function showReady(step) {
  setWide(false);
  const { part } = step;
  renderTopbar({ part, count: `Trial ${step.ti + 1} of ${part.items.length}` });
  renderBanners();
  $('main').replaceChildren(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, `${partLabel(part)}, trial ${step.ti + 1} of ${part.items.length}`),
    h('h1', {}, step.trial.name),
    h('p', { class: 'lede' }, `Body weight with ${step.trial.drug} against placebo. `, part.condition === 'A'
      ? 'You will extract from the paper. The clock starts when you press Start.'
      : 'You will extract from the evidence base’s record sheet. The clock starts when you press Start.'),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => showTrial(step, null) }, 'Start'),
      TEST ? h('button', { type: 'button', class: 'btn', onclick: () => skipInTest([step]) }, 'Skip this trial (test mode)') : null,
      h('span', { class: 'muted' }, 'Once you press Start, please finish this trial in one go. If you need a break, take it now: you can come back later with your code.'))));
  window.scrollTo(0, 0);
}

// ---- the clock --------------------------------------------------------------------------------

function activeMs(t, at = now()) {
  const pausedNow = t.pause_started ? at - t.pause_started : 0;
  return Math.max(0, at - t.started_at - t.paused_ms - pausedNow);
}

function clockText(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function onVisibility() {
  if (!work) return;
  const t = work.timing;
  if (document.hidden) {
    t.hidden_since = now();
  } else if (t.hidden_since) {
    if (!t.pause_started) t.hidden_ms += now() - t.hidden_since; // reading the paper in another tab is counted here
    t.hidden_since = null;
  }
  persistDraft();
}

function persistDraft() {
  if (!work || !session) return;
  work.timing.last_seen = now();
  store.saveDraft(session.code, work.step.part.sheet, work.step.id, {
    fields: work.fields, confidence: work.confidence, note: work.note, timing: work.timing, opened: work.opened,
  });
}

function pauseNow() {
  if (!work || work.timing.pause_started) return;
  work.timing.pause_started = now();
  persistDraft();
  showPaused();
}

function showPaused() {
  const overlay = h('div', { class: 'paused', id: 'paused' },
    h('div', { class: 'panel' },
      h('h2', {}, 'Paused'),
      h('p', {}, 'The clock is stopped and the trial is hidden. Your form is kept.'),
      h('div', { class: 'actions', style: 'justify-content:center' },
        h('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: () => {
            const t = work.timing;
            t.paused_ms += now() - t.pause_started;
            t.pauses += 1;
            t.pause_started = null;
            overlay.remove();
            persistDraft();
            paintClock();
          },
        }, 'Resume'))));
  document.body.append(overlay);
}

function paintClock() {
  const node = $('clock');
  if (node && work) node.textContent = clockText(activeMs(work.timing));
}

function closeWork() {
  if (work && work.tick) clearInterval(work.tick);
  work = null;
  const overlay = $('paused');
  if (overlay) overlay.remove();
}

// ---- the trial screen ---------------------------------------------------------------------------

function emptyFields() {
  return {
    drug_dose: { value: '', ng: false }, comparator: { value: '', ng: false }, n_randomized: { value: '', ng: false },
    weeks: { value: '', ng: false }, measure: { value: '', other: '', ng: false }, direction: { value: '', ng: false },
    size: { drug: '', placebo: '', difference: '', low: '', high: '', ng: false }, test: { value: '', p: '' },
  };
}

function showTrial(step, draft) {
  closeWork();
  setWide(true);
  const at = now();
  work = {
    step, trial: step.trial,
    fields: (draft && draft.fields) || emptyFields(),
    confidence: (draft && draft.confidence) || null,
    note: (draft && draft.note) || '',
    opened: (draft && draft.opened) || [],
    timing: (draft && draft.timing) || { started_at: at, paused_ms: 0, pauses: 0, hidden_ms: 0, closed_ms: 0, reloads: 0, pause_started: null, hidden_since: null, last_seen: at },
    tick: null,
  };
  const t = work.timing;
  if (draft && draft.timing) {
    // The page was closed or reloaded with this trial open. The time it was closed is not counted (and is recorded).
    if (!t.pause_started) {
      const away = Math.max(0, at - (t.last_seen || at));
      t.closed_ms += away;
      t.paused_ms += away;
    }
    t.reloads += 1;
    t.hidden_since = null;
  }
  const { part } = step;
  renderTopbar({ part, count: `Trial ${step.ti + 1} of ${part.items.length}`, clock: true });
  renderBanners();
  const err = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', { class: 'form-pane', novalidate: true, onsubmit: (event) => { event.preventDefault(); submitTrial(form, err); } },
    h('h2', { class: 'pane-title' }, `Extraction form: ${work.trial.name}`),
    h('p', { class: 'ask' }, 'Extract for: body weight with ', h('strong', {}, work.trial.drug), ' against placebo.'),
    FIELDS.map((def, i) => fieldBlock(def, i + 1)),
    confidenceBlock(),
    h('div', { class: 'q' },
      h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, 'Anything to note about this trial (optional)')),
      h('textarea', { rows: 2, maxlength: 1000, oninput: (e) => { work.note = e.target.value; } }, work.note)),
    err,
    h('div', { class: 'submit-row' },
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Submit this trial'),
      TEST ? h('button', { type: 'button', class: 'btn', onclick: () => skipInTest([work.step]) }, 'Skip (test mode)') : null,
      h('span', { class: 'muted' }, 'Submitting stops the clock. A submitted form cannot be reopened.')));
  form.addEventListener('input', () => persistDraft());
  form.addEventListener('change', () => persistDraft());
  $('main').replaceChildren(h('section', { class: 'work' }, sourcePane(part.condition), form));
  window.scrollTo(0, 0);
  persistDraft();
  paintClock();
  let ticks = 0;
  work.tick = setInterval(() => { paintClock(); ticks += 1; if (ticks % 5 === 0) persistDraft(); }, 1000); // the draft carries the time last seen
  if (t.pause_started) showPaused();
}

function frozenDate() {
  const d = new Date(`${study.frozen}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? study.frozen : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function sourcePane(condition) {
  const { trial } = work;
  if (condition === 'A') {
    const p = trial.paper;
    const open = (what, href, label) => h('a', {
      class: 'btn', href, target: '_blank', rel: 'noopener',
      onclick: () => { work.opened.push({ what, at_ms: activeMs(work.timing) }); persistDraft(); },
    }, label);
    return h('aside', { class: 'source-pane' },
      h('h2', { class: 'pane-title' }, 'Your source: the paper'),
      h('p', { class: 'paper-title' }, p.title || trial.name),
      h('p', { class: 'paper-meta' }, [p.journal, p.year, `PubMed id ${p.pmid}`].filter(Boolean).join(', ')),
      h('div', { class: 'paper-links' },
        p.pmc ? open('pmc', `https://pmc.ncbi.nlm.nih.gov/articles/${p.pmc}/`, 'Open the free full text') : null,
        open('pubmed', `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`, p.pmc ? 'Open in PubMed' : 'Open in PubMed (link to the full text is on that page)')),
      h('p', { class: 'muted' }, 'The paper opens in a new tab; this page keeps your form. Extract from the full text. If the journal asks you to sign in, use the library’s access.'),
      h('p', { class: 'muted' }, 'Do not open the evidence base, its record sheets or any summary of this trial.'));
  }
  const { arms, records } = trial.sheet;
  return h('aside', { class: 'source-pane' },
    h('h2', { class: 'pane-title' }, 'Your source: record sheet from the evidence base'),
    h('p', { class: 'muted' }, `The evidence base as frozen on ${frozenDate()}. Extract from this sheet only; do not open the paper or PubMed.`),
    h('h3', {}, 'Arms the evidence base lists for the main report'),
    arms && arms.length
      ? h('ul', { class: 'arms' }, arms.map((a) => h('li', {}, a.name + (a.n ? ` (n = ${Number(a.n).toLocaleString('en-US')})` : ''))))
      : h('p', { class: 'empty-sheet' }, 'The evidence base holds no arm list for the main report of this trial.'),
    h('h3', {}, records.length ? `Records on body weight (${records.length})` : 'Records on body weight'),
    records.length
      ? records.map((r, i) => h('div', { class: 'rec' },
        h('p', { class: 'rec-head' }, `Record ${i + 1}${r.subgroup ? ' (a subgroup analysis)' : ''}`),
        h('dl', {},
          h('dt', {}, 'First arm'), h('dd', {}, r.first_arm || ''),
          h('dt', {}, 'Second arm'), h('dd', {}, r.second_arm || ''),
          h('dt', {}, 'Outcome'), h('dd', {}, r.outcome || ''),
          h('dt', {}, 'First against second'), h('dd', {}, `${r.direction || 'not stated'}; statistical test: ${String(r.test || 'not read').replace(/_/g, ' ')}`),
          h('dt', {}, 'Numbers'), h('dd', {}, r.numbers || 'none read'),
          h('dt', {}, 'Participants'), h('dd', {}, r.participants ? Number(r.participants).toLocaleString('en-US') : 'not read'),
          h('dt', {}, 'Time of the result'), h('dd', {}, r.weeks ? `${r.weeks} weeks` : 'not read')),
        h('p', { class: 'sentence' }, `“${r.sentence}”`),
        h('p', { class: 'src' }, `Read from PubMed id ${r.pmid} (${r.year}): ${r.title}`)))
      : h('p', { class: 'empty-sheet' }, 'The evidence base holds no passing record on body weight for this trial.'));
}

function radios(name, options, current, onPick) {
  return h('div', { class: 'row' }, options.map(([value, label]) => h('label', { class: 'radio' },
    h('input', { type: 'radio', name, value, checked: current === value, onchange: () => onPick(value) }), label)));
}

function fieldBlock(def, no) {
  const state = work.fields[def.id];
  const block = h('div', { class: 'q', 'data-field': def.id });
  const text = (key, props = {}) => h('input', {
    type: 'text', autocomplete: 'off', maxlength: 200, value: state[key] || '', ...props,
    oninput: (e) => { state[key] = e.target.value; },
  });
  let body;
  if (def.kind === 'text') {
    body = text('value');
  } else if (def.kind === 'number') {
    body = h('div', { class: 'row' }, text('value', { class: 'short', inputmode: 'decimal' }), def.unit ? h('span', { class: 'muted' }, def.unit) : null);
  } else if (def.kind === 'choice') {
    const other = def.id === 'measure' ? text('other', { placeholder: 'Which?', hidden: state.value !== 'other' }) : null;
    body = h('div', {}, radios(`f-${def.id}`, def.options, state.value, (v) => { state.value = v; if (other) other.hidden = v !== 'other'; }), other);
  } else if (def.kind === 'size') {
    const mini = (key, label) => h('label', { class: 'mini' }, label, text(key, { inputmode: 'decimal' }));
    body = h('div', {},
      h('div', { class: 'row' }, mini('drug', 'Drug arm'), mini('placebo', 'Placebo arm')),
      h('div', { class: 'row', style: 'margin-top:8px' }, mini('difference', 'Difference'), mini('low', 'Interval from'), mini('high', 'to')));
  } else {
    const p = text('p', { class: 'short', placeholder: 'for example <0.001', hidden: state.value !== 'p' });
    body = h('div', {}, radios(`f-${def.id}`, TEST_OPTIONS, state.value, (v) => { state.value = v; p.hidden = v !== 'p'; }), p);
  }
  const wrap = h('div', { class: 'q-body' }, body);
  const tick = def.ng === false ? null : h('label', { class: 'ng' },
    h('input', { type: 'checkbox', checked: state.ng, onchange: (e) => { state.ng = e.target.checked; block.classList.toggle('off', state.ng); } }),
    'Not given in my source');
  block.append(
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, `${no}. ${def.title}`), tick),
    def.hint ? h('p', { class: 'q-hint' }, typeof def.hint === 'function' ? def.hint(work.trial.drug) : def.hint) : null,
    wrap);
  if (state.ng) block.classList.add('off');
  return block;
}

function confidenceBlock() {
  const options = [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']];
  return h('div', { class: 'q', 'data-field': 'confidence' },
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, 'How confident are you in this form?')),
    h('p', { class: 'q-hint' }, '1 = not at all, 5 = fully.'),
    radios('f-confidence', options, work.confidence ? String(work.confidence) : '', (v) => { work.confidence = Number(v); }));
}

const filled = (s) => String(s == null ? '' : s).trim() !== '';

/** Ids of the fields that are neither filled nor ticked "not given". */
function missingFields() {
  const f = work.fields;
  const out = [];
  for (const def of FIELDS) {
    const s = f[def.id];
    if (s.ng) continue;
    let ok;
    if (def.kind === 'text' || def.kind === 'number') ok = filled(s.value);
    else if (def.kind === 'choice') ok = filled(s.value) && (s.value !== 'other' || filled(s.other));
    else if (def.kind === 'size') ok = (filled(s.drug) && filled(s.placebo)) || filled(s.difference);
    else ok = filled(s.value) && (s.value !== 'p' || filled(s.p));
    if (!ok) out.push(def.id);
  }
  if (!work.confidence) out.push('confidence');
  return out;
}

function submitTrial(form, err) {
  const missing = missingFields();
  form.querySelectorAll('.q').forEach((q) => q.classList.toggle('missing', missing.includes(q.dataset.field)));
  if (missing.length) {
    err.textContent = 'Please fill every field or tick “Not given in my source” (the fields marked in red).';
    const first = form.querySelector('.q.missing');
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const at = now();
  const t = work.timing;
  if (!document.hidden && t.hidden_since) { t.hidden_ms += at - t.hidden_since; t.hidden_since = null; }
  const { step } = work;
  const answer = {
    reader: Number(session.reader), condition: step.part.condition, part: step.part.part, block: step.part.no || null,
    position: step.ti + 1, trial: work.trial.name,
    fields: work.fields, confidence: work.confidence, note: work.note.trim(),
    timing: {
      started_at: new Date(t.started_at).toISOString(), submitted_at: new Date(at).toISOString(),
      active_ms: activeMs(t, at), paused_ms: t.paused_ms, pauses: t.pauses, hidden_ms: t.hidden_ms, closed_ms: t.closed_ms, reloads: t.reloads,
    },
    opened: work.opened,
  };
  const record = { answer, elapsed_ms: answer.timing.active_ms, client_ts: new Date(at).toISOString(), app_version: APP_VERSION };
  saveRecord(step.part.sheet, step.id, record);
  store.clearDraft(session.code, step.part.sheet, step.id);
  go();
}

/** Test mode only: the trials of this part that have no form yet, from this one on. */
function restOfPart(step) {
  return step.part.items.map((id, ti) => ({ ...step, ti, id, trial: study.trials[id] }))
    .filter((s) => !session.answers.has(`${s.part.sheet}/${s.id}`));
}

/** Test mode only: mark trials as done without a form, so the later screens can be reached quickly. */
function skipInTest(steps) {
  if (!TEST) return;
  closeWork();
  const at = new Date().toISOString();
  for (const s of steps) {
    saveRecord(s.part.sheet, s.id, {
      answer: { skipped_in_test: true, reader: Number(session.reader), condition: s.part.condition, part: s.part.part, block: s.part.no || null, position: s.ti + 1, trial: s.trial.name },
      elapsed_ms: null, client_ts: at, app_version: APP_VERSION,
    });
    store.clearDraft(session.code, s.part.sheet, s.id);
  }
  go();
}

function saveRecord(sheet, itemId, record) {
  store.saveAnswer(session.code, sheet, itemId, record);
  session.answers.set(`${sheet}/${itemId}`, record);
  sync.enqueue({ kind: 'rating', code: session.code, sheet, item_id: itemId, ...record });
}

// ---- survey and finish ----------------------------------------------------------------------------

function showSurvey() {
  setWide(false);
  renderTopbar();
  renderBanners();
  const state = { use: '', missing: '', other: '' };
  const err = h('p', { class: 'form-error', role: 'alert' });
  const area = (key) => h('textarea', { rows: 4, maxlength: 4000, oninput: (e) => { state[key] = e.target.value; } });
  $('main').replaceChildren(h('form', {
    class: 'panel-page survey', novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      if (!state.use) { err.textContent = 'Please answer the first question.'; return; }
      const at = new Date().toISOString();
      saveRecord('survey', 'S1', {
        answer: { reader: Number(session.reader), use: state.use, missing: state.missing.trim(), other: state.other.trim() },
        elapsed_ms: null, client_ts: at, app_version: APP_VERSION,
      });
      go();
    },
  },
  h('p', { class: 'eyebrow' }, 'All trials done'),
  h('h1', {}, 'Three last questions'),
  h('div', { class: 'q' },
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, 'Would you start the data extraction of a review from the evidence base’s records?')),
    radios('s-use', SURVEY_USE, '', (v) => { state.use = v; })),
  h('div', { class: 'q' },
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, 'What was missing from the record sheets, or wrong in them? (optional)')),
    area('missing')),
  h('div', { class: 'q' },
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, 'Anything else we should know? (optional)')),
    area('other')),
  err,
  h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Finish'))));
  window.scrollTo(0, 0);
}

function downloadAnswers() {
  const rows = [...session.answers.entries()].map(([key, r]) => {
    const [sheet, itemId] = key.split('/');
    return { sheet, item_id: itemId, answer: r.answer, elapsed_ms: r.elapsed_ms, client_ts: r.client_ts, app_version: r.app_version };
  });
  const body = JSON.stringify({ code: session.code, name: session.name, email: session.email, reader: Number(session.reader), downloaded_at: new Date().toISOString(), forms: rows }, null, 1);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = h('a', { href: url, download: `reader_study_${session.code}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  downloaded = true;
}

function showFinish() {
  setWide(false);
  renderTopbar();
  renderBanners();
  if (!store.getFinished(session.code)) {
    store.setFinished(session.code, new Date().toISOString());
    sync.enqueue({ kind: 'finish', code: session.code });
  }
  const local = !api.configured();
  $('main').replaceChildren(h('section', { class: 'panel-page finish' },
    h('h1', {}, 'Thank you'),
    h('p', { class: 'lede' }, 'You have finished all the trials of the study.'),
    TEST
      ? h('div', { class: 'warn-box' }, 'Test mode: nothing was sent. The download shows what the study would store for a reader.')
      : local
      ? h('div', { class: 'warn-box' }, 'Your answers are in this browser only. Please download them and send the file to the study team.')
      : h('p', {}, 'Your answers are saved on the server when the dot at the top says Saved. A downloaded copy is a useful backup.'),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: `btn${local ? ' btn-primary' : ''}`, onclick: downloadAnswers }, 'Download my answers')),
    codeLine()));
  window.scrollTo(0, 0);
}

export const _test = { missingFields, activeMs, clockText, normalizeCode };
