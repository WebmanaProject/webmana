# Webmana — Landing Page Plan (webmana.dev)

A clean, modern, professional marketing page for the project's home at **webmana.dev**.
**Light theme** with **cyan/green accents** (primary `#00FFAA`).

## Brand & positioning

- **Name:** Webmana (from *web manager*).
- **Tagline:** "Your domains. One pane of glass."
- **Sub-tagline:** "Self-hosted dashboard + MCP server that brings uptime, SSL, performance,
  security, and cost for all your projects into one place — and hands it to your AI."
- **Audience voice:** speaks to **solo founders running many domains**. Calm, technical,
  no-nonsense. Emphasize self-hosted, open-source, AI-native.

## Color system

`#00FFAA` is vivid and reads well as a *fill/glow/accent*, but it has poor contrast as text
on white. So split it into roles:

| Token              | Hex        | Use                                                        |
|--------------------|------------|------------------------------------------------------------|
| `accent`           | `#00FFAA`  | Buttons, highlights, glows, chart accents, focus rings     |
| `accent-strong`    | `#00B37A`  | Accent **text** / links on light bg (meets WCAG contrast)  |
| `accent-ink`       | `#04261C`  | Text placed *on top of* an `accent` fill                   |
| `bg`               | `#FFFFFF`  | Page background                                            |
| `bg-subtle`        | `#F6FAF8`  | Alternating section background (faint mint tint)           |
| `surface`          | `#FFFFFF`  | Cards                                                       |
| `border`           | `#E4EBE8`  | Card/hairline borders                                      |
| `text`             | `#0B1F1A`  | Headings / body                                            |
| `text-muted`       | `#5B6B66`  | Secondary text                                             |

- **Gradients/glow:** subtle radial glow `from #00FFAA/25% to transparent` behind the hero
  product shot; thin `#00FFAA` top-border accents on feature cards.
- **Buttons:** primary = `accent` fill + `accent-ink` text; secondary = `surface` + `border`
  + `accent-strong` text.
- Always use `accent-strong` (not `#00FFAA`) for any colored **text** to stay readable.

## Typography

- Headings: a modern geometric sans (e.g. Inter / Geist / Satoshi).
- Body: Inter.
- Code/labels: a mono (e.g. Geist Mono / JetBrains Mono) — reinforces the dev audience.

## Page sections (top → bottom)

1. **Nav bar** — logo, links (Features, Connectors, MCP, Docs, GitHub), `★ Star on GitHub`
   count, primary CTA "Get started".
2. **Hero** — tagline + sub-tagline, two CTAs ("Deploy with Docker" / "View on GitHub"),
   and a product screenshot/mockup of the dashboard with the cyan glow behind it.
   A one-line copyable command: `docker compose up`.
3. **Trust strip** — "100% self-hosted · Open source (AGPL) · AI-native (MCP)" with small icons.
4. **Problem → solution** — short narrative: scattered tabs (Cloudflare, GA, uptime, SSL…)
   → one pane of glass.
5. **Feature grid** — cards: Single pane of glass · Health score · Uptime & SLA · SSL/WHOIS/DNS
   (no keys needed) · Performance (PageSpeed) · Security posture · FinOps · Alerting.
   Each card: icon, title, one sentence; thin `accent` top border on hover.
6. **MCP section** (hero feature) — "Plug your AI into your infrastructure." Show a Cursor/MCP
   snippet connecting to Webmana over stdio and HTTP/SSE; bullet the read-only tools.
7. **Connectors** — logo wall of supported + planned connectors, with a "Build your own"
   note linking to the connector SDK (Apache-2.0).
8. **Self-hosting** — three-step: 1) clone, 2) set `.env`, 3) `docker compose up`. Reassure on
   data ownership and isolation.
9. **Open-source / community** — AGPL app + Apache SDK explanation, DCO, contribute CTA,
   GitHub stars/issues.
10. **Final CTA** — repeat "Deploy in minutes" with the Docker command + GitHub button.
11. **Footer** — links, license, webmana.dev, social, "Made for solo founders."

## Visual style notes

- Generous whitespace, soft shadows, rounded-2xl cards, hairline borders.
- Subtle mint-tinted section alternation (`bg` ↔ `bg-subtle`).
- Accent used sparingly: CTAs, the hero glow, hover borders, chart lines in the mockup.
- Dark-mode variant is a fast follow (invert bg to near-black, keep `#00FFAA` as accent —
  it pops on dark, which is a nice bonus for the dev crowd).
- Implementation: same stack as the app (Next.js + Tailwind + shadcn/ui) so tokens are shared.

## Accessibility

- Body/heading contrast ≥ WCAG AA against white.
- Never use raw `#00FFAA` for body text or small text on white — use `accent-strong`.
- Visible focus rings (`accent`), respects `prefers-reduced-motion` for the glow/animations.
