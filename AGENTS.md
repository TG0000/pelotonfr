<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Identity

Settled in phase 1 of the redesign. These are rules, not suggestions: the point
of an identity is that it holds when nobody is looking at it.

## The mark

A circuit with its decisive sector, in `components/brand/Logo.tsx`. French
amateur racing is laps of a village loop, and this product exists to tell a
rider what that loop will do to them before they start. So the mark is the
circuit, traced the way a route is drawn on a map, with one stretch in the
yellow of a course arrow: the place the race is won.

Straights and corners, never a soft blob — a smooth loop reads as a pebble.
Two paths, no more: at 16px it has to survive as a dark loop with a bright
straight. Use `<Logo />` and `<Wordmark />`; never a bicycle icon from an icon
set, which is what a thousand other apps already use.

The yellow sector is the product's thesis. Anyone can tell you a race exists;
this tells you where it is decided.

## Two registers

The free product speaks in the **route card** register: paper ground, navy ink,
course-arrow yellow for what wants noticing. It is the light theme.

The analysis and premium surfaces speak in the **performance board** register:
the navy of the mark as ground, data in colour. It is the dark theme.

Both are the same token set — `app/globals.css` — so a component never picks a
register. Switching theme switches register.

## Two voices

- **Archivo** (`font-sans`, `font-heading`) — everything read as language.
  It has the sturdy, faintly condensed build of French road signage.
- **IBM Plex Mono** (`font-mono`) — everything *measured*: dossards, dates,
  times, placings, points, distances. A number should look like a number, and
  columns of them should line up. Pair it with `tabular-nums`.

If you are unsure which a value is: would it appear on a results sheet? Then
it is mono.

## Colour

Every colour comes from `app/globals.css` tokens, which are derived from the
five colours of the mark. Never write a hex in a component.

The federation colours (`--ffc`, `--fsgt`, `--ufolep`) are *semantic* — they
identify a federation and nothing else. They are not decoration and must not be
borrowed for unrelated accents.

Colours are authored in OKLCH. Anything that cannot parse OKLCH — MapLibre is
the known case — goes through `lib/color.ts` rather than getting its own
hard-coded palette to drift from.

## Words

Write from the rider's side of the screen.

- Name things as a racer would: a *course*, a *catégorie*, un *dossard* — never
  a "race entity" or a "category enum".
- Say what a control does, then confirm that it happened.
- An empty state says why it is empty and what to change. "Aucune course ne
  correspond — élargissez la période ou retirez une catégorie", not "Aucun
  résultat".
- An error says what failed and what to do. No apologies, no "oups".
- Never shout: race names are title-cased for display through
  `lib/race-name.ts`, and headings are capitalised in code rather than with a
  CSS `capitalize`, which title-cases every word.
