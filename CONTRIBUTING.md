# contributing to webtag

thanks for wanting to help improve webtag! everything here runs locally in the browser with astro, react, and typescript.

## getting started

```bash
pnpm install
pnpm dev      # starts local dev server at http://localhost:4321
pnpm check    # runs astro check and tsc --noEmit
pnpm build    # builds static output into dist/
```

## project layout & style

- **filenames**: use camelCase for files (`webtagApp.tsx`, `metadataEditor.tsx`, `randomMetadata.ts`, `baseLayout.astro`).
- **ui copy & titles**: keep all ui text, labels, headings, toasts, and notices all-lowercase (never alter user file names or actual metadata values).
- **comments**: only add comments that explain *how* or *why* non-obvious logic works, and write them in all-lowercase. skip decorative banners or comments that just restate code.
- **icons & fonts**: use filled `material symbols outlined` via `<Icon name="..." />` from `@/design`, with `google sans flex` (`ROND 100` for headings/controls) and `cascadia code` for monospace values.
- **privacy**: never add external uploads, tracking, or server dependencies for file inspection or editing. every parser and writer must run client-side.

## how to add a new file format

1. create or update a parser/writer in `src/lib/` that returns normalized `TrackMetadata`, `formatRecords`, `tech`, and optional `coverArt`.
2. register the format in `src/lib/universalMetadata.ts` with `registerFormatHandler(...)`:

```ts
import { registerFormatHandler } from "@/lib/registry";
import { createEmptyMetadata } from "@/lib/types";

registerFormatHandler({
  id: "my-format",
  label: "my format (.myf)",
  category: "image", // "audio" | "image" | "document" | "app" | "other"
  extensions: ["myf"],
  standards: "custom header, xmp",
  capabilities: "edit + strip",
  notes: "client-side binary parser",
  detect: (buf) => buf.length >= 4 && buf[0] === 0x4d && buf[1] === 0x59,
  read: (buffer) => ({
    fileKind: "image",
    metadata: createEmptyMetadata(),
    formatRecords: {},
    coverArt: null,
    mimeType: "image/x-myf",
    tech: {
      format: "MYF",
      codec: "MYF",
      container: "MYF",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 8,
      isLossless: true,
    },
  }),
  write: ({ buffer }) => buffer,
});
```

3. once registered, the editor, batch tools, and reference modal (`formatsModal.tsx`) pick it up automatically.
4. if the format needs custom fields or shouldn't show irrelevant fields (like gps/camera on apps), update `src/components/metadataEditor.tsx` and `getRandomGroupConfig` in `src/lib/randomMetadata.ts`.

## how to add cities or spoof presets

add a tuple to `CITY_DATA` in `src/lib/randomMetadata.ts`:

```ts
["city-id", "City Name", "cc", "State / Region", "Country", lat, lon, "p", ["Street 1", "Street 2", "Street 3"]]
```

- street format codes: `"p"` (`123 Main St`), `"s"` (`Main St 123`), `"j"` (`2-14-8 District`).
- keep coordinates accurate to the city center and verify street names are realistic.

## how to add batch actions or editor tools

- add pure transform functions in `src/lib/batchActions.ts` (avoid mutating input `TrackItem` objects directly so undo/redo snapshots stay intact).
- wire the ui tab or button in `src/components/batchToolsModal.tsx` and register a shortcut in `paletteCommands` inside `src/components/webtagApp.tsx`.

## ai-assisted contribution guidelines

ai coding tools are welcome as long as you stay responsible for every line you submit:

- **disclose ai usage**: briefly mention in your pr description if ai tools helped write or refactor the change.
- **review and understand your diff**: don't open drive-by prs with code you haven't read. remove leftover comments, unused helpers, or unrelated edits.
- **test with real files**: verify parsing, editing, stripping, and re-exporting on actual sample files in a real browser — don't rely on type checks alone.
- **match the codebase**: follow camelCase filenames, lowercase ui copy, minimal intentional animations, and zero external dependencies where native browser apis work.
- **keep prs focused**: one feature, format, or bug fix per pull request.

## pull request checklist

- [ ] `pnpm check` passes with 0 errors and 0 warnings
- [ ] `pnpm build` succeeds cleanly
- [ ] tested in the browser with real sample files (edit, strip, and download/export)
- [ ] no unrelated formatting changes or leftover debug code
- [ ] new ui text and explanatory comments are lowercase
