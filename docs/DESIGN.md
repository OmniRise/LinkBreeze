# LinkBreeze Design System

This document defines the visual language for LinkBreeze's admin interface.
Every component, page, and contribution must follow these rules.

**Public pages** (the user-facing `/{slug}` route) are user-themed and override
these tokens via CSS variables — they are NOT bound by this system.

---

## 1. Design Philosophy

LinkBreeze's admin is a **dark aurora glass UI**. The visual identity is:

- **Aurora background**: animated violet/lavender gradient blobs behind every screen
- **Glass panels**: semi-transparent cards with backdrop-blur and subtle lavender borders
- **Calm, confident spacing**: generous whitespace, no cramped layouts
- **Two fonts**: Clash Display for headings (geometric, modern), Satoshi for body (warm, readable)
- **Motion is rare and purposeful**: aurora drift (ambient), card hover (interactive), aurora-rise (entrance)

The admin is always dark. There is no light mode and no plan for one.

---

## 2. Color Tokens

### Brand Palette (CSS variables in `globals.css`)

| Token | Value | Used for |
|---|---|---|
| `--background` | `#0a0820` | App background (behind aurora) |
| `--foreground` | `#eceafe` | Default text |
| `--card` | `rgba(20, 17, 46, 0.6)` | Glass card background |
| `--popover` | `#1b1738` | Dropdowns, menus |
| `--primary` | `#533fd6` | Primary actions, buttons |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--secondary` | `#1b1738` | Secondary surfaces |
| `--muted` | `#1b1738` | Muted backgrounds |
| `--muted-foreground` | `#b7b1e6` | Labels, hints, secondary text |
| `--accent` | `#261f4d` | Hover states, active nav |
| `--border` | `rgba(167, 139, 250, 0.12)` | All borders |
| `--input` | `rgba(167, 139, 250, 0.16)` | Input borders |
| `--ring` | `#a78bfa` | Focus rings |

### Semantic Feedback Tokens

| Token | Value | Used for |
|---|---|---|
| `--destructive` | `oklch(0.62 0.22 25)` | Errors, delete actions |
| `--success` | `oklch(0.65 0.17 150)` | Success messages, confirmations |
| `--warning` | `oklch(0.72 0.15 75)` | Warnings, default-page star |

### Brand Accent Scale (use via Tailwind classes)

| Class | Value | Usage |
|---|---|---|
| `bg-violet / text-violet` | `#533fd6` | Same as `--primary` — use for brand fills |
| `bg-violet-bright` | `#7c3aed` | Hover accents, gradients |
| `text-lavender` | `#a78bfa` | Brand accent text (links, icons, active states) |
| `text-lavender-soft` | `#c4b5fd` | Lighter accent variant |

### Rules

1. **Never use raw Tailwind colors** (`text-green-500`, `text-red-400`, `text-amber-400`).
   Use the semantic tokens: `text-success`, `text-destructive`, `text-warning`.
2. **Lavender is brand accent, not success.** Use `text-success` for confirmations.
3. **Border opacity is locked**: use `border-border` (the token). For accent borders,
   use `border-lavender/12` (subtle) or `border-violet/30` (emphasis). Do not invent
   new opacity values.
4. **Background tints**: `bg-violet/15` for active/hover, `bg-violet/10` for subtle hints.
   Two values, no others.

---

## 3. Spacing Scale

All spacing must use one of these 5 steps. No exceptions.

| Token | Tailwind | Pixels | Use |
|---|---|---|---|
| **xs** | `gap-1` / `p-1` | 4px | Icon gaps, tight clusters |
| **sm** | `gap-2` / `p-2` | 8px | Label → input, button icon gaps |
| **md** | `gap-3` / `p-3` | 12px | Between form fields, card sections |
| **lg** | `gap-4` / `p-4` | 16px | Between cards, main content padding |
| **xl** | `gap-6` / `p-6` | 24px | Card header ↔ content, major sections |

### Rules

1. **Form fields use `gap-2` (8px)** between label and input. This is enforced by the
   `FormField` component — do not hand-roll `<div className="flex flex-col gap-2">`.
2. **Card content uses `gap-4` (16px)** between fields (the `CardContent` default).
3. **Main content uses `p-4` (mobile) / `p-8` (desktop)** — set in the admin layout.
4. **Never use `gap-5`, `gap-7`, `mb-3`, `mb-5`** or other off-scale values.
   If you need more space, jump to the next token up.

---

## 4. Typography

### Font Families

| Token | Family | Weights | Used for |
|---|---|---|---|
| `--font-heading` | Clash Display | 500, 600, 700 | Card titles, page headings, logo |
| `--font-sans` | Satoshi | 400, 500, 700 | All body text, labels, buttons |
| `--font-mono` | Geist Mono | 400 | Code, URLs in hints |

### Type Scale

| Class | Size | Used for |
|---|---|---|
| `text-xs` | 12px | Labels, hints, badges, timestamps |
| `text-sm` | 14px | Body text, input values, button labels |
| `text-base` | 16px | Rare — only when `text-sm` feels too small |
| `text-lg` | 18px | Card titles (via `CardTitle` component) |
| `text-xl` | 20px | Section headings in dashboards |
| `text-2xl` | 24px | Page titles |

### Rules

1. **Body text is always `text-sm`** unless there's a specific reason otherwise.
2. **Labels and hints are always `text-xs`** with `text-muted-foreground` for hints.
3. **Headings use `font-heading`** — this is set by `CardTitle` automatically.
   For standalone headings, add `className="font-heading"`.
4. **Public page fonts** are separate — 9 families loaded via `next/font/google`
   and applied via `--lb-font-*` variables by the theme system.

---

## 5. Component Conventions

### FormField (required for all admin forms)

```tsx
import { FormField } from "@/components/ui/form-field";

<FormField label="Page slug" htmlFor="slug" hint="Your page lives at /your-slug">
  <Input id="slug" name="slug" defaultValue={slug} required />
</FormField>
```

- Label, spacing, and hint are handled by the component.
- Do not wrap Label + Input in a raw `<div>` — use `FormField`.
- For fields with a prefix (like the `/` before a slug), use `FormField` with
  a flex row inside: `<FormField label="..."><div className="flex items-center gap-2">...</div></FormField>`

### Cards

- `CardContent` uses `gap-4` between fields by default.
- Card titles: `CardTitle` renders at `text-base font-heading` automatically.
- Card descriptions: `CardDescription` renders at `text-sm text-muted-foreground`.
- Use `size="sm"` for compact cards (settings sub-sections).

### Buttons

- Default size (`h-8`) for form submit buttons and primary actions.
- `size="sm"` (`h-7`) for secondary actions inside cards.
- `size="icon"` / `size="icon-sm"` for icon-only buttons.
- Form submit buttons go in `CardFooter` or at the end of the form, right-aligned.
- Destructive actions use `variant="destructive"`.

### Inputs

- Height: `h-8` (locked in the Input component).
- Border radius: `rounded-lg` (locked in the Input component).
- Focus state: `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`.

---

## 6. Border Radius

| Token | Value | Tailwind | Used for |
|---|---|---|---|
| `--radius-sm` | `0.525rem` | `rounded-md` | Small elements (badges, chips) |
| `--radius-md` | `0.7rem` | `rounded-lg` | Inputs, buttons (the default) |
| `--radius-lg` | `0.875rem` | `rounded-xl` | Cards, dialogs |
| `--radius-full` | `9999px` | `rounded-full` | Avatars, pills |

Base `--radius: 0.875rem`. All other radii are derived via multipliers.

---

## 7. Motion

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Aurora blobs | `aurora-drift` | 24s / 30s | ease-in-out, infinite |
| Entrances | `aurora-rise` | 0.5s | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Card hover | border/shadow transition | 0.2s | default |
| Link card hover | lift/scale/glow | 0.18s | ease |
| Nav hover | `translate-x-0.5` | default | default |

### Rules

1. **`prefers-reduced-motion: reduce`** disables ALL animations. Test with this.
2. No spring physics, no bounce, no stagger beyond what exists.
3. Transitions are for hover/focus state changes only — no decorative animation.
4. The aurora background is the only ambient animation.

---

## 8. Accessibility

1. **Focus rings**: every interactive element shows `focus-visible:ring-3` with
   `ring-ring/50`. Never remove `outline-none` without replacing it.
2. **Contrast**: `--foreground` (#eceafe) on `--background` (#0a0820) = 14.5:1 (AAA).
   `--muted-foreground` (#b7b1e6) on `--card` = 7.2:1 (AAA).
3. **Touch targets**: minimum 32px (`size-8`). Mobile tab bar items are 48px tall.
4. **Labels**: every input has a `<Label htmlFor>` pointing to its `id`.
5. **Icons-only buttons**: must have `aria-label`.
6. **Color is never the only signal**: success/error states include text, not just color.

---

## 9. Iconography

- Library: `lucide-react`
- Default size: `size-4` (16px) inline, `size-5` (20px) for feature icons
- Button icons: automatically sized via Button's `[&_svg]:size-4` rule
- Do not mix icon libraries

---

## 10. File Structure

```
src/components/ui/         # Primitives (Input, Button, Card, FormField, Label, ...)
src/components/admin/      # Admin-specific composites (MigrationWizard, AdminNav, ...)
src/components/aurora/     # Background atmosphere
src/components/public/     # Public page components (user-themed, override tokens)
src/app/(admin)/           # Admin routes (always dark aurora)
src/app/(public)/          # Public routes (user-themed)
src/app/globals.css        # All CSS variables, aurora classes, base styles
```

---

## Changelog

- 2026-07-27: Initial Design.md. Added `--success`, `--warning` tokens. Created `FormField` component.
