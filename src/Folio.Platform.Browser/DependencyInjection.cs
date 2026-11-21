using Folio.Application.Common.Interfaces;
using Folio.Infrastructure;
using Folio.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SqliteWasmBlazor;

namespace Folio.Platform.Browser;

public static class BrowserPlatformServiceCollectionExtensions
{
    public const string DatabaseName = "folio.db";

    /// <summary>Everything the shared UI needs to run in a browser: OPFS files, SQLite on OPFS, pickers, covers.</summary>
    public static IServiceCollection AddFolioBrowserPlatform(this IServiceCollection services, string baseHref = "/")
    {
        services.AddSingleton<BrowserJs>();
        services.AddSingleton<OpfsFileStore>();
        services.AddSingleton<IFileStore>(sp => sp.GetRequiredService<OpfsFileStore>());
        services.AddSingleton<IAppPreferencesService, BrowserPreferencesService>();
        services.AddSingleton<IPdfTextExtractor, BrowserPdfTextExtractor>();
        services.AddSingleton<IPdfRasterizer, PdfJsCoverRenderer>();
        services.AddSingleton<IBookUrlResolver, BrowserBookUrlResolver>();
        services.AddSingleton<BrowserFilePickerService>();
        services.AddSingleton<IFilePickerService>(sp => sp.GetRequiredService<BrowserFilePickerService>());
        services.AddSingleton<IPlatformCapabilities, BrowserPlatformCapabilities>();
        services.AddSingleton<IDatabaseSetup, BrowserDatabaseSetup>();
        services.AddSingleton<ILibraryBackupService, BrowserLibraryBackupService>();
        services.AddSingleton<BrowserBatteryMonitor>();
        services.AddSingleton<IBatteryMonitor>(sp => sp.GetRequiredService<BrowserBatteryMonitor>());

        services.AddSqliteWasm(options => options.BaseHref = baseHref);
        services.AddSingleton<BrowserSqliteConnectionInterceptor>();
        services.AddDbContextFactory<FolioDbContext>((sp, options) =>
            options.UseSqliteWasm($"Data Source={DatabaseName}")
                   .AddInterceptors(sp.GetRequiredService<BrowserSqliteConnectionInterceptor>()));

        services.AddFolioInfrastructureCore(); // TryAdd: the browser battery monitor above wins
        return services;
    }
}
