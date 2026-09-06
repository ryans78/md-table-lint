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

### `--fix`

`node dist/cli.js --fix notes.md` rewrites each table in place: it pads
short rows out to the header's column count, normalizes the separator
row's dashes and colons, and aligns every column to its widest cell. It
then re-lints the fixed file and reports whatever's left.

Not everything is safe to fix automatically. A row with *more* cells
than the header is left untouched — there's no way to know which cell
is the spurious one — and an empty header cell isn't filled in, since
there's nothing to infer it from. Both still show up in the post-fix
report.

`--fix` and `--config` can be combined and used in either order, e.g.
`node dist/cli.js --fix --config ci.json notes.md`.

### Config

To turn off individual rules, add a `.md-table-lintrc.json` file in the
directory you run the linter from:

```json
{
  "rules": {
    "empty-header-cell": false
  }
}
```

Any rule not listed stays enabled — you only need to name the ones you
want off. `--config <path>` points the CLI at a config file somewhere
else instead of looking in the current directory. An unknown rule name
in the file is reported as a warning and otherwise ignored, so a typo
doesn't silently disable something you meant to keep.

Library users pass the same shape directly to `lintMarkdown`:

```js
lintMarkdown(text, { rules: { 'empty-header-cell': false } });
```

## GitHub Action

The repo itself can be used as an action, so a workflow doesn't need to
clone and build it by hand:

```yaml
- uses: ryans78/md-table-lint@main
  with:
    files: 'docs/**/*.md README.md'   # default: **/*.md
    fix: false                        # set true to run --fix instead of reporting
    config: '.md-table-lintrc.json'   # optional, same as CLI's --config
```

It sets up Node, builds the tool from source (there's no published npm
package yet, so this is a build-and-run step rather than an install), then
runs it against the matched files. The step fails the job if any
error-level finding turns up, same as the CLI's exit code. `fix: true`
rewrites files in the checkout in place; pair it with a follow-up step
that diffs or commits if you want the result to end up somewhere.

## Tests

```
$ npm test
```

Uses `node:test` from the standard library, so there's nothing to install.

## What it checks right now

- `column-count-mismatch` — a row (including the separator row) has a
  different number of cells than the header.
- `invalid-separator` — a separator cell isn't one of `---`, `:--`, `--:`,
  `:-:`.
- `empty-header-cell` — a header cell is blank.

Table detection is a heuristic (a line with a `|` followed by a line that
looks like a separator), not a full CommonMark/GFM parser. A bare dash
run right after a paragraph (`---` or `***`) is treated as a setext
heading underline or thematic break rather than a table separator,
matching how GFM itself resolves that ambiguity, so it won't misfire on
those. Content inside fenced code blocks (``` or ~~~) is skipped, so a
table-looking snippet in an example doesn't get flagged. Cases the
heuristic still doesn't handle, like tables inside list items, are not
yet accounted for.

## Requirements

Node.js with a `tsc` available (TypeScript is not vendored into this
repo — install it however you normally would, or use whatever `tsc` you
already have on your machine). No runtime dependencies: the linter and
CLI only use `node:fs` from the standard library.

## License

MIT, see LICENSE.
