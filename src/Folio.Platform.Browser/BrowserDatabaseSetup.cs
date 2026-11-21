using Folio.Application.Common.Interfaces;
using Folio.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using SqliteWasmBlazor;

namespace Folio.Platform.Browser;

/// <summary>
/// Starts the SQLite worker on OPFS (SqliteWasmBlazor), then runs Folio's own versioned migrations — the same steps the
/// desktop runs on its database file. Must run after the first render (a SqliteWasmBlazor requirement).
/// </summary>
public sealed class BrowserDatabaseSetup(ISqliteWasmInitializer sqlite, OpfsFileStore files, BrowserJs js, IServiceScopeFactory scopes, BrowserBatteryMonitor battery) : IDatabaseSetup
{
    private Task? _initialization;

    public Task InitializeAsync(CancellationToken cancellationToken = default) => _initialization ??= RunAsync(cancellationToken);

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        await files.InitializeAsync();
        await sqlite.InitializeAsync(cancellationToken);
        await new MigratingDatabaseSetup(scopes).InitializeAsync(cancellationToken);
        // Ask the browser not to evict the library under storage pressure (WEB-4). Best effort.
        await js.InvokeAsync<bool>("requestPersistence");
        await battery.StartAsync();
    }
}

/// <summary>OPFS sync-access-handle storage cannot use WAL; keep foreign keys and the busy timeout.</summary>
public sealed class BrowserSqliteConnectionInterceptor : SqliteConnectionInterceptor
{
    protected override string PragmaCommands => "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;";
}

/// <summary>Capabilities of the browser host.</summary>
public sealed record BrowserPlatformCapabilities() : IPlatformCapabilities
{
    public bool IsBrowser => true;
    public bool CanImportFolders => true;
    public bool CanRelinkBooks => false;
    public bool SupportsCommandLineImport => false;
    public bool SupportsLibraryBackup => true;
}
