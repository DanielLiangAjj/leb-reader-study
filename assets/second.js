// Part 3: a second reading of 40 items. Four sets of ten; in each the reviewer reads the texts of an item and chooses
// one of the set's answers. Our own first reading is not shown (and is not in data/second.json): the reading is blind.
// Stored as one form per item: sheet 'survey', item H01 ... H40.
import { h } from './dom.js';
import * as store from './storage.js';

const SHEET = 'survey';
const CANNOT = 'cannot tell';
let ui = null;
let data = null;    // data/second.json
let flat = [];      // [{set, it, pos}] in the fixed order

export function init(context, secondData) {
  ui = context;
  data = secondData;
  flat = data && data.sets ? data.sets.flatMap((set) => set.items.map((it, i) => ({ set, it, pos: i + 1 }))) : [];
}
export const available = () => flat.length > 0;
export const total = () => flat.length;
const isDone = (x) => ui.session().answers.has(`${SHEET}/${x.it.id}`);
export const done = () => flat.filter(isDone).length;
const nextOpen = () => flat.find((x) => !isDone(x)) || null;
const seen = (id) => Boolean(store.loadDraft(ui.session().code, SHEET, id));
const markSeen = (id) => store.saveDraft(ui.session().code, SHEET, id, { seen: new Date().toISOString() });

function bar(count) {
  ui.renderTopbar({ label: 'Part 3: second reading', count, home: true, progress: { done: done(), total: total(), title: `${done()} of ${total()} items done` } });
  ui.renderBanners();
}

export function open() {
  if (!available()) { ui.showHome(); return; }
  if (!done() && !seen('H-intro')) { showIntro(); return; }
  showList();
}

/** The item, after the introduction of its set when the reviewer has not seen that yet. */
function goTo(x) {
  if (!seen(`H-set${x.set.no}`)) showSetIntro(x.set, x); else showItem(x);
}

function showIntro() {
  ui.setWide(false);
  bar('');
  ui.mount(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, 'Part 3 of 3'),
    h('h1', {}, 'A second reading of 40 items'),
    h('p', { class: 'lede' }, 'Several figures in our report rest on small samples that one person in the project read item by item. Each of those calls is a judgement about what a trial report says, so it needs a second reader. You are that reader.'),
    h('div', { class: 'panel' },
      h('h2', {}, 'What you do'),
      h('ol', { class: 'rule-list' },
        h('li', {}, 'The 40 items come in four sets of ten. Each set asks one question and has three or four answers; a page before each set explains them and shows a worked example.'),
        h('li', {}, 'For each item, read the texts shown and choose the answer that fits. If no answer can be chosen from the texts, a link opens the paper; if that does not settle it either, choose “cannot tell” and say why.'),
        h('li', {}, 'Press “Save and go to the next item”. You can reopen an item you have done and change it.')),
      h('p', {}, 'We do not show you our own answer, so that your reading is independent of ours. There is no right answer to guess: where you and the first reader differ, that is a result too.'),
      h('p', {}, 'Please do not compare answers with your colleague until you are both done.')),
    h('div', { class: 'panel' },
      h('h2', {}, 'The four sets'),
      h('table', { class: 'seq' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Set'), h('th', {}, 'The question'), h('th', {}, 'Items'))),
        h('tbody', {}, data.sets.map((set) => h('tr', {}, h('td', {}, `${set.no}. ${set.title}`), h('td', {}, set.question), h('td', {}, String(set.items.length)))))),
      h('p', { class: 'muted' }, 'In all about one hour. There is no clock in this part, and you can stop after any item and come back with your code.')),
    h('div', { class: 'actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary',
        onclick: () => { markSeen('H-intro'); const x = nextOpen(); if (x) goTo(x); else showList(); },
      }, done() ? 'Continue' : 'Start with set 1'),
      h('button', { type: 'button', class: 'btn', onclick: ui.showHome }, 'Back to the three parts'))));
  window.scrollTo(0, 0);
}

function answersList(set) {
  return h('dl', { class: 'answers' }, set.answers.flatMap((a) => [h('dt', {}, a.label), h('dd', {}, a.meaning)]));
}

function texts(set, it) {
  return h('div', { class: 'cells' }, set.columns.map((name, i) => h('div', { class: 'cell' },
    h('p', { class: 'cell-head' }, name),
    h('p', { class: 'cell-text' }, it.cells[i] || ''))));
}

function showSetIntro(set, x) {
  ui.setWide(false);
  bar(`Set ${set.no} of ${data.sets.length}`);
  const ex = set.example;
  ui.mount(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, `Part 3, set ${set.no} of ${data.sets.length}`),
    h('h1', {}, set.title),
    h('p', { class: 'lede' }, set.context),
    h('div', { class: 'panel' },
      h('h2', {}, 'The question of this set'),
      h('p', { class: 'ask' }, set.question),
      h('h3', {}, 'The answers'),
      answersList(set),
      h('h3', {}, 'What you see for each item'),
      h('ol', { class: 'rule-list' }, set.columns.map((c) => h('li', {}, c))),
      h('p', { class: 'muted' }, '“First against second” in a record means the first group named against the second: “lower” says the outcome is lower in the first group.')),
    h('div', { class: 'panel' },
      h('h2', {}, 'A worked example'),
      h('p', { class: 'muted' }, 'This item is not one of the ten you will read.'),
      texts(set, ex),
      ex.extra ? h('p', { class: 'cell-extra' }, ex.extra) : null,
      h('p', { class: 'example-answer' }, 'The first reader’s answer: ', h('strong', {}, ex.answer), '.'),
      ex.why ? h('p', {}, 'Why: ', ex.why) : null),
    h('div', { class: 'actions' },
      x ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { markSeen(`H-set${set.no}`); showItem(x); } }, `Go to item ${x.pos} of this set`) : null,
      h('button', { type: 'button', class: 'btn', onclick: showList }, 'Back to the list'))));
  window.scrollTo(0, 0);
}

function showList() {
  ui.setWide(false);
  bar(`${done()} of ${total()} items done`);
  const next = nextOpen();
  ui.mount(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, 'Part 3 of 3'),
    h('h1', {}, 'A second reading of 40 items'),
    h('p', { class: 'lede' }, done() === total() ? 'All 40 items are done. Thank you. You can still reopen one and change it.'
      : `${done()} of ${total()} items done. Stop whenever you like: what you have saved counts.`),
    h('div', { class: 'actions' },
      next ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goTo(next) }, `${done() ? 'Continue' : 'Start'} with set ${next.set.no}, item ${next.pos}`) : null,
      h('button', { type: 'button', class: 'btn', onclick: showIntro }, 'Read the instructions again'),
      h('button', { type: 'button', class: 'btn', onclick: ui.showHome }, 'Back to the three parts')),
    data.sets.map((set) => h('div', { class: 'panel' },
      h('h2', {}, `Set ${set.no}. ${set.title}`),
      h('p', { class: 'muted' }, set.question, ' ', h('button', { type: 'button', class: 'btn-link', onclick: () => showSetIntro(set, flat.find((x) => x.set === set && !isDone(x)) || null) }, 'Answers and example')),
      h('div', { class: 'chips' }, flat.filter((x) => x.set === set).map((x) => {
        const finished = isDone(x);
        const can = finished || x === next || ui.test;
        return h('button', {
          type: 'button', class: `chip${finished ? ' done' : ''}${x === next ? ' now' : ''}`, disabled: !can,
          title: finished ? 'Done. Open again' : (can ? 'Open' : 'Later'), onclick: () => (finished ? showItem(x) : goTo(x)),
        }, `${x.pos}${finished ? ' ✓' : ''}`);
      }))))));
  window.scrollTo(0, 0);
}

function showItem(x) {
  const { set, it } = x;
  ui.setWide(true);
  bar(`Set ${set.no}, item ${x.pos} of ${set.items.length}`);
  const code = ui.session().code;
  const saved = ui.session().answers.get(`${SHEET}/${it.id}`);
  const draft = store.loadDraft(code, SHEET, it.id);
  const old = (draft && draft.state) || (saved && saved.answer) || {};
  const state = { choice: old.choice || '', comment: old.comment || '', opened_paper: Boolean(old.opened_paper) };
  const opened = Date.now();
  const before = (draft && draft.ms) || 0;
  const keep = () => store.saveDraft(code, SHEET, it.id, { state, ms: before + (Date.now() - opened) });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const options = set.answers.map((a, i) => h('label', { class: 'answer' },
    h('input', { type: 'radio', name: 'second-answer', value: a.label, checked: state.choice === a.label, onchange: () => { state.choice = a.label; keep(); } }),
    h('span', {}, h('span', { class: 'answer-label' }, a.label), h('span', { class: 'answer-meaning' }, a.meaning)),
    h('span', { class: 'sr-only' }, ` (answer ${i + 1})`)));
  const form = h('form', {
    class: 'panel-page item-form', novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      if (!state.choice) { err.textContent = 'Please choose an answer.'; return; }
      if (state.choice === CANNOT && !state.comment.trim()) { err.textContent = 'With “cannot tell”, please write what is unclear.'; return; }
      const at = new Date();
      ui.saveRecord(SHEET, it.id, {
        answer: { task: 'second', reader: Number(ui.session().reader), set: set.no, sample: set.name, item: it.item, choice: state.choice,
          comment: state.comment.trim(), opened_paper: state.opened_paper, version: data.version, changed: Boolean(saved) },
        elapsed_ms: before + (Date.now() - opened), client_ts: at.toISOString(), app_version: ui.version,
      });
      store.clearDraft(code, SHEET, it.id);
      const next = nextOpen();
      if (next && !saved) goTo(next); else showList();
    },
  },
  h('p', { class: 'eyebrow' }, `Set ${set.no} of ${data.sets.length}: ${set.title}. Item ${x.pos} of ${set.items.length}`),
  h('p', { class: 'ask' }, set.question),
  texts(set, it),
  it.extra ? h('p', { class: 'cell-extra' }, it.extra) : null,
  it.link ? h('p', { class: 'muted' }, 'Only if the texts above do not settle it: ',
    h('a', { href: it.link.href, target: '_blank', rel: 'noopener', onclick: () => { state.opened_paper = true; keep(); } }, `open the paper (${it.link.label})`), '. It opens in a new tab.') : null,
  h('h2', { class: 'item-q' }, 'Your answer'),
  h('div', { class: 'answer-list' }, options),
  h('div', { class: 'q' },
    h('div', { class: 'q-head' }, h('span', { class: 'q-title' }, 'Comment (needed with “cannot tell”, welcome otherwise)')),
    h('textarea', { rows: 2, maxlength: 1000, oninput: (e) => { state.comment = e.target.value; keep(); } }, state.comment)),
  err,
  h('div', { class: 'submit-row' },
    h('button', { type: 'submit', class: 'btn btn-primary' }, saved ? 'Save my change' : 'Save and go to the next item'),
    h('button', { type: 'button', class: 'btn', onclick: () => { keep(); showList(); } }, 'Stop here'),
    h('button', { type: 'button', class: 'btn-link', onclick: () => { keep(); showSetIntro(set, x); } }, 'Show the example of this set again')));
  ui.mount(form);
  window.scrollTo(0, 0);
}
