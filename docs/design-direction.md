# StarShooter visual direction

## Brief
A private HKDSE study desk for a Hong Kong secondary student. Used daily, often
on a phone, late at night, between papers. It must feel like a *workbook* — calm,
legible, unglamorous — not like a product landing page. Two hard constraints
from the owner: no gradients; nothing that looks generically AI-generated;
keep it easy to use and student-oriented.

## The subject's own vernacular
Exercise books, past-paper booklets, HKEAA mark sheets, a paper timetable
pinned above a desk, ruled lines, red pen for corrections. The materials are
paper, ink, and a red pen. That is the whole palette — no decorative washes.

## Colour (6 named values)
- `paper`   #FBFAF7  — the page, warm white but nearly neutral
- `ink`     #1A1A18  — text, near neutral black (not tinted green)
- `muted`   #6E6A63  — secondary text
- `rule`    #DCD9D2  — hairlines and card edges
- `mark`    #0F5D50  — the working accent (deep ink green), used for actions
- `redpen`  #A33A28  — corrections only, never decoration

Dark mode is charcoal #141514 with the same hairline logic, not an inverted cream.

## Type
One family for the interface, one for numerals.
- Interface: a plain, slightly condensed system sans (`-apple-system`,
  `"Helvetica Neue"`, `Arial`). No display serif — a serif headline on every
  card was the templated tell.
- Numerals: tabular figures in the same sans, not a monospace face used as
  costume. Dates, marks and the countdown line up because of
  `font-variant-numeric`, not a different font.

## Layout
Left-aligned, single reading column, generous but not airy. Cards are bounded by
a hairline, not a shadow. No rounded-corner-everything: 6px on controls, 10px on
panels, 0 on the matrix (it is a table, and tables are square).

```
┌ rail ────────┬ main ─────────────────────────────┐
│ StarShooter  │ Date                            │
│              │ Page title        [quiet] [main]│
│ Desk         │ ─────────────────────────────── │
│ Papers       │ panel                           │
│ Focus        │  heading                        │
│ Tasks        │  content                        │
│ Settings     │                                 │
│              │ panel                           │
│ user         │                                 │
└──────────────┴─────────────────────────────────┘
```

## Principles
1. **Nothing decorates; everything labels.** A rule separates, a chip names a
   level, a red mark means a mistake. No background texture, no glow, no orb.
2. **One accent, used for action.** Green marks what you can press or what is
   current. It never fills a large area.
3. **The countdown is the one bold thing.** Large tabular numerals, no card
   ornament around them (Chanel rule: remove the accessory).
4. **Square tables, soft controls.** Hierarchy through corner radius, not shadow.
5. **Density that respects a student.** Numbers close to their labels; long
   lists readable at 14px; nothing below 11px except unit suffixes.

## Reviewed against the generic default
Rejected: cream #F4F1EA + serif display + clay accent (the current file, and the
classic tell); gradient washes; dotted-grid texture; ALL-CAPS tracked eyebrows
above every heading; `·`-joined meta strings; monospace as decoration; a shadow
on every card. Each is either removed or replaced with something the content
actually needs.
