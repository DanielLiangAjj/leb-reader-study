# Reader study page

The page on which two clinicians test the living evidence base (`docs/evaluation/reader_study_protocol.md` in the
`living-evidence-base` repository). Since version 2.0 (2026-11-24) it holds three parts behind one link; version 2.1 of the
same day made Part 1 closer to how a review is really done (below).

| Part | What the clinician does | Rough time |
|---|---|---|
| 1. Timed extraction | Fills the same extraction form of sixteen fields for 24 trials of GLP-1 drugs against placebo: 12 from the paper alone, and 12 from the record sheet of the evidence base first and then checked against the paper. The page times each trial. Four practice trials come first, nine questions on the experience come last | 5 h 35 min (a guess) |
| 2. Check of an answer key | For the 50 gold abstracts, answers Yes, No or Cannot decide on every row of the key: the trial, each of the 268 findings, and whether anything is missing | 3 h for all 50; a little over 1 h for the first 20 |
| 3. Second reading | For 40 items in four sets of ten, reads a few short texts and chooses one of the set's three or four answers. Our own first reading is not shown | 1 h |

Part 1 must be finished before Parts 2 and 3 open: they show where the evidence base was right and wrong, and that
must not change how a reader works while timed. No abstract of Part 2 and no item of Part 3 is a paper of a trial of
Part 1.

Online since 2026-11-23 at https://danielliangajj.github.io/leb-reader-study/ (reader 1: add `?r=1`; reader 2: add
`?r=2`; reader 3, added on 2026-11-25: add `?r=3`). Answers go to the tables `rdr_readers` and `rdr_forms` of the Supabase project in `config.js`, once
`supabase/schema.sql` has been run there.

## Part 1 since version 2.1

Two things were changed so that the timed part looks like data extraction in a real review.

- **The form.** Sixteen fields in four groups, the kinds of items a review's data collection form asks for: the
  treatments (drug and dose, comparator); the trial and its participants (number randomized in all and in each arm,
  type 2 diabetes, mean body-mass index, blinding); body weight (time, how expressed, direction, size, spread, number
  analysed, statistical test, how many lost 5% or more); safety (stopped for adverse events, serious adverse events).
  The evidence base reads abstracts and holds only some of these.
- **The evidence base is a first pass, not the only source.** A trial of the evidence base has two steps. Step 1: the
  reader fills the form from the record sheet alone and ticks "Not on the record sheet" for the rest. Step 2: the page
  links to the paper; the reader checks what came from the sheet, corrects it, and fills the rest. The clock runs
  through both. The form as it stood after step 1 is stored with the time of that step, so the study gives two
  comparisons: the record sheet alone against the paper (the controlled one), and the whole assisted extraction
  against the paper (the realistic one). It also shows how many values the paper made the reader change.

The record sheet now shows everything the evidence base holds for the trial: the main report, its arms and
participants, the results on body weight, the results on adverse events and stopping treatment, and all other
results (folded).

## What a reader sees

1. Welcome: the three parts, a name and an email. The page gives a code of 10 characters to come back with.
2. The home screen: the three parts, how far each is, and a button to download the answers.
3. Part 1. Its introduction (the task, why the time matters, the order of the blocks). Before each block: which
   source is used and the rules (from the paper: do not open the evidence base; from the evidence base: do not open
   the paper). Then one trial at a time. Pressing Start starts the clock. The source is on the left (a link to the
   paper, or the record sheet) and the form on the right. Any field can be answered "Not given in my source". Pause
   stops the clock and hides the trial. Submit stops the clock; a submitted form cannot be reopened. After the last
   block: nine questions (which source was easier to read, less tiring, gave more confidence; whether the record
   sheets felt faster; how often the reader wanted the paper; whether they would start a review from the records;
   two free-text questions).
4. Part 2. Instructions with an example, then one abstract at a time: the abstract on the left, with the sentences
   the key quotes underlined, and the rows of the key on the right. A row answered No or Cannot decide needs a
   comment. The abstracts come in a fixed order (one of each period in turn), so any number done from the start is a
   balanced sample. A saved abstract can be reopened and changed. No clock.
5. Part 3. Instructions, then for each set a page with its question, its answers and a worked example (an item that
   is not among the ten), then one item at a time. "Cannot tell" needs a comment. A saved item can be reopened and
   changed. No clock.

The reader number is in the link: `?r=1` works paper, evidence base, paper, evidence base; `?r=2` the opposite.
A third reader was added on 2026-11-25, before any reader started: `?r=3` works in the order of reader 1 (the rule: an
odd number takes the order of reader 1, an even number that of reader 2) and does all three parts. Two lists in
`data/study.json` set what differs between readers: `part1_only` (readers who are shown Part 1 alone; empty) and
`students` (readers the page does not address as clinicians; reader 3). Nothing changes for readers 1 and 2.
Without `?r=` the page only lets a reader resume with a code.

## Test mode

For the study team, to try the page: add `&test=1` to a link (`?r=1&test=1` or `?r=2&test=1`). The page is the one a
reader sees, with four differences. Nothing is sent to the database. What is typed is kept in the browser under
keys of its own (`rdrtest:`), apart from a real session. Each block and each trial of Part 1 has a Skip button, so
the later screens (the evidence base's record sheets, the nine questions) can be reached without filling 28 forms.
Parts 2 and 3 are open without Part 1, and any abstract or item can be opened. The welcome screen has a button to
erase the test and start over. A reader's link never carries the parameter.

## What is stored

One row of `rdr_forms` per form. The column `sheet` is `practice` or `scored` for a trial of Part 1 and `survey` for
everything else (the database accepts these three names); the column `item_id` tells the rest apart.

| `sheet` | `item_id` | What it is |
|---|---|---|
| `practice`, `scored` | the trial's id | One extraction form of Part 1 (below) |
| `survey` | `S1` | The nine questions at the end of Part 1: `easier`, `tiring`, `sure` (paper, sheet or same), `speed`, `changed`, `use`, `before` (reviews extracted before), and the free texts `missing` and `other` |
| `survey` | `K01` to `K50` | Part 2, one abstract: `answer.rows` maps each row (`T`, `F1`, ..., `M`) to `{a, c}` with `a` = agree, disagree or unsure and `c` the comment |
| `survey` | `H01` to `H40` | Part 3, one item: `answer.choice` (the answer's label), `answer.comment`, `answer.opened_paper`, `answer.set` |

`rdr_readers.completed_at` is the time Part 1 was finished. For Parts 2 and 3 `elapsed_ms` is the time the form was
open, kept for information only. `python3 scripts/review_site.py read EXPORT.csv` in the evidence-base repository
turns an export of `rdr_forms` into the reviewers' answers on the key and the second readings beside the first.

### A trial of Part 1

`answer.fields` (the sixteen fields, each with its "not given" tick), `answer.confidence` (1 to 5), `answer.note`,
`answer.condition` (A = paper alone, B = evidence base first, then the paper), `answer.timing` and `answer.opened`.
For condition B, `answer.steps` is 2 and `answer.sheet_step` holds `fields` (the form as it stood at the end of
step 1, from the record sheet alone) and `active_ms` (the time of step 1).

| Timing field | Meaning |
|---|---|
| `active_ms` | From Start to Submit, without pauses and without the time the page was closed. This is the time of the study (also stored as `elapsed_ms`) |
| `paused_ms`, `pauses` | Time not counted, and the number of times Pause was pressed |
| `hidden_ms` | Time the page was in the background while the clock ran. From the paper this is the reading time in the other tab; it is counted |
| `closed_ms`, `reloads` | Time the page was closed or reloaded with the trial open (not counted), and how often |
| `opened` | Each click on a link to the paper, with the clock time of the click |

## Files

| File | What it is |
|---|---|
| `index.html`, `assets/` | The page. `views.js` holds the welcome and home screens and Part 1, `key.js` Part 2, `second.js` Part 3, `sync.js` the save queue, `storage.js` the browser storage, `api.js` the calls to the database |
| `data/study.json` | The order of work of each reader, the two lists `part1_only` and `students` and, for the 28 trials, the main report and the record sheet. Written by `python3 scripts/reader_study.py site ~/Dropbox/leb-reader-study` in the evidence-base repository. It holds no reference answer |
| `data/key.json` | Part 2: the 50 abstracts and the rows of the answer key. Written by `python3 scripts/review_site.py build ~/Dropbox/leb-reader-study` in the evidence-base repository |
| `data/second.json` | Part 3: the four sets, ten items each, and one worked example a set. Written by the same command. It does not hold our first reading of the 40 items; that stays in the evidence-base repository |
| `config.js` | Address and public key of the database. Empty: the page keeps the answers in the browser only |
| `supabase/schema.sql` | Two tables (`rdr_readers`, `rdr_forms`) and four functions, all with the prefix `rdr_`, so the file can be run in the project of the rating sites |
| `supabase/add_reader_3.sql` | For a database made before 2026-11-25: allows reader number 3. It removes no row and changes no stored answer |

## How it was put online

1. `supabase/schema.sql` is run once in the SQL editor of the Supabase project.
2. The project address and the publishable key are in `config.js`.
3. The folder is a public GitHub repository with Pages switched on. `data/study.json` holds sentences of PubMed
   abstracts and the names of the trials, nothing private; the page asks search engines not to index it.
4. Both links are tried with a made-up name, and those rows are removed before the readers start.
5. Reader 1 gets the link ending in `?r=1` and reader 2 the link ending in `?r=2`.
6. For the third reader, `supabase/add_reader_3.sql` is run once in the SQL editor; that reader gets the link ending in
   `?r=3`.

## To try it on this computer

    cd ~/Dropbox/leb-reader-study && python3 -m http.server 8771 --bind 127.0.0.1

Then open `http://127.0.0.1:8771/?r=1`. Tried on 2026-11-23 in Chrome: start, the checks of the form, pause, a reload
in the middle of a trial (the form and the clock come back), all 28 trials for reader 1, the survey, the finish
screen, and the order of reader 2.

Version 2.0 was tried on 2026-11-24 in Chrome on this computer, in test mode and with an empty `config.js`: the home
screen, the lock on Parts 2 and 3 and its release, an abstract of Part 2 (the checks, a saved row, the next
abstract), a set of Part 3 (the example, the checks, a saved item, the list), and the eight questions. Version 2.1 was tried the same evening: the sixteen fields from the paper, a trial of the
evidence base through both steps, what is stored for it, and a reload in the middle of step 2.

## Not done yet

- The scoring script of Part 1. Nothing of the reference is on the page.
- The reference answers of the eight new fields of Part 1.
- Dr. Weng's and the two readers' comments on the design. Version 2.1 follows Daniel's word of 2026-11-24: the full
  text, a form close to a real review's, and the evidence base as a first pass that is checked against the paper.
