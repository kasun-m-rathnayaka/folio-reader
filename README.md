# Folio

A local Windows PDF library and reader built with .NET 10, WPF, Blazor Hybrid, PDF.js, and SQLite.

Folio includes a personal PDF library, bookmarks, annotations, Notebook, shelf management, recursive folder/drag-and-drop import, permanent Trash deletion, and search inside PDFs. Scanned pages use Windows OCR for selectable text and search.

Reflow, read-aloud, notebook export, and AI study tools are not included. Existing library data and notes remain compatible.

## Library and reading tools

- Use **Manage shelves** beside the Shelves heading to rename, reorder, or delete shelves. Removing a shelf keeps its books and notes.
- Use **Import folder**, drop PDFs/folders onto Folio, or select **Add books**. Folder imports include nested folders and skip duplicate PDFs.
- Type in library search and press **Enter** to search PDF contents, titles, notes, and bookmarks. The first search builds a local text cache with progress and cancellation; later searches reuse it. PDFs that cannot be indexed are listed separately.
- In **Trash**, use a book's menu to delete it permanently, or **Empty Trash** to delete all trashed books. Both actions ask for confirmation. Imported source files are kept.
- Open the reader's **…** menu for the **Notebook**, PDF layout controls, and focus mode. Notes and highlights stay local; selected quotes can be copied with a citation.
- OCR runs locally when a scanned page is opened or indexed. Recognition quality depends on scan quality and installed Windows OCR language support. Original PDFs are never rewritten.

## Run

Requires Windows 11 x64, the .NET 10 SDK for development, and WebView2 Runtime.

```powershell
dotnet build Folio.sln -m:1
dotnet run --project src/Folio.Desktop
```

Data defaults to `%LocalAppData%\Folio`. To use a separate development library:

```powershell
dotnet run --project src/Folio.Desktop -- --data-root "D:\Folio-Test-Library"
```

PDF paths passed as file arguments are imported. A published executable can also read an adjacent `folio-profile.json` containing `{"DataRoot":"D:/Folio-Test-Library"}`. Command-line configuration takes precedence. Keep that file out of a normal release package to use the default personal library.

## Verify

```powershell
dotnet test tests/Folio.Domain.Tests
dotnet test tests/Folio.Infrastructure.Tests
dotnet test tests/Folio.Desktop.Tests
npm --prefix src/Folio.UI ci --ignore-scripts
npm --prefix src/Folio.UI run check
npm --prefix src/Folio.UI test
npm --prefix src/Folio.UI run test:reader
```

Reader integration tests use installed Microsoft Edge in headless mode, an HTTP server bound only to loopback, and repository fixtures. They write results and engine screenshots into `.artifacts/reader-tests`. Development browser tests require Node 24; normal application use does not require Node.

```powershell
dotnet publish src/Folio.Desktop -c Release --self-contained false -o .artifacts/release
```

The resulting folder needs the .NET 10 Desktop Runtime and WebView2 on the destination machine. A public installer and the full specification's performance/accessibility qualification are separate release gates.

Read [how the application works](docs/how-folio-works.md), the [verification record](docs/verification/README.md), and the [product specification](docs/Folio-PDF-Reader-Spec.md).
