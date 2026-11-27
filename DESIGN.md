---
name: Índigo de taller (email and Open Graph)
revision: 1
adapts: portfolio design system revision 2
colors:
  light-canvas: '#F3F4F7'
  light-surface: '#FCFCFE'
  light-text: '#1F2937'
  light-text-muted: '#4B5563'
  light-accent: '#5B5F8F'
  light-on-accent: '#FCFCFE'
  light-divider: '#C8CCD7'
  dark-canvas: '#141A24'
  dark-surface: '#1F2937'
  dark-text: '#EAECF2'
  dark-text-muted: '#AEB7C9'
  dark-accent: '#B7B8EE'
  dark-on-accent: '#141A24'
  dark-divider: '#394355'
typography:
  email-title:
    fontFamily: 'Segoe UI, Arial, sans-serif'
    fontSize: '28px'
    fontWeight: 600
    lineHeight: 1.2
  email-body:
    fontFamily: 'Segoe UI, Arial, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.6
  og-title-large:
    fontFamily: 'IBM Plex Sans'
    fontSize: '84px'
    fontWeight: 600
    lineHeight: 1.08
  og-title:
    fontFamily: 'IBM Plex Sans'
    fontSize: '75px'
    fontWeight: 600
    lineHeight: 1.08
  og-title-small:
    fontFamily: 'IBM Plex Sans'
    fontSize: '62px'
    fontWeight: 600
    lineHeight: 1.08
  og-signature:
    fontFamily: 'IBM Plex Mono'
    fontSize: '38px'
    fontWeight: 400
    lineHeight: 1.2
rounded:
  control: '5px'
components:
  email-cta:
    backgroundColor: '{colors.light-accent}'
    textColor: '{colors.light-on-accent}'
    rounded: '{rounded.control}'
    padding: '14px 24px'
---

# Design adaptation: email and Open Graph

[Español](DESIGN.es.md)

This document adapts **revision 2** of the [portfolio design system](https://github.com/matigaleanodev/portfolio/blob/main/DESIGN.md) (source `DESIGN.md` SHA-256 `6efe16bb919649431bea95c1b3cb2054b91184d50c91864dabb84bc9c05a89b6`). It is not a second source of visual decisions: it only states how that system applies where email clients and a deterministic renderer limit it. On any difference not listed here, the source wins. A new source revision is adopted by editing this document; there is no shared package or automatic synchronization.

**MUST** rules are acceptance criteria; **SHOULD** rules admit a recorded deviation.

## Overview

- MUST keep the Índigo de taller identity: indigo accent, sober hierarchy, no gradients, glass, glows or shadows.
- MUST sign as “Matias Galeano · Blog técnico” and write visible copy in Spanish.
- SHOULD keep the composition to signature, title, supporting text and one action.

## Colors

| Token        | Light   | Dark    |
| ------------ | ------- | ------- |
| `canvas`     | #F3F4F7 | #141A24 |
| `surface`    | #FCFCFE | #1F2937 |
| `text`       | #1F2937 | #EAECF2 |
| `text-muted` | #4B5563 | #AEB7C9 |
| `accent`     | #5B5F8F | #B7B8EE |
| `on-accent`  | #FCFCFE | #141A24 |
| `divider`    | #C8CCD7 | #394355 |

| Pair                     | Light | Dark  |
| ------------------------ | ----- | ----- |
| `text` / `canvas`        | 13.35 | 14.78 |
| `text` / `surface`       | 14.33 | 12.43 |
| `text-muted` / `canvas`  | 6.87  | 8.66  |
| `text-muted` / `surface` | 7.38  | 7.28  |
| `accent` / `canvas`      | 5.49  | 9.23  |
| `on-accent` / `accent`   | 5.89  | 9.23  |

All pairs above meet 4.5:1. `divider` is decorative.

## Typography

| Output          | Primary                                                | Fallback                          |
| --------------- | ------------------------------------------------------ | --------------------------------- |
| Email           | `'Segoe UI'`, Arial                                    | Client sans-serif; no web fonts.  |
| Email signature | Consolas, `'Courier New'`                              | monospace                         |
| Open Graph      | Packaged IBM Plex Sans SemiBold and Mono Regular files | None: a missing font is an error. |

Packaged fonts are under the SIL Open Font License 1.1 and MUST ship with the license text.

## Layout

### Email

- Layout tables with `role="presentation"`, inline styles, one column, `width: 100%` with `max-width: 600px` and a 600px fixed wrapper for Outlook.
- Outer background `surface`; letter background `canvas` with a 4px `accent` top rule; padding 32px, 16px on narrow clients; blocks separated by 16–24px.
- Order: hidden preheader, signature (14px mono, `accent`), title (28px, 24px narrow, 600, line height 1.2), calendar date (14px sans, `text-muted`, es-AR with short month, e.g. “26 nov 2026”), optional excerpt (16px/1.6), one action, `divider`, footer.
- Subject: “Nuevo post en el blog — {title}”. Preheader: the excerpt, or the title without one. Action label: “Leer artículo”.
- Action: a table cell with `accent` background and 14px 24px padding around a link with `on-accent` 16px 600 text, 5px radius. Use an Outlook-safe construction; the 44px height MUST be verified per client. Clients that ignore radius show a rectangle.
- Footer (14px or more, `text-muted`): “Recibís este aviso porque te suscribiste al blog.” followed by an underlined “Darme de baja” link in `accent`. Declare `lang="es"`.
- No images are required for meaning. No background images or gradients.

### Open Graph

- Canvas exactly 1200×630, one version per article, fixed light theme: `canvas` background, `text` title.
- Title sizes (84, 75, 62px), weight 600, line height 1.08 and the four-line maximum are the approved initial reference; they MUST be validated visually when the generator is updated, and any change needs approval.
- Top rule: 36px `accent`, full width. Side padding 96px. All text inside x 96–1104 and y 84–546.
- Content, left aligned, its block centered between y 84 and 546 (center y 315): signature (Mono 38px, `accent`), 48px gap, title (SemiBold, tracking -0.03em, line height 1.08).
- No excerpt, tags, secondary column, gradients or decoration.

## Elevation & Depth

Flat. Hierarchy comes from background contrast, rules and type.

## Shapes

Only the 5px email action is rounded. Rules are straight.

## Components

### Variable content

| Case                           | Email                                                                         | Open Graph                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Long title                     | Full title, wraps.                                                            | First preset that fits without splitting words: 84px (≤2 lines), 75px (≤3), 62px (≤4). Otherwise stay at 62px, split any word wider than the line, and cut at a word boundary with “…” on line 4. Last resort: if there is no word boundary to cut at (the first word alone exceeds the four lines), cut between graphemes, never inside one, so that “…” fits within line 4. |
| Unbreakable word or URL        | `overflow-wrap: anywhere` and `word-break: break-word`.                       | At 62px only, break between graphemes.                                                                                                                                                                                                                                                                                                                                        |
| Accents and special characters | UTF-8; escape all HTML and attribute values.                                  | NFC normalization; segment by graphemes (`Intl.Segmenter`); escape XML.                                                                                                                                                                                                                                                                                                       |
| Glyph not covered (e.g. emoji) | Left to the client.                                                           | Treatment not fixed by this revision. A grapheme is covered when the packaged font maps all its code points (joiners and variation selectors aside). The solution MUST be deterministic and preserve the meaning of the title; silently dropping glyphs is not accepted as final. Alternatives MUST be evaluated and one approved before the generator changes.               |
| Missing excerpt or date        | Remove the block with its spacing.                                            | Not shown.                                                                                                                                                                                                                                                                                                                                                                    |
| Tags                           | Not shown.                                                                    | Not shown.                                                                                                                                                                                                                                                                                                                                                                    |
| Date                           | Format the calendar date in UTC so the day never shifts; omit an invalid one. | —                                                                                                                                                                                                                                                                                                                                                                             |

### Interactive states

The only control is the email action, which is a link, not a button. It follows the source link semantics; email offers no reliable interactive CSS.

| State         | Applies | Reason or treatment                                                                           |
| ------------- | ------- | --------------------------------------------------------------------------------------------- |
| Default       | yes     | `accent` / `on-accent` (light #5B5F8F / #FCFCFE, dark #B7B8EE / #141A24), no border, no icon. |
| Hover         | n/a     | Not reliable across clients; the client may add its own.                                      |
| Focus-visible | native  | Left to the client’s native link focus, which MUST NOT be suppressed.                         |
| Active        | n/a     | Same limitation.                                                                              |
| Disabled      | n/a     | A sent message always offers its link.                                                        |
| Loading       | n/a     | No script runs in email.                                                                      |
| Selected      | n/a     | Navigation has no persistent selection.                                                       |

### Text version and other messages

- MUST send a plain-text part with the same title, date, excerpt, article URL and unsubscribe URL.
- The internal contact notification stays plain text.

### Client limitations

- Light is the base design. MUST declare `color-scheme`; a `prefers-color-scheme: dark` block with the dark tokens MAY be added. Clients may ignore it or recolor the message, so legibility MUST NOT depend on either.
- No flexbox, grid, `clamp`, container queries, CSS variables or external CSS.
- SHOULD keep the HTML under 100KB to avoid clipping.
- MUST keep existing unsubscribe links working.
- Preview checks do not prove client support; verify in real Gmail and Outlook before claiming compatibility.

### Deterministic rendering

- The same input MUST produce the same image with the pinned renderer and packaged fonts: no system fonts, network, clock, locale defaults or randomness.
- Line fitting MUST measure with the packaged font metrics, not character counts.
- MUST keep existing object keys and public URLs. The image alternative text belongs to the frontend.
- MUST review each reference at 1200×630, 300×157 (title lines readable, signature recognizable) and 160×84 (title lines distinct and top rule visible; the signature need not be readable).
- A visual change MUST update render references deliberately and record the accepted differences.

## Differences from the source

| Difference                                                    | Reason                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Signature “Matias Galeano · Blog técnico”                     | Defined here for email and image; the source does not define it.             |
| Email date in sans (web: Mono recommended for dates)          | Approved decision.                                                           |
| System fonts in email                                         | Web fonts are unreliable in clients.                                         |
| 4px email and 36px image top rules (web: 3px)                 | Adaptation per medium; the image must read as a thumbnail.                   |
| Outer `surface` around a `canvas` letter                      | Frames the letter where the client controls the page.                        |
| Light base in email; fixed light image                        | Client and social platforms control the theme.                               |
| Truncation allowed in the image only                          | Fixed canvas; the full title remains on the page.                            |
| The email action has no custom Hover, Active or focus styling | Clients do not support them reliably; the source defines them for web links. |
| No tags                                                       | Derived: they add no action and compete with the title.                      |

## Value origin

Colors and typefaces come from the source. The signature belongs to this adaptation and comes from the approved composition. Approved: fixed light image, sans email date, preheader taken from the excerpt, and as initial reference the 84/75/62px title presets, weight 600, line height 1.08 and four-line limit. From the approved composition: email top rule, letter framing, 28px title, 5px action, image top rule and 96px padding. Derived for robustness: tracking -0.03em, safe area, 600px width, remaining email sizes and spacing, title as preheader without excerpt, date wording and omission of tags.

## Do's and Don'ts

- **Do** update the source system first when a visual decision changes.
- **Don’t** define new colors, typefaces or identity elements here.
- **Don’t** add dependencies or a shared design package to apply this document.
