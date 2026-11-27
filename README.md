# LinkMap — GNU Linker Script

Syntax highlighting, outline symbols, size hover, and snippets for GNU Linker Scripts (`.ld`, `.lds`, `.ldscript`).

## Features

- **Syntax highlighting** — `MEMORY`, `SECTIONS`, `ENTRY`, `PROVIDE`, `ASSERT`, `KEEP`, `ALIGN`, `ORIGIN`/`LENGTH`, memory attributes (`(rx)`, `(rwx)`), section names (`.text`, `.data`, `.bss`, `.isr_vector`), location counter `.`, `> REGION` / `AT> REGION`, hex/binary/size literals (`0x4000`, `256K`), and `/* ... */` / `//` / `#` comments.
- **Outline & Breadcrumbs (`Ctrl+Shift+O`)** — navigate `ENTRY`, `MEMORY` regions, `SECTIONS` output sections, and top-level symbol assignments.
- **Smart Hover** — hover over any hex or `K`/`M`/`G` size literal (e.g. `0x0003E000` or `256K`) to see its exact byte and KiB/MiB value, or hover over directives (`KEEP`, `AT`, `NOLOAD`, `PROVIDE`, etc.) for quick documentation.
- **Snippets** — `entry`, `memory`, `sections`, `sec`, `data_at`, `bss`, `provide`, `assert`.
- **Editor integration** — bracket matching, auto-closing pairs, `/* */` comment toggling, and `#region`/`#endregion` folding.

## Companion Extension

Inspect the resulting `.hex`, `.srec`, and `.bin` build artifacts with **[HexMap — Hex Viewer](https://marketplace.visualstudio.com/items?itemName=MohamedHakeem.hexmap-viewer)**.

## Building from source

```sh
npm install
npm run compile
```

Package an OPC-compliant `.vsix`:

```powershell
.\make_vsix.ps1
```

## License

MIT — see [LICENSE](LICENSE).
