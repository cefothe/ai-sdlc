---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/tokens/**"
  - "**/theme/**"
  - "**/design-system/**"
  - "**/figma/**"
---

# Figma MCP Workflow

Shared rules for all agents working with the Figma MCP server. Platform-specific agents (Android, iOS, Flutter, Web) extend these with their own conversion and token architecture rules.

## Tool Order

The Figma MCP server exposes these tools. Use them in the correct order:

1. **`get_metadata`** — Start here. Returns an XML tree of node IDs and names. Use this to discover all variant IDs when a component has many variants (e.g., `Type=primary, State=default, Size=default, Shape=round`). Required when `get_design_context` returns sparse metadata due to size.
2. **`get_variable_defs`** — **Source of truth for token values.** Returns Figma variable names and resolved values as JSON. Call this per variant node to extract colors, spacing, sizing, radius, typography, and state tokens. Always trust these values over anything in the generated code.
3. **`get_design_context`** — Returns generated React+Tailwind code for a node. Use this to understand layout structure (padding, alignment, content slots, icon positions). The code MUST be translated to the target platform's native framework — never use it as-is. Extract CSS variable references (e.g., `var(--semantics\/padding\/inset-md,16px)`) to identify which Figma tokens are used where.
4. **`get_screenshot`** — Returns a visual screenshot. Use for visual verification after implementation.

**Other MCP tools** (`get_code_connect_map`, `add_code_connect_map`, `send_code_connect_mappings`, `get_code_connect_suggestions`, `create_design_system_rules`, `get_figjam`) are not part of the standard design-to-code workflow. Use only when explicitly requested.

## Key Limitations

- **Single node only**: `get_variable_defs` and `get_screenshot` fail with "Multiple nodes selected." Always pass a specific `nodeId`.
- **Empty output**: `get_design_context` can return empty when the Figma desktop app isn't focused on the selected node. If you get no output, ask the user to confirm the selection in Figma and retry. `get_screenshot` can work as a fallback to verify the selection is active.
- **Large components return sparse metadata**: When a component has many variants, `get_design_context` returns XML metadata instead of code with a message to call it on sublayer IDs individually.
- **Only current mode values returned**: `get_variable_defs` returns resolved values for the active Figma mode only (typically light). This does NOT mean dark mode is missing — the designer may have dark mode defined but Figma is showing light mode. To get dark mode values, ask the user to switch Figma to dark mode and re-pull. Never report dark mode as "missing" based solely on MCP output.
- **Figma variable names may contain typos**: Always verify token names before propagating them into code (e.g., Figma had `conrtol-md` instead of `control-md`).
- **Padding/spacing can differ per variant type**: Always check `get_variable_defs` for each button type separately — one type may use `inset-md = 16` while another uses `inset-sm = 8`.
- **Generated code colors are fallback values**: The CSS `var(--token-name, #fallback)` fallback hex may not match the actual resolved variable value. Always use `get_variable_defs` as the authoritative source.

## Bulk Token Extraction

MCP works node-by-node, which is ideal for individual components. For full color system extraction, Figma token JSON exports (e.g., exported via Tokens Studio or Variables REST API) give the complete picture across all modes (light/dark) in a single file. Use JSON exports to build the primitives and semantic mapping, then use MCP for per-component verification.

## Dimension Conversion (Shared)

- **Always calculate actual rendered dimensions**: When Figma gives `min-height` + padding + line-height, compute the real height: `padding-top + line-height + padding-bottom`. Use that computed value as `minHeight`, not Figma's CSS `min-height` which is just a floor constraint.
- Platform-specific unit mapping is defined in each agent's rules (dp for Android, pt for iOS, px for Web).

## Figma Color Token Architecture (Shared Layers)

Figma design systems export tokens in a layered hierarchy. All platform agents must understand this structure:

1. **Primitives** — Raw hex values. Mirror 1:1 in a dedicated file per platform. Components never reference primitives directly.
2. **Semantics** — Cross-platform meanings (Background, Brand, State, Action, Border, etc.). This shared layer lives in Figma only — do not duplicate it as an intermediate code layer.
3. **Platform Layers** — Figma defines per-platform token collections (Android, iOS, Web). Each platform token references a Semantic token. Platform coverage varies — Android is typically most complete, iOS thinner (~16 vs ~31+ tokens).
4. **Code** — Split into framework-native roles (M3 ColorScheme on Android, system colors on iOS, CSS custom properties on Web) and custom semantics for tokens with no framework equivalent.
5. **Components** — Use framework-native accessors for mapped tokens and custom semantics for everything else. Never reference primitives.

**Key rules:**
- Include traceability comments mapping platform tokens to their Figma semantic source.
- If a Figma semantic token has no corresponding platform token, include it in custom semantics with a comment noting it bypasses the platform layer.

## Cross-Platform Consistency

- **Token naming must be mirrored** across platforms: `AppColors.Primary` (Android) <-> `Color.appPrimary` (iOS), `AppSpacing.md` (Android) <-> `AppSpacing.md` (iOS).
- **Same computed dimensions**: Both platforms must arrive at the same visual height/width for equivalent components (dp on Android = pt on iOS).
- **Same disabled state approach**: opacity 0.5 on both platforms.
- **Same font sizes**: If Figma says 16px, all platforms must render at 16dp/16pt — not a "close enough" semantic font.

## Disabled States (Shared Convention)

- Use opacity 0.5 on the entire component for disabled state. This is simpler, consistent cross-platform, and avoids per-token alpha calculations.
- Always implement disabled state for interactive components (buttons, inputs) even if not shown in Figma.

## Component Catalog (Shared Structure)

- Always start with a "Theme / AppColors" section showing color swatches in a grid (~4 per row, swatch + token name label).
- Follow with a spacing tokens section if spacing tokens are defined.
- Full-screen components should be accessible via navigation (tap/link to open), not embedded inline.
