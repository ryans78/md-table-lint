# md-table-lint

Markdown tables break in a way that's easy to miss in a diff review: add
one cell to a row, forget to add the matching `|`, and the row silently
shifts by a column when it renders. Or someone writes a separator row like
`| --- | === |` and one column just never turns into a table. Nothing
errors, the file just renders wrong on GitHub/GitLab/wherever, and you
find out from a screenshot in a Slack message.

This is a small linter that walks a markdown file, finds pipe tables, and
reports the specific line where something doesn't add up: a row with the
wrong number of columns, a separator row that isn't valid GFM syntax, or a
header cell that's empty.

## Example

Given `notes.md`:

```
| Name | Role | Notes |
| --- | --- |
| Ada | Engineer | Started Q1 |
| Grace |  | Started Q2
```

Running the linter:

```
$ node dist/cli.js notes.md
notes.md:2: error [column-count-mismatch] separator row has 2 column(s), header has 3
notes.md:3: error [column-count-mismatch] row has 3 column(s), header has 3
notes.md:4: warning [empty-header-cell] column 2 has an empty header
```

(That last line is actually a data row with an empty cell, not the header
— the point stands: the tool tells you the line number, you go look.)

## Usage

There's no published package yet. Clone the repo, compile, and run it
against files directly:

```
$ npm run build
$ node dist/cli.js README.md docs/*.md
```

Exit code is `1` if any error-level finding turned up, `0` otherwise, so
it's usable as a pre-commit or CI check:

```
node dist/cli.js $(git diff --cached --name-only -- '*.md') || exit 1
```

## What it checks right now

- `column-count-mismatch` — a row (including the separator row) has a
  different number of cells than the header.
- `invalid-separator` — a separator cell isn't one of `---`, `:--`, `--:`,
  `:-:`.
- `empty-header-cell` — a header cell is blank.

Table detection is a heuristic (a line with a `|` followed by a line that
looks like a separator), not a full CommonMark/GFM parser, so it can
misfire on edge cases like a thematic break (`---`) right after a
paragraph that happens to contain a pipe character.

## Requirements

Node.js with a `tsc` available (TypeScript is not vendored into this
repo — install it however you normally would, or use whatever `tsc` you
already have on your machine). No runtime dependencies: the linter and
CLI only use `node:fs` from the standard library.

## License

MIT, see LICENSE.
