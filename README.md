# Reader study page

The page of the reader study of the living evidence base (`docs/evaluation/reader_study_protocol.md` in the
`living-evidence-base` repository). Two clinicians fill the same extraction form of eight fields for 24 trials of
GLP-1 drugs against placebo, 12 from the paper and 12 from the record sheet of the evidence base, and the page times
each trial. Four practice trials come first.

Online since 2026-11-23 at https://danielliangajj.github.io/leb-reader-study/ (reader 1: add `?r=1`; reader 2: add
`?r=2`). Answers go to the tables `rdr_readers` and `rdr_forms` of the Supabase project in `config.js`, once
`supabase/schema.sql` has been run there.

## What a reader sees

1. Welcome: what the study is, the order of the parts for this reader, a name and an email. The page gives a code of
   10 characters to come back with.
2. Before each part: which source is used and the rules (from the paper: do not open the evidence base; from the
   evidence base: do not open the paper).
3. One trial at a time. Pressing Start starts the clock. The source is on the left (a link to the paper, or the
   record sheet) and the form on the right. Any field can be answered "Not given in my source". Pause stops the clock
   and hides the trial. Submit stops the clock; a submitted form cannot be reopened.
4. After the last block: three questions on using the evidence base. Then a button to download the answers.

The reader number is in the link: `?r=1` works paper, evidence base, paper, evidence base; `?r=2` the opposite.
Without `?r=` the page only lets a reader resume with a code.

## Test mode

For the study team, to try the page: add `&test=1` to a link (`?r=1&test=1` or `?r=2&test=1`). The page is the one a
reader sees, with three differences. Nothing is sent to the database. What is typed is kept in the browser under
keys of its own (`rdrtest:`), apart from a real session. Each part and each trial has a Skip button, so the later
screens (the evidence base's record sheets, the survey, the finish) can be reached without filling 28 forms. The
welcome screen has a button to erase the test and start over. A reader's link never carries the parameter.

## What is stored for a trial

`answer.fields` (the eight fields, each with its "not given" tick), `answer.confidence` (1 to 5), `answer.note`,
`answer.condition` (A = paper, B = evidence base), `answer.timing` and `answer.opened`.

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
| `index.html`, `assets/` | The page. `views.js` holds the screens and the form, `sync.js` the save queue, `storage.js` the browser storage, `api.js` the calls to the database |
| `data/study.json` | The order of work of the two readers and, for the 28 trials, the main report and the record sheet. Written by `python3 scripts/reader_study.py site ~/Dropbox/leb-reader-study` in the evidence-base repository. It holds no reference answer |
| `config.js` | Address and public key of the database. Empty: the page keeps the answers in the browser only |
| `supabase/schema.sql` | Two tables (`rdr_readers`, `rdr_forms`) and four functions, all with the prefix `rdr_`, so the file can be run in the project of the rating sites |

## How it was put online

1. `supabase/schema.sql` is run once in the SQL editor of the Supabase project.
2. The project address and the publishable key are in `config.js`.
3. The folder is a public GitHub repository with Pages switched on. `data/study.json` holds sentences of PubMed
   abstracts and the names of the trials, nothing private; the page asks search engines not to index it.
4. Both links are tried with a made-up name, and those rows are removed before the readers start.
5. Reader 1 gets the link ending in `?r=1` and reader 2 the link ending in `?r=2`.

## To try it on this computer

    cd ~/Dropbox/leb-reader-study && python3 -m http.server 8771 --bind 127.0.0.1

Then open `http://127.0.0.1:8771/?r=1`. Tried on 2026-11-23 in Chrome: start, the checks of the form, pause, a reload
in the middle of a trial (the form and the clock come back), all 28 trials for reader 1, the survey, the finish
screen, and the order of reader 2.

## Not done yet

- The reference answers and the scoring script. Nothing of the reference is on the page.
- The comments of the two readers and Dr. Weng on the three open points of the design (full text or abstract, may a
  reader in the evidence-base part open the paper, which fields). The page follows the protocol's proposals: full
  text, no, the eight fields.
