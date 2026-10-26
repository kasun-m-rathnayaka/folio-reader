# Folio

A local Windows PDF library and reader built with .NET 10, WPF, Blazor Hybrid, PDF.js, and SQLite.

The current recovery release focuses on the library, comfortable reading, position memory, bookmarks, annotations, and Notebook. OCR, reflow, narration, and AI study tools remain later milestones.

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
