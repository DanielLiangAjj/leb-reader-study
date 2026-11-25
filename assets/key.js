// Part 2: the check of an answer key. Fifty trial abstracts, each with the rows of the key (the trial, one row per
// finding, one row for anything missing). The reviewer answers Yes, No or Cannot decide on every row.
// Stored as one form per abstract: sheet 'survey', item K01 ... K50 (the database accepts the sheets practice, scored and survey).
import { h } from './dom.js';
import * as store from './storage.js';

const SHEET = 'survey';
const CHOICES = [['agree', 'Yes'], ['disagree', 'No'], ['unsure', 'Cannot decide']];
const COMMENT_MAX = 600;
let ui = null;      // what views.js hands over: session, saveRecord, renderTopbar, renderBanners, setWide, showHome, mount, version, test
let data = null;    // data/key.json

export function init(context, keyData) { ui = context; data = keyData; }
export const available = () => Boolean(data && data.abstracts && data.abstracts.length);
export const total = () => (available() ? data.abstracts.length : 0);
const isDone = (a) => ui.session().answers.has(`${SHEET}/${a.id}`);
export const done = () => (available() ? data.abstracts.filter(isDone).length : 0);
const nextOpen = () => data.abstracts.find((a) => !isDone(a)) || null;
const rowLabel = (a, row) => `${String(a.no).padStart(2, '0')} ${row.id === 'T' ? 'Trial' : row.id === 'M' ? 'Missing' : row.id}`;

function bar(count) {
  ui.renderTopbar({ label: 'Part 2: answer key', count, home: true, progress: { done: done(), total: total(), title: `${done()} of ${total()} abstracts done` } });
  ui.renderBanners();
}

/** Open Part 2: the instructions the first time, then the list. */
export function open() {
  if (!available()) { ui.showHome(); return; }
  if (!done() && !store.loadDraft(ui.session().code, SHEET, 'K-intro')) { showIntro(); return; }
  showList();
}

function exampleBox() {
  return h('div', { class: 'example' },
    h('p', { class: 'example-head' }, 'An example'),
    h('p', {}, 'The abstract says: ', h('span', { class: 'quote' }, '“Body weight at 52 weeks fell by 8.2 kg with drug X and by 2.1 kg with placebo (P < 0.001).”')),
    h('p', {}, 'The key’s row says: ', h('strong', {}, 'body weight: lower in arm 1 (drug X) than in arm 2 (placebo)'), '. Statistical test: significant.'),
    h('ul', { class: 'rule-list' },
      h('li', {}, 'Both parts are right, so you answer ', h('strong', {}, 'Yes'), '.'),
      h('li', {}, 'Had the row said “higher”, or “Statistical test: none given”, you would answer ', h('strong', {}, 'No'), ' and write which part is wrong: “direction” or “test”.'),
      h('li', {}, 'Had the outcome been named “weight loss”, the right direction would be “higher”: the direction is about the value of the outcome as it is named, not about benefit.')));
}

function showIntro() {
  ui.setWide(false);
  bar('');
  const n = data.findings;
  ui.mount(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, 'Part 2 of 3'),
    h('h1', {}, 'Check of an answer key'),
    h('p', { class: 'lede' }, 'Fifty abstracts of trial reports, and for each a draft answer key: the results the abstract states between two groups of the trial. Our program that reads trial abstracts is scored against this key. The project wrote the key itself, and nobody outside the project has checked it. We ask you, as a clinician, to check it.'),
    h('div', { class: 'panel' },
      h('h2', {}, 'What you do'),
      h('ol', { class: 'rule-list' },
        h('li', {}, 'Read the abstract on the left.'),
        h('li', {}, 'Go down the rows on the right. Each row says one thing the key claims. Answer ', h('strong', {}, 'Yes'), ' if you agree, ', h('strong', {}, 'No'), ' if you do not, or ', h('strong', {}, 'Cannot decide'), '.'),
        h('li', {}, 'With No or Cannot decide, write in the box what is wrong: the direction, the statistical test, the arms, the outcome, the population, or that it is not a result of the trial at all. A comment is welcome on any row.'),
        h('li', {}, 'Press “Save and go to the next abstract”. You can reopen an abstract you have done and change it.')),
      h('p', {}, 'Please judge from the abstract alone, without looking the trial up. Please do not compare answers with your colleague until you are both done: we report how often two reviewers agree.')),
    h('div', { class: 'panel' },
      h('h2', {}, 'The three kinds of rows'),
      h('ul', { class: 'rule-list' },
        h('li', {}, h('strong', {}, 'Trial. '), 'About the trial as a whole: whether it is a randomized trial in humans, its arms and the number of participants. The arms are named in full and numbered here. The rows below call them arm 1, arm 2 and so on, with a short name in brackets.'),
        h('li', {}, h('strong', {}, 'F1, F2 and so on. '), 'The findings of the key, one per row. The sentence a finding rests on is printed under it and underlined in the abstract. Point at a row and its sentence is highlighted.'),
        h('li', {}, h('strong', {}, 'Missing. '), 'Says the key leaves nothing out. Answer No if the abstract states a result between two arms that is not listed, and write which.'))),
    h('div', { class: 'panel' },
      h('h2', {}, 'What the key counts as a finding'),
      h('p', {}, 'A statement of the abstract about two arms of the trial, one outcome and one population, that lets a reader say how the outcome compares between the first arm and the second. Each finding has two parts, and you judge both:'),
      h('ul', { class: 'rule-list' },
        h('li', {}, h('strong', {}, 'The direction: '), 'lower, higher or no difference. It is about the value of the outcome, not about benefit: a larger weight loss is “higher” when the outcome is weight loss and “lower” when the outcome is body weight. A difference the abstract calls a trend keeps its direction.'),
        h('li', {}, h('strong', {}, 'The statistical test, as the abstract gives it: '), 'significant (a P value below 0.05, a confidence interval that excludes no effect, or the abstract calls the difference significant); not significant (the abstract says so, gives a P value of 0.05 or more or an interval that includes no effect, or says the groups did not differ); none given (the abstract states a direction or two numbers with no test between the arms); unclear.')),
      exampleBox()),
    h('details', { class: 'guide' }, h('summary', {}, 'The six rules behind the key, and the markers under a finding'), guideBody()),
    h('div', { class: 'panel' },
      h('h2', {}, 'How long, and where to stop'),
      h('p', {}, `The 50 abstracts hold ${n} findings; we expect about three hours for all of them. There is no clock in this part, and you can stop after any abstract and come back with your code. `,
        `The abstracts are in a fixed order that takes one of each period in turn, so any number done from the start is a balanced sample: the first 20 abstracts are ${data.first20} findings and a little over an hour. Please do as many as your time allows, in order.`)),
    h('div', { class: 'actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary',
        onclick: () => { store.saveDraft(ui.session().code, SHEET, 'K-intro', { seen: new Date().toISOString() }); const a = nextOpen(); if (a) showAbstract(a); else showList(); },
      }, done() ? 'Continue' : 'Start with abstract 01'),
      h('button', { type: 'button', class: 'btn', onclick: ui.showHome }, 'Back to the three parts'))));
  window.scrollTo(0, 0);
}

function guideBody() {
  return h('div', {},
    h('p', {}, 'The rules. Some notes under the rows refer to them by number.'),
    h('ol', { class: 'rule-list' },
      h('li', {}, 'A result told arm by arm (a change in one arm, in both, or in one and not in the other, with no test between the arms) is listed, and marked “Told arm by arm”. The key lists such statements because a reader can compare the two arms from them. Your answers on these rows tell us whether clinicians agree.'),
      h('li', {}, 'When the abstract gives only the two arms’ numbers, with no statement and no test, the finding takes the direction the numbers show, and the test is “none given”.'),
      h('li', {}, 'Direction and statistical test are kept apart. A difference that is not significant keeps its direction when the abstract states one, with the test “not significant”. A result shown only to be noninferior is no difference.'),
      h('li', {}, 'The population must match. A finding for a subgroup is listed only when the abstract reports a result within that subgroup by name. “Consistent across subgroups” gives no subgroup finding.'),
      h('li', {}, 'The time point and the outcome must match.'),
      h('li', {}, 'Two treatments are compared with each other only when the abstract compares them directly.')),
    h('p', {}, 'The markers under a finding.'),
    h('ul', { class: 'rule-list' },
      h('li', {}, h('strong', {}, 'Headline finding: '), 'the result of the primary outcome in all participants, or the result the title and the conclusion lead with.'),
      h('li', {}, h('strong', {}, 'Told arm by arm: '), 'see rule 1. If you think the statement is no result between the two arms, answer No and say so.'),
      h('li', {}, h('strong', {}, 'A second direction is also accepted: '), 'the sentence can be read two ways, for example when the outcome is named as a reduction.')),
    h('p', {}, 'Under some abstracts there is a note that was written with the key. It says what was left out on purpose and why. The notes are older than this layout: where a note says “optional”, it means told arm by arm, and where it says “no_difference also accepted”, it means the direction has no significant test behind it.'));
}

function showList() {
  ui.setWide(false);
  bar(`${done()} of ${total()} abstracts done`);
  const next = nextOpen();
  const all = done() === total();
  ui.mount(h('section', { class: 'intro' },
    h('p', { class: 'eyebrow' }, 'Part 2 of 3'),
    h('h1', {}, 'Check of an answer key'),
    h('p', { class: 'lede' }, all ? 'All 50 abstracts are done. Thank you. You can still reopen one and change it.'
      : `${done()} of ${total()} abstracts done. Stop whenever you like: what you have saved counts.`),
    h('div', { class: 'actions' },
      next ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => showAbstract(next) }, `${done() ? 'Continue' : 'Start'} with abstract ${String(next.no).padStart(2, '0')}`) : null,
      h('button', { type: 'button', class: 'btn', onclick: showIntro }, 'Read the instructions again'),
      h('button', { type: 'button', class: 'btn', onclick: ui.showHome }, 'Back to the three parts')),
    h('table', { class: 'seq items' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Abstract'), h('th', {}, 'Journal and year'), h('th', {}, 'Findings'), h('th', {}, ''))),
      h('tbody', {}, data.abstracts.map((a) => {
        const finished = isDone(a);
        const can = finished || a === next || ui.test;
        return h('tr', { class: finished ? 'done' : (a === next ? 'now' : '') },
          h('td', {}, String(a.no).padStart(2, '0')),
          h('td', {}, `${a.journal}, ${a.year}`),
          h('td', {}, String(a.rows.length - 2)),
          h('td', {}, can ? h('button', { type: 'button', class: 'btn-link', onclick: () => showAbstract(a) }, finished ? 'Done. Open again' : 'Open') : h('span', { class: 'muted' }, 'Later')));
      })))));
  window.scrollTo(0, 0);
}

function marked(segs) {
  return segs.map((s) => (s.r ? h('span', { class: 'kq', 'data-rows': s.r.join(' ') }, s.t) : s.t));
}

function showAbstract(a) {
  ui.setWide(true);
  bar(`Abstract ${a.no} of ${total()}`);
  const code = ui.session().code;
  const saved = ui.session().answers.get(`${SHEET}/${a.id}`);
  const draft = store.loadDraft(code, SHEET, a.id);
  const state = (draft && draft.rows) || (saved && saved.answer && saved.answer.rows && JSON.parse(JSON.stringify(saved.answer.rows))) || {};
  for (const row of a.rows) if (!state[row.id]) state[row.id] = { a: '', c: '' };
  const opened = Date.now();
  const before = (draft && draft.ms) || 0;
  const keep = () => store.saveDraft(code, SHEET, a.id, { rows: state, ms: before + (Date.now() - opened) });
  const err = h('p', { class: 'form-error', role: 'alert' });

  const abstract = h('aside', { class: 'source-pane' },
    h('h2', { class: 'pane-title' }, `Abstract ${String(a.no).padStart(2, '0')} of ${total()}`),
    h('p', { class: 'paper-title' }, marked(a.title)),
    h('p', { class: 'paper-meta' }, `${a.journal}, ${a.year}. Period: ${a.period}.`),
    a.sections.map((s) => h('p', { class: 'abs' }, s.label ? h('span', { class: 'abs-label' }, `${s.label} `) : null, marked(s.segs))),
    h('p', { class: 'muted small' }, 'Underlined: the sentences the key quotes. Judge from this abstract alone.'));
  const light = (id, on) => abstract.querySelectorAll('.kq').forEach((el) => { if (el.dataset.rows.split(' ').includes(id)) el.classList.toggle('on', on); });

  const blocks = a.rows.map((row) => {
    const s = state[row.id];
    const box = h('textarea', {
      rows: 1, maxlength: COMMENT_MAX, 'aria-label': `Comment on ${rowLabel(a, row)}`,
      placeholder: row.id === 'M' ? 'If No: which result is missing?' : 'If No or Cannot decide: what is wrong? Any comment.',
      oninput: (e) => { s.c = e.target.value; keep(); },
    }, s.c || '');
    const buttons = CHOICES.map(([value, label]) => h('button', {
      type: 'button', class: `choice small${s.a === value ? ' selected' : ''}`, 'data-value': value, 'aria-pressed': s.a === value ? 'true' : 'false',
      onclick: () => {
        s.a = value;
        buttons.forEach((b) => { const on = b.dataset.value === value; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        block.classList.remove('missing');
        keep();
      },
    }, label));
    const block = h('div', {
      class: `q krow${row.id.startsWith('F') ? ' finding' : ''}`, 'data-row': row.id,
      onmouseenter: () => light(row.id, true), onmouseleave: () => light(row.id, false),
      onfocusin: () => light(row.id, true), onfocusout: () => light(row.id, false),
    },
    h('div', { class: 'q-head' }, h('span', { class: 'krow-id' }, rowLabel(a, row))),
    h('p', { class: row.id.startsWith('F') ? 'krow-text strong' : 'krow-text' }, row.text),
    row.tags ? h('p', { class: 'krow-tags' }, row.tags) : null,
    (row.evidence || []).map((q, i) => h('p', { class: 'sentence' }, i ? 'Restated: ' : null, `“${q}”`)),
    h('div', { class: 'choices' }, buttons),
    box);
    return block;
  });

  const form = h('form', {
    class: 'form-pane', novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      const open = a.rows.filter((row) => !state[row.id].a);
      const silent = a.rows.filter((row) => ['disagree', 'unsure'].includes(state[row.id].a) && !String(state[row.id].c || '').trim());
      blocks.forEach((b) => b.classList.toggle('missing', [...open, ...silent].some((row) => row.id === b.dataset.row)));
      if (open.length || silent.length) {
        err.textContent = open.length ? `Please answer every row (${open.length} still open, marked in red).`
          : 'Please write what is wrong on the rows you answered No or Cannot decide (marked in red).';
        const first = form.querySelector('.q.missing');
        if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const at = new Date();
      const rows = {};
      for (const row of a.rows) rows[row.id] = { a: state[row.id].a, c: String(state[row.id].c || '').trim() };
      const ms = before + (Date.now() - opened);
      ui.saveRecord(SHEET, a.id, {
        answer: { task: 'key', reader: Number(ui.session().reader), no: a.no, pmid: a.pmid, rows, key_version: data.version, changed: Boolean(saved) },
        elapsed_ms: ms, client_ts: at.toISOString(), app_version: ui.version,
      });
      store.clearDraft(code, SHEET, a.id);
      const next = nextOpen();
      if (next && !saved) showAbstract(next); else showList();
    },
  },
  h('h2', { class: 'pane-title' }, 'What the key says'),
  h('p', { class: 'ask' }, 'For each row: do you agree with the key? Yes, No or Cannot decide.'),
  h('details', { class: 'guide' }, h('summary', {}, 'The rules and the markers'), guideBody()),
  blocks,
  a.note ? h('p', { class: 'key-note' }, h('strong', {}, 'Note with the key: '), a.note) : null,
  err,
  h('div', { class: 'submit-row' },
    h('button', { type: 'submit', class: 'btn btn-primary' }, saved ? 'Save my changes' : (a.no < total() ? 'Save and go to the next abstract' : 'Save')),
    h('button', { type: 'button', class: 'btn', onclick: () => { keep(); showList(); } }, 'Stop here'),
    h('span', { class: 'muted' }, 'What you have ticked on this abstract is kept in this browser until you save it.')));

  ui.mount(h('section', { class: 'work' }, abstract, form));
  window.scrollTo(0, 0);
}
