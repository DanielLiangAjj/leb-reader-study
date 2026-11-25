// Screens and flow of the page: welcome, the home screen with the three parts, and Part 1 (the timed extraction: the
// introduction of each block, one trial at a time with a clock, and the questions at its end).
// Part 2 (check of an answer key) is in key.js and Part 3 (second reading of 40 items) in second.js.
import { h } from './dom.js';
import * as store from './storage.js';
import * as sync from './sync.js';
import * as api from './api.js';
import { TEST } from './mode.js';
import * as keyPart from './key.js';
import * as secondPart from './second.js';

/** Stored with every answer; bump it whenever the form or the answer format changes. */
// 1.1: the form names the drug of the review question; 1.2: the instructions say that the time is a result and ask for each trial in one go;
// 2.0: three parts on one page (timed extraction, check of an answer key, second reading), and questions on the reader's experience
// 2.1: the form of Part 1 has sixteen fields, and a trial of the evidence base has two steps (the record sheet, then the paper)
export const APP_VERSION = '2.1';
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Rough minutes per trial behind the times on the welcome page. They are guesses, not measurements;
// the practice trials give the first real figures.
const MINUTES = { A: 13, B: 11 };
const COND = {
  A: { name: 'From the paper', short: 'paper', cls: '' },
  B: { name: 'Evidence base first, then the paper', short: 'evidence base, then the paper', cls: ' b' },
};
const DOT = {
  saved: ['Saved', 'All answers are saved on the server.'],
  saving: ['Saving…', 'Saving your latest answers to the server.'],
  offline: ['Offline', 'The server cannot be reached. Your answers are kept in this browser and will be sent automatically when the connection returns.'],
  local: ['This browser only', 'No server is configured: answers are saved in this browser only.'],
};

// The extraction form (protocol, sections 4 and 17): sixteen fields in four groups, the kinds of items a review's data
// collection form asks for. A line with `group` is a heading. `ng` false means the field has no "not given" tick of its own.
const FIELDS = [
  { group: 'The treatments' },
  { id: 'drug_dose', title: 'Drug and dose of the GLP-1 arm', kind: 'text',
    hint: (drug) => `The arm of ${drug}, with its dose and how often it is given. If the trial has several doses of ${drug}, give the highest dose. Every field below is about that arm and the placebo arm.` },
  { id: 'comparator', title: 'Comparator', kind: 'text',
    hint: 'The placebo arm, as the source names it.' },
  { group: 'The trial and its participants' },
  { id: 'n_randomized', title: 'Number of participants randomized', kind: 'arms3',
    hint: 'All arms of the trial together, and each of the two arms you extract.' },
  { id: 'diabetes', title: 'Type 2 diabetes among the participants', kind: 'choice',
    hint: 'As the eligibility criteria or the description of the participants say.',
    options: [['all', 'All had type 2 diabetes'], ['none', 'None (people with diabetes were excluded)'], ['some', 'Some had it']] },
  { id: 'bmi', title: 'Mean body-mass index at baseline', kind: 'number', unit: 'kg/m²',
    hint: 'Of all participants. If the source gives it by arm only, take the arm of the drug.' },
  { id: 'blinding', title: 'Blinding', kind: 'choice',
    hint: 'As the source describes the trial.',
    options: [['double', 'Double-blind'], ['open', 'Open-label or single-blind']] },
  { group: 'Body weight' },
  { id: 'weeks', title: 'Time of the body-weight result', kind: 'number', unit: 'weeks',
    hint: 'Weeks from randomization to the main weight result.' },
  { id: 'measure', title: 'How the weight result is expressed', kind: 'choice',
    hint: 'Take the percent change in body weight when the source gives it; if not, the change in kg; if not, what the source gives. Fields 9 to 13 are about this result.',
    options: [['percent', 'Percent change in body weight'], ['kg', 'Change in kg'], ['threshold', 'Share reaching a weight-loss threshold'], ['other', 'Other']] },
  { id: 'direction', title: 'Direction: body weight with the drug against placebo', kind: 'choice',
    hint: 'As the source reports it. A larger share reaching a weight-loss threshold with the drug counts as lower body weight.',
    options: [['lower', 'Lower with the drug'], ['no_difference', 'No difference'], ['higher', 'Higher with the drug']] },
  { id: 'size', title: 'Size of the effect', kind: 'size',
    hint: 'The value in each arm, or the difference between the arms with its interval. Fill what the source gives, with the sign as printed.' },
  { id: 'spread', title: 'Spread of the value in each arm', kind: 'spread',
    hint: 'The standard deviation, standard error or confidence interval that the source gives with the value of each arm in field 10. A meta-analysis cannot pool the trial without it.' },
  { id: 'n_analysed', title: 'Number of participants analysed for this result', kind: 'pair',
    hint: 'In each arm, as the source gives it for the weight result.' },
  { id: 'test', title: 'Statistical test between the two arms', kind: 'test', ng: false,
    hint: 'For the result of fields 8 to 10.' },
  { id: 'responders', title: 'Participants who lost 5% or more of their body weight', kind: 'pair',
    hint: 'In each arm, as a number or as a percentage, whichever the source gives. Write the % sign with a percentage.' },
  { group: 'Safety' },
  { id: 'ae_stop', title: 'Participants who stopped treatment because of adverse events', kind: 'pair',
    hint: 'In each arm, as a number or as a percentage.' },
  { id: 'sae', title: 'Participants with a serious adverse event', kind: 'pair',
    hint: 'In each arm, as a number or as a percentage.' },
];
const FORM_FIELDS = FIELDS.filter((f) => f.id);
const SPREAD_OPTIONS = [['sd', 'Standard deviation'], ['se', 'Standard error'], ['ci', '95% confidence interval'], ['other', 'Other']];
const TEST_OPTIONS = [['p', 'A P value is given'], ['significant', 'Called significant, no P value'],
  ['not_significant', 'Called not significant, no P value'], ['none', 'No test is given in my source']];
const SURVEY_SOURCE = [['paper', 'The paper'], ['sheet', 'The record sheet'], ['same', 'No difference']];
const SURVEY_WAY = [['paper', 'The paper alone'], ['sheet', 'The record sheet first, then the paper'], ['same', 'No difference']];
const SURVEY_BEFORE = [['none', 'None'], ['few', 'One or two'], ['many', 'Three or more']];
const SURVEY_SPEED = [['much_slower', 'Much slower'], ['slower', 'Somewhat slower'], ['same', 'About the same'], ['faster', 'Somewhat faster'], ['much_faster', 'Much faster']];
const SURVEY_USE = [['yes', 'Yes, as they are'], ['yes_check', 'Yes, and then check them against the papers'], ['no', 'No']];
const SURVEY_WANT = [['never', 'Never'], ['few', 'For a few trials'], ['half', 'For about half'], ['most', 'For most trials']];
// The questions at the end of Part 1 (protocol, sections 16 and 17). The first seven need an answer.
const SURVEY = [
  { id: 'easier', title: 'Which was easier to read: the paper or the record sheet?', options: SURVEY_SOURCE },
  { id: 'tiring', title: 'Over a whole block of trials, which way of working was less tiring?', options: SURVEY_WAY },
  { id: 'sure', title: 'With which way of working were you more sure that your final form was right?', options: SURVEY_WAY },
  { id: 'speed', title: 'Compared with the paper alone, starting from the record sheet felt:', options: SURVEY_SPEED },
  { id: 'changed', title: 'In step 2, how often did the paper make you change a value you had taken from the record sheet?', options: SURVEY_WANT },
  { id: 'use', title: 'For a real review, would you start the data extraction from the evidence base’s records?', options: SURVEY_USE },
  { id: 'before', title: 'Before this study, for how many systematic reviews had you extracted data?', options: SURVEY_BEFORE },
];

let study = null;
let session = null;   // {code, name, email, reader, answers: Map "sheet/item" -> record}
let syncInfo = sync.info();
let work = null;      // the trial on screen: {step, trial, fields, confidence, note, timing, opened, tick}
let bannerSig = '';
let downloaded = false;

const $ = (id) => document.getElementById(id);
const now = () => Date.now();

export function initUI(studyData, keyData, secondData) {
  study = studyData;
  const context = {
    session: () => session, saveRecord, renderTopbar, renderBanners, setWide, showHome,
    mount: (node) => $('main').replaceChildren(node), version: APP_VERSION, test: TEST,
  };
  keyPart.init(context, keyData);
  secondPart.init(context, secondData);
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

/** Part 1: the first trial without a submitted form, then the questions at its end, then nothing. */
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

/** After signing in: a trial whose clock already runs comes first; otherwise the home screen with the three parts. */
function enter() {
  const step = nextStep();
  if (step && !step.survey) {
    const draft = store.loadDraft(session.code, step.part.sheet, step.id);
    if (draft && draft.timing && draft.timing.started_at) { showTrial(step, draft); return; }
  }
  showHome();
}

/** The next screen of Part 1. */
function go() {
  closeWork();
  const step = nextStep();
  if (!step) {
    if (!store.getFinished(session.code)) {   // Part 1 is complete: the server keeps the time (readers.completed_at)
      store.setFinished(session.code, new Date().toISOString());
      sync.enqueue({ kind: 'finish', code: session.code });
    }
    showHome('Part 1 is done. Thank you.');
    return;
  }
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

function renderTopbar({ part = null, label = '', count = '', clock = false, home = false, progress = null } = {}) {
  const top = $('topbar');
  if (!session) { top.hidden = true; top.replaceChildren(); return; }
  // The thin bar under the top bar: the trials of Part 1 by default; Parts 2 and 3 pass their own count; false hides it.
  const done = progress ? progress.done : doneTrials();
  const total = progress ? progress.total : totalTrials();
  const barTitle = progress ? progress.title : `${done} of ${total} trials done, practice included`;
  const copy = h('button', { type: 'button', class: 'btn-link', onclick: () => copyText(copy, session.code, 'Copy') }, 'Copy');
  top.hidden = false;
  top.replaceChildren(...[
    h('div', { class: 'tb-row' },
      h('div', { class: 'tb-left' },
        h('span', { class: 'brand' }, 'Evidence base study'),
        TEST ? h('span', { class: 'tb-sheet' }, 'TEST MODE') : null,
        home ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => showHome() }, 'All three parts') : null,
        label ? h('span', { class: 'tb-sheet' }, label) : null,
        part ? h('span', { class: 'tb-sheet' }, `Part 1: ${partLabel(part).toLowerCase()}`) : null,
        part ? h('span', { class: `cond-tag${COND[part.condition].cls}` }, COND[part.condition].name) : null,
        count ? h('span', { class: 'tb-count' }, count) : null),
      h('div', { class: 'tb-right' },
        clock ? h('span', { class: 'clock', id: 'clock', title: 'Time on this trial. It stops when you submit the form.' }, '0:00') : null,
        clock ? h('button', { type: 'button', class: 'btn btn-small', onclick: pauseNow }, 'Pause') : null,
        h('span', { class: 'code-chip', title: 'Your code is how you continue on another device: choose "Resume with a code" there.' },
          h('span', { class: 'code-label' }, 'Your code'), h('code', { class: 'code' }, session.code), copy),
        statusDot())),
    progress === false ? null : h('div', {
      class: 'progress', role: 'progressbar', 'aria-label': 'Progress in this part', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done,
      title: barTitle,
    }, h('div', { class: 'progress-fill', style: `width:${(total ? (100 * done) / total : 0).toFixed(2)}%` }))].filter(Boolean));
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
  const row = (no, name, what, time) => h('tr', {}, h('td', {}, h('strong', {}, `Part ${no}. `), name), h('td', {}, what), h('td', {}, time));
  $('main').replaceChildren(h('section', { class: 'welcome' },
    h('h1', {}, 'A study of an evidence base of clinical trials'),
    h('p', { class: 'lede' }, 'We built an evidence base automatically from the abstracts of randomized trials: for each trial it holds the groups that were compared, the outcomes, and what the abstract says about each comparison. We ask you, as a clinician, to help us test it. There are three parts.'),
    h('table', { class: 'seq parts' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Part'), h('th', {}, 'What you do'), h('th', {}, 'Rough time'))),
      h('tbody', {},
        row(1, 'Timed extraction', `You fill an extraction form of sixteen fields for ${seq.reduce((n, p) => n + p.items.length, 0)} trials: for half of them from the paper alone, for the other half from the evidence base first and then checked against the paper. The page times each trial.`, minutesText(total)),
        row(2, 'Check of an answer key', `For ${keyPart.total() || 50} abstracts you say whether you agree with each result our answer key lists.`, 'about 3 h for all; a little over 1 h for the first 20'),
        row(3, 'Second reading', `For ${secondPart.total() || 40} items you read a few short texts and choose which of three or four answers fits.`, 'about 1 h'))),
    h('p', {}, 'Part 1 comes first. Parts 2 and 3 show where the evidence base was right and where it was wrong, and that must not change how you work while you are timed. After Part 1 you can do Parts 2 and 3 in either order.'),
    h('p', {}, 'Every part has its own instructions with an example, shown when you open it. You can stop at any point and come back later, on this device or another, with the code the page gives you. Nothing has to be done in one day.'),
    h('p', { class: 'consent' }, 'Your name and email are stored with your answers so we can credit and contact you; nothing else about you is collected.'),
    TEST ? testPanel(reader) : null,
    current && current.code ? continuePanel(current)
      : [reader ? startPanel(reader) : h('div', { class: 'warn-box' }, 'To start, please open the link you were sent: it ends in ?r=1 or ?r=2. If you have already started, resume with your code below.'), resumePanel()]));
}

/** Test mode only: what the mode does, the other reader's order, and a way to start over. */
function testPanel(reader) {
  const other = reader === '2' ? '1' : '2';
  return h('div', { class: 'warn-box' },
    h('p', {}, h('strong', {}, 'Test mode. '), 'This is the page as a reader sees it, with four differences: nothing is sent to the database, ',
      'each block and each trial of Part 1 has a Skip button, Parts 2 and 3 are open without finishing Part 1 and any of their items can be opened, ',
      'and the name and email you type stay in this browser. Times and answers of a test are not part of the study.'),
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
  enter();
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
  enter();
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
    : ['Each trial has two steps, as it would in real work. Step 1: the page shows a record sheet, which is everything the evidence base holds for the trial: its arms, its participants and every result, each with the sentence it was read from. Fill the form from the sheet alone, and tick “Not on the record sheet” for what it does not give. Do not open the paper or any other source in this step.',
      'Step 2: the page then links to the paper. Check each value you took from the sheet against the paper, correct what is wrong, and fill what the sheet did not give, as you would before using the data in a review.',
      'The clock runs through both steps. We look at the two steps apart and together.'];
  return h('ul', { class: 'rule-list' }, [...own, ...common].map((t) => h('li', {}, t)));
}

function showPartIntro(step) {
  setWide(false);
  renderTopbar({ part: step.part, home: true });
  renderBanners();
  const { part } = step;
  const practice = part.part === 'practice';
  $('main').replaceChildren(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, `Part 1, ${partLabel(part).toLowerCase()}`),
    h('h1', {}, COND[part.condition].name),
    h('p', { class: 'lede' }, practice
      ? `Two practice trials, to get used to the form and the source. They are not scored. Allow ${minutesText(part.items.length * MINUTES[part.condition])}.`
      : `${part.items.length} trials. Allow ${minutesText(part.items.length * MINUTES[part.condition])}, and please finish this block in one sitting if you can.`),
    h('div', { class: 'panel' }, h('h2', {}, 'In this part'), rulesFor(part)),
    codeLine(),
    h('details', { class: 'guide' }, h('summary', {}, 'Where you are in Part 1'), sequenceTable(sequence(), { marks: true })),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => showReady(step) }, 'Continue'),
      TEST ? h('button', { type: 'button', class: 'btn', onclick: () => skipInTest(restOfPart(step)) }, 'Skip this whole part (test mode)') : null)));
  window.scrollTo(0, 0);
}

function showReady(step) {
  setWide(false);
  const { part } = step;
  renderTopbar({ part, count: `Trial ${step.ti + 1} of ${part.items.length}`, home: true });
  renderBanners();
  $('main').replaceChildren(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, `Part 1, ${partLabel(part).toLowerCase()}, trial ${step.ti + 1} of ${part.items.length}`),
    h('h1', {}, step.trial.name),
    h('p', { class: 'lede' }, `Body weight with ${step.trial.drug} against placebo. `, part.condition === 'A'
      ? 'You will extract from the paper. The clock starts when you press Start.'
      : 'Step 1: you extract from the evidence base’s record sheet. Step 2: you check with the paper. The clock starts when you press Start and runs through both steps.'),
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
    stage: work.stage, sheetFields: work.sheetFields,
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
  const pair = () => ({ drug: '', placebo: '', ng: false });
  return {
    drug_dose: { value: '', ng: false }, comparator: { value: '', ng: false },
    n_randomized: { value: '', drug: '', placebo: '', ng: false }, diabetes: { value: '', ng: false }, bmi: { value: '', ng: false }, blinding: { value: '', ng: false },
    weeks: { value: '', ng: false }, measure: { value: '', other: '', ng: false }, direction: { value: '', ng: false },
    size: { drug: '', placebo: '', difference: '', low: '', high: '', ng: false }, spread: { stat: '', drug: '', placebo: '', ng: false },
    n_analysed: pair(), test: { value: '', p: '' }, responders: pair(), ae_stop: pair(), sae: pair(),
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
    // 0: from the paper, one step. With the evidence base: 1 = the record sheet alone, 2 = the check with the paper.
    stage: (draft && draft.stage) || (step.part.condition === 'B' ? 1 : 0),
    sheetFields: (draft && draft.sheetFields) || null,   // the form as it stood at the end of step 1
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
  renderTrial();
  persistDraft();
  let ticks = 0;
  work.tick = setInterval(() => { paintClock(); ticks += 1; if (ticks % 5 === 0) persistDraft(); }, 1000); // the draft carries the time last seen
  if (t.pause_started) showPaused();
}

/** Draw the trial on screen from `work`. Called again when a trial of the evidence base moves from step 1 to step 2. */
function renderTrial() {
  const { step } = work;
  const { part } = step;
  renderTopbar({ part, count: `Trial ${step.ti + 1} of ${part.items.length}${work.stage ? `, step ${work.stage} of 2` : ''}`, clock: true });
  renderBanners();
  const last = work.stage !== 1;   // the step that ends with Submit
  const err = h('p', { class: 'form-error', role: 'alert' });
  let no = 0;
  const form = h('form', { class: 'form-pane', novalidate: true, onsubmit: (event) => { event.preventDefault(); if (last) submitTrial(form, err); else finishSheetStep(form, err); } },
    h('h2', { class: 'pane-title' }, `Extraction form: ${work.trial.name}`),
    h('p', { class: 'ask' }, 'Extract for: ', h('strong', {}, work.trial.drug), ' against placebo.'),
    work.stage === 1 ? h('p', { class: 'step-note' }, h('strong', {}, 'Step 1 of 2: the record sheet alone. '), 'Fill what the sheet gives. Tick “Not on the record sheet” for the rest. The paper comes in step 2.') : null,
    work.stage === 2 ? h('p', { class: 'step-note' }, h('strong', {}, 'Step 2 of 2: check with the paper. '), 'Open the paper. Check each value you took from the sheet, correct what is wrong, and fill the fields the sheet did not give. The clock is still running.') : null,
    FIELDS.map((def) => (def.group ? h('h3', { class: 'form-group' }, def.group) : fieldBlock(def, ++no))),
    last ? confidenceBlock() : null,
    last ? h('div', { class: 'q' },
      h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, 'Anything to note about this trial (optional)')),
      h('textarea', { rows: 2, maxlength: 1000, oninput: (e) => { work.note = e.target.value; } }, work.note)) : null,
    err,
    h('div', { class: 'submit-row' },
      h('button', { type: 'submit', class: 'btn btn-primary' }, last ? 'Submit this trial' : 'Done with the sheet: go to step 2'),
      TEST ? h('button', { type: 'button', class: 'btn', onclick: () => skipInTest([work.step]) }, 'Skip (test mode)') : null,
      h('span', { class: 'muted' }, last ? 'Submitting stops the clock. A submitted form cannot be reopened.' : 'The clock keeps running. You cannot come back to step 1.')));
  form.addEventListener('input', () => persistDraft());
  form.addEventListener('change', () => persistDraft());
  $('main').replaceChildren(h('section', { class: 'work' }, sourcePane(part.condition), form));
  window.scrollTo(0, 0);
  paintClock();
}

/** End of step 1 of a trial of the evidence base: keep the form as it stands, then open the paper. */
function finishSheetStep(form, err) {
  const missing = missingFields(false);
  form.querySelectorAll('.q').forEach((q) => q.classList.toggle('missing', missing.includes(q.dataset.field)));
  if (missing.length) {
    err.textContent = 'Please fill every field the sheet gives and tick “Not on the record sheet” for the others (the fields marked in red).';
    const first = form.querySelector('.q.missing');
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const t = work.timing;
  work.sheetFields = JSON.parse(JSON.stringify(work.fields));
  t.stage1_ms = activeMs(t);
  for (const def of FORM_FIELDS) {   // what the sheet did not give is asked again, now of the paper
    const s = work.fields[def.id];
    if (s.ng) s.ng = false;
    if (def.kind === 'test' && s.value === 'none') s.value = '';
  }
  work.stage = 2;
  persistDraft();
  renderTrial();
}

function frozenDate() {
  const d = new Date(`${study.frozen}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? study.frozen : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function paperBlock() {
  const p = work.trial.paper;
  const open = (what, href, label) => h('a', {
    class: 'btn', href, target: '_blank', rel: 'noopener',
    onclick: () => { work.opened.push({ what, at_ms: activeMs(work.timing) }); persistDraft(); },
  }, label);
  return [
    h('p', { class: 'paper-title' }, p.title || work.trial.name),
    h('p', { class: 'paper-meta' }, [p.journal, p.year, `PubMed id ${p.pmid}`].filter(Boolean).join(', ')),
    h('div', { class: 'paper-links' },
      p.pmc ? open('pmc', `https://pmc.ncbi.nlm.nih.gov/articles/${p.pmc}/`, 'Open the free full text') : null,
      open('pubmed', `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`, p.pmc ? 'Open in PubMed' : 'Open in PubMed (link to the full text is on that page)')),
    h('p', { class: 'muted' }, 'The paper opens in a new tab; this page keeps your form. Use the full text, with its tables. If the journal asks you to sign in, use the library’s access.'),
  ];
}

function recordCard(r, i) {
  return h('div', { class: 'rec' },
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
    h('p', { class: 'src' }, `Read from PubMed id ${r.pmid} (${r.year}): ${r.title}`));
}

/** Everything the evidence base holds for the trial: main report, arms, participants, and its records in three groups. */
function sheetBlock() {
  const { arms, populations, records } = work.trial.sheet;
  const p = work.trial.paper;
  const of = (g) => records.filter((r) => (r.group || 'weight') === g);
  const weight = of('weight');
  const fold = (title, list, open) => (list.length
    ? h('details', { class: 'rec-group', open }, h('summary', {}, `${title} (${list.length})`), list.map(recordCard)) : null);
  const n = (x) => (x.n ? ` (n = ${Number(x.n).toLocaleString('en-US')})` : '');
  return [
    h('p', { class: 'muted' }, `The evidence base as frozen on ${frozenDate()}. It was read from abstracts.`),
    h('h3', {}, 'Main report'),
    h('p', { class: 'sheet-line' }, [p.title, [p.journal, p.year].filter(Boolean).join(', ')].filter(Boolean).join(' ')),
    h('h3', {}, 'Arms the evidence base lists for the main report'),
    arms && arms.length
      ? h('ul', { class: 'arms' }, arms.map((a) => h('li', {}, a.name + n(a))))
      : h('p', { class: 'empty-sheet' }, 'The evidence base holds no arm list for the main report of this trial.'),
    populations && populations.length ? h('h3', {}, 'Participants it lists') : null,
    populations && populations.length ? h('ul', { class: 'arms' }, populations.map((q) => h('li', {}, q.name + n(q) + (q.overall ? '' : ' (a subgroup)')))) : null,
    h('h3', {}, weight.length ? `Results on body weight (${weight.length})` : 'Results on body weight'),
    weight.length ? weight.map(recordCard) : h('p', { class: 'empty-sheet' }, 'The evidence base holds no passing record on body weight for this trial.'),
    fold('Results on adverse events and stopping treatment', of('safety'), true),
    fold('Other results the evidence base holds for this trial', of('other'), false),
  ];
}

function sourcePane(condition) {
  if (condition === 'A') {
    return h('aside', { class: 'source-pane' },
      h('h2', { class: 'pane-title' }, 'Your source: the paper'),
      paperBlock(),
      h('p', { class: 'muted' }, 'Do not open the evidence base, its record sheets or any summary of this trial.'));
  }
  if (work.stage === 1) {
    return h('aside', { class: 'source-pane' },
      h('h2', { class: 'pane-title' }, 'Step 1. Your source: the record sheet of the evidence base'),
      h('p', { class: 'muted' }, 'In this step use the sheet only. Do not open the paper or PubMed yet.'),
      sheetBlock());
  }
  return h('aside', { class: 'source-pane' },
    h('h2', { class: 'pane-title' }, 'Step 2. Check with the paper'),
    paperBlock(),
    h('h2', { class: 'pane-title', style: 'margin-top:18px' }, 'The record sheet, for reference'),
    sheetBlock());
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
  const mini = (key, label) => h('label', { class: 'mini' }, label, text(key, { inputmode: 'decimal' }));
  let body;
  if (def.kind === 'text') {
    body = text('value');
  } else if (def.kind === 'number') {
    body = h('div', { class: 'row' }, text('value', { class: 'short', inputmode: 'decimal' }), def.unit ? h('span', { class: 'muted' }, def.unit) : null);
  } else if (def.kind === 'choice') {
    const other = def.id === 'measure' ? text('other', { placeholder: 'Which?', hidden: state.value !== 'other' }) : null;
    body = h('div', {}, radios(`f-${def.id}`, def.options, state.value, (v) => { state.value = v; if (other) other.hidden = v !== 'other'; }), other);
  } else if (def.kind === 'size') {
    body = h('div', {},
      h('div', { class: 'row' }, mini('drug', 'Drug arm'), mini('placebo', 'Placebo arm')),
      h('div', { class: 'row', style: 'margin-top:8px' }, mini('difference', 'Difference'), mini('low', 'Interval from'), mini('high', 'to')));
  } else if (def.kind === 'arms3') {
    body = h('div', { class: 'row' }, mini('value', 'All arms together'), mini('drug', 'Drug arm'), mini('placebo', 'Placebo arm'));
  } else if (def.kind === 'pair') {
    body = h('div', { class: 'row' }, mini('drug', 'Drug arm'), mini('placebo', 'Placebo arm'));
  } else if (def.kind === 'spread') {
    body = h('div', {},
      radios(`f-${def.id}`, SPREAD_OPTIONS, state.stat, (v) => { state.stat = v; }),
      h('div', { class: 'row', style: 'margin-top:8px' }, mini('drug', 'Drug arm'), mini('placebo', 'Placebo arm')));
  } else {
    const p = text('p', { class: 'short', placeholder: 'for example <0.001', hidden: state.value !== 'p' });
    body = h('div', {}, radios(`f-${def.id}`, TEST_OPTIONS, state.value, (v) => { state.value = v; p.hidden = v !== 'p'; }), p);
  }
  const wrap = h('div', { class: 'q-body' }, body);
  const tickLabel = work.stage === 1 ? 'Not on the record sheet' : (work.stage === 2 ? 'Not given in the paper' : 'Not given in my source');
  const tick = def.ng === false ? null : h('label', { class: 'ng' },
    h('input', { type: 'checkbox', checked: state.ng, onchange: (e) => { state.ng = e.target.checked; block.classList.toggle('off', state.ng); } }),
    tickLabel);
  // Step 2: say for each field whether its value came from the sheet (check it) or still has to be found in the paper.
  let origin = null;
  if (work.stage === 2 && work.sheetFields && work.sheetFields[def.id]) {
    const was = work.sheetFields[def.id];
    const given = def.kind === 'test' ? (was.value && was.value !== 'none') : !was.ng;
    origin = h('p', { class: `origin ${given ? 'from-sheet' : 'from-paper'}` }, given ? 'From the sheet. Check it against the paper.' : 'Not on the sheet. Look in the paper.');
  }
  block.append(...[
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, `${no}. ${def.title}`), tick),
    origin,
    def.hint ? h('p', { class: 'q-hint' }, typeof def.hint === 'function' ? def.hint(work.trial.drug) : def.hint) : null,
    wrap].filter(Boolean));
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

/** Ids of the fields that are neither filled nor ticked "not given"; the confidence question counts in the last step. */
function missingFields(withConfidence = true) {
  const f = work.fields;
  const out = [];
  for (const def of FORM_FIELDS) {
    const s = f[def.id];
    if (s.ng) continue;
    let ok;
    if (def.kind === 'text' || def.kind === 'number') ok = filled(s.value);
    else if (def.kind === 'choice') ok = filled(s.value) && (s.value !== 'other' || filled(s.other));
    else if (def.kind === 'size') ok = (filled(s.drug) && filled(s.placebo)) || filled(s.difference);
    else if (def.kind === 'arms3') ok = filled(s.value) || filled(s.drug) || filled(s.placebo);
    else if (def.kind === 'pair') ok = filled(s.drug) || filled(s.placebo);
    else if (def.kind === 'spread') ok = filled(s.stat) && (filled(s.drug) || filled(s.placebo));
    else ok = filled(s.value) && (s.value !== 'p' || filled(s.p));
    if (!ok) out.push(def.id);
  }
  if (withConfidence && !work.confidence) out.push('confidence');
  return out;
}

function submitTrial(form, err) {
  const missing = missingFields();
  form.querySelectorAll('.q').forEach((q) => q.classList.toggle('missing', missing.includes(q.dataset.field)));
  if (missing.length) {
    err.textContent = work.stage === 2 ? 'Please fill every field or tick “Not given in the paper” (the fields marked in red).'
      : 'Please fill every field or tick “Not given in my source” (the fields marked in red).';
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
    // A trial of the evidence base: the form as it stood after step 1 (the record sheet alone) and the time of that step.
    steps: work.stage === 2 ? 2 : 1,
    sheet_step: work.stage === 2 ? { fields: work.sheetFields, active_ms: t.stage1_ms == null ? null : t.stage1_ms } : null,
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

// ---- the questions at the end of Part 1 ----------------------------------------------------------

function showSurvey() {
  setWide(false);
  renderTopbar({ label: 'Part 1: last questions', home: true });
  renderBanners();
  const state = { missing: '', other: '' };
  const err = h('p', { class: 'form-error', role: 'alert' });
  const area = (key) => h('textarea', { rows: 4, maxlength: 4000, oninput: (e) => { state[key] = e.target.value; } });
  const blocks = SURVEY.map((q, i) => h('div', { class: 'q', 'data-field': q.id },
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, `${i + 1}. ${q.title}`)),
    radios(`s-${q.id}`, q.options, '', (v) => { state[q.id] = v; })));
  const form = h('form', {
    class: 'panel-page survey', novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      const open = SURVEY.filter((q) => !state[q.id]).map((q) => q.id);
      blocks.forEach((b) => b.classList.toggle('missing', open.includes(b.dataset.field)));
      if (open.length) {
        err.textContent = 'Please answer questions 1 to 7 (the ones marked in red).';
        const first = form.querySelector('.q.missing');
        if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const at = new Date().toISOString();
      const answer = { reader: Number(session.reader), questions: 3, missing: state.missing.trim(), other: state.other.trim() };
      for (const q of SURVEY) answer[q.id] = state[q.id];
      saveRecord('survey', 'S1', { answer, elapsed_ms: null, client_ts: at, app_version: APP_VERSION });
      go();
    },
  },
  h('p', { class: 'eyebrow' }, 'Part 1: all trials done'),
  h('h1', {}, 'Nine last questions'),
  h('p', { class: 'lede' }, 'About three minutes. They ask how the two ways of working felt. There is no right answer: we want your opinion as it is, also where it does not favour the evidence base.'),
  h('p', { class: 'muted' }, '“The record sheet” is what the evidence base showed you in step 1.'),
  blocks,
  h('div', { class: 'q' },
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, '8. What was missing from the record sheets, or wrong in them? (optional)')),
    area('missing')),
  h('div', { class: 'q' },
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, '9. What would make the record sheets more useful to you? Anything else we should know? (optional)')),
    area('other')),
  err,
  h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Finish Part 1')));
  $('main').replaceChildren(form);
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

// ---- Part 1: its introduction ------------------------------------------------------------------------

function showPart1Intro() {
  setWide(false);
  renderTopbar({ label: 'Part 1: timed extraction', home: true });
  renderBanners();
  const seq = sequence();
  const total = seq.reduce((n, p) => n + p.items.length * MINUTES[p.condition], 0);
  $('main').replaceChildren(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, 'Part 1 of 3'),
    h('h1', {}, 'Timed extraction'),
    h('p', { class: 'lede' }, 'Does the evidence base save a reviewer time, and does it change how right the extracted data are? You fill the same extraction form for a set of trials in two ways of working: from the paper alone, and from the evidence base first with the paper as a check.'),
    h('div', { class: 'panel' },
      h('h2', {}, 'The task'),
      h('p', {}, 'The question is the one of a systematic review: in adults with overweight or obesity, how does a GLP-1 receptor agonist compare with placebo? For each trial you fill sixteen fields, the kinds of items a review’s data collection form asks for:'),
      h('ul', { class: 'rule-list' },
        h('li', {}, h('strong', {}, 'The treatments: '), 'drug and dose, comparator.'),
        h('li', {}, h('strong', {}, 'The trial and its participants: '), 'number randomized, type 2 diabetes, mean body-mass index, blinding.'),
        h('li', {}, h('strong', {}, 'Body weight: '), 'time of the result, how it is expressed, direction, size, spread, number analysed, statistical test, and how many lost 5% or more.'),
        h('li', {}, h('strong', {}, 'Safety: '), 'how many stopped treatment because of adverse events, and how many had a serious adverse event.')),
      h('p', {}, 'Any field can be answered “Not given in my source”. That is an answer, not a failure: no paper reports everything.')),
    h('div', { class: 'panel' },
      h('h2', {}, 'The two ways of working'),
      h('ul', { class: 'rule-list' },
        h('li', {}, h('strong', {}, 'From the paper. '), 'The page links to the main report of the trial. You extract from its full text, as a reviewer does today.'),
        h('li', {}, h('strong', {}, 'Evidence base first, then the paper. '), 'Step 1: the page shows what the evidence base holds for the trial, and you fill what it gives. Step 2: the page links to the paper; you check what you took from the evidence base and fill the rest. This is how such a tool would be used in a real review: as a first pass that a person then checks.')),
      h('p', {}, 'You never see the same trial twice. Each trial is done one way by you and the other way by the second reader, so the two ways are compared on the same trials without anyone working from memory.')),
    h('div', { class: 'panel' },
      h('h2', {}, 'The time is a result'),
      h('p', {}, 'The page times each trial from Start to Submit. That time is one of the two results of this part; the other is whether the fields are right. So please do each trial in one go: press Start only when you can work undisturbed for about fifteen minutes, and press Pause if you are interrupted.'),
      h('p', {}, 'Work at your normal pace, as you would for a real review, and do not hurry; this is a test of the two ways of working, not of you. You can stop between trials and come back; please finish a block in one sitting if you can.')),
    h('div', { class: 'panel' },
      h('h2', {}, 'The order of work'),
      sequenceTable(seq, { marks: true }),
      h('p', { class: 'muted' }, `In all ${minutesText(total)}, over as many sittings as you like. The times are rough guesses. After the last block there are nine short questions about how the two ways of working felt.`)),
    codeLine(),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: go }, doneTrials() ? 'Continue' : 'Go to the practice trials'),
      h('button', { type: 'button', class: 'btn', onclick: () => showHome() }, 'Back to the three parts'))));
  window.scrollTo(0, 0);
}

// ---- the home screen: the three parts ---------------------------------------------------------------

function partCard({ no, title, state, tone, what, time, actions, note }) {
  return h('div', { class: `part-card${tone ? ` ${tone}` : ''}` },
    h('div', { class: 'part-head' },
      h('span', { class: 'part-no' }, `Part ${no}`),
      h('h2', {}, title),
      h('span', { class: 'part-state' }, state)),
    h('p', {}, what),
    h('p', { class: 'muted' }, time),
    note ? h('p', { class: 'part-note' }, note) : null,
    actions && actions.length ? h('div', { class: 'actions' }, actions) : null);
}

function showHome(flash = '') {
  closeWork();
  setWide(false);
  renderTopbar({ progress: false });
  renderBanners();
  const step = nextStep();
  const part1Done = !step;
  const trials = doneTrials();
  const trialsAll = totalTrials();
  const open23 = part1Done || TEST;
  const locked = 'Opens when Part 1 is done, so that what you see here cannot change how you work while you are timed.';
  const kDone = keyPart.done();
  const kAll = keyPart.total();
  const sDone = secondPart.done();
  const sAll = secondPart.total();
  const allDone = part1Done && kDone === kAll && sDone === sAll;
  const local = !api.configured();
  const btn = (label, onclick, primary) => h('button', { type: 'button', class: `btn${primary ? ' btn-primary' : ''}`, onclick }, label);
  const seq = sequence();
  const minutes = seq.reduce((n, p) => n + p.items.length * MINUTES[p.condition], 0);
  const next = part1Done ? (kDone < kAll ? 2 : (sDone < sAll ? 3 : 0)) : 1;   // the part the page suggests now

  $('main').replaceChildren(h('section', { class: 'home' },
    flash ? h('p', { class: 'note-done' }, flash) : null,
    h('h1', {}, allDone ? 'Thank you' : `Welcome, ${session.name}`),
    h('p', { class: 'lede' }, allDone ? 'You have finished all three parts.'
      : 'Three parts. Part 1 comes first; Parts 2 and 3 can then be done in either order. Stop whenever you like and come back with your code.'),
    partCard({
      no: 1, title: 'Timed extraction', tone: part1Done ? 'done' : 'now',
      state: part1Done ? 'Done' : (step.survey ? 'All trials done, nine questions left' : (trials ? `${trials} of ${trialsAll} trials done` : 'Not started')),
      what: `An extraction form of sixteen fields for ${trialsAll} trials (4 of them practice): for half from the paper alone, for half from the evidence base first and then the paper. The page times each trial.`,
      time: `${minutesText(minutes)[0].toUpperCase()}${minutesText(minutes).slice(1)}, over as many sittings as you like.`,
      actions: part1Done ? [] : [
        btn(step.survey ? 'Answer the nine questions' : (trials ? 'Continue Part 1' : 'Start Part 1'), () => (trials || step.survey ? go() : showPart1Intro()), next === 1),
        trials && !step.survey ? btn('Read the instructions of Part 1 again', showPart1Intro, false) : null],
    }),
    partCard({
      no: 2, title: 'Check of an answer key', tone: !open23 ? 'locked' : (kAll && kDone === kAll ? 'done' : (next === 2 ? 'now' : '')),
      state: !keyPart.available() ? 'Could not be loaded' : (kDone === kAll ? 'Done' : (kDone ? `${kDone} of ${kAll} abstracts done` : 'Not started')),
      what: `For ${kAll || 50} abstracts of trial reports, you say whether you agree with each result our answer key lists: Yes, No or Cannot decide.`,
      time: 'About 3 hours for all 50; a little over 1 hour for the first 20. No clock.',
      note: !open23 ? locked : (TEST && !part1Done ? 'Test mode: open without Part 1.' : ''),
      actions: [h('button', { type: 'button', class: `btn${next === 2 ? ' btn-primary' : ''}`, disabled: !open23 || !keyPart.available(), onclick: keyPart.open },
        kDone === kAll && kAll ? 'Open Part 2 again' : (kDone ? 'Continue Part 2' : 'Start Part 2'))],
    }),
    partCard({
      no: 3, title: 'Second reading of 40 items', tone: !open23 ? 'locked' : (sAll && sDone === sAll ? 'done' : (next === 3 ? 'now' : '')),
      state: !secondPart.available() ? 'Could not be loaded' : (sDone === sAll ? 'Done' : (sDone ? `${sDone} of ${sAll} items done` : 'Not started')),
      what: `For ${sAll || 40} items, in four sets of ten, you read a few short texts and choose which of three or four answers fits.`,
      time: 'About 1 hour. No clock.',
      note: !open23 ? locked : (TEST && !part1Done ? 'Test mode: open without Part 1.' : ''),
      actions: [h('button', { type: 'button', class: `btn${next === 3 ? ' btn-primary' : ''}`, disabled: !open23 || !secondPart.available(), onclick: secondPart.open },
        sDone === sAll && sAll ? 'Open Part 3 again' : (sDone ? 'Continue Part 3' : 'Start Part 3'))],
    }),
    codeLine(),
    TEST ? h('div', { class: 'warn-box' }, 'Test mode: nothing is sent. The download shows what the study would store for a reader.')
      : local ? h('div', { class: 'warn-box' }, 'Your answers are in this browser only. Please download them and send the file to the study team.')
      : h('p', { class: 'muted' }, 'Your answers are saved on the server when the dot at the top says Saved. A downloaded copy is a useful backup.'),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: `btn${local && allDone ? ' btn-primary' : ''}`, onclick: downloadAnswers }, 'Download my answers'))));
  window.scrollTo(0, 0);
}

export const _test = { missingFields, activeMs, clockText, normalizeCode };
