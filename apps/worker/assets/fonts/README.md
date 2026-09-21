# Quote PDF font

Noto Sans CJK SC Regular is bundled so PDFKit can embed Chinese glyphs without depending on host fonts or runtime network access. The worker uses the same asset from `src` in development and `dist` after compilation. Container builds must copy `apps/worker/assets` alongside `dist`.

- Source: https://github.com/notofonts/noto-cjk/tree/main/Sans/OTF/SimplifiedChinese
- Download: https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
- License: SIL Open Font License 1.1, see `OFL.txt` (from the upstream `Sans/LICENSE`).
- Downloaded: 2026-09-21
- SHA-256: `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`

Keep the font and license together when distributing the worker. PDFKit embeds a subset of used glyphs in each PDF.
