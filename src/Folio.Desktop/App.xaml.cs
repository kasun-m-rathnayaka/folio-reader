using System.Windows;
using Folio.Application;
using Folio.Application.Common.Interfaces;
using Folio.Infrastructure;
using Folio.Infrastructure.Persistence.Migrations;
using Folio.UI;
using Microsoft.AspNetCore.Components.WebView.Wpf;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MudBlazor.Services;
using Microsoft.Extensions.Logging;
using Folio.Infrastructure.Logging;

namespace Folio.Desktop;

/// <summary>
/// Main application entry point orchestrating Generic Host, DI composition, and database migrations.
/// </summary>
public partial class App : System.Windows.Application
{
    private IHost? _host;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        try { await StartAsync(e); }
        catch (Exception ex)
        {
            _host?.Services.GetService<ILogger<App>>()?.LogError(ex, "Folio could not open the library.");
            MessageBox.Show($"Folio could not open the library.\n\n{ex.Message}\n\nYour PDFs have not been changed.", "Folio", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
        }
    }

    private async Task StartAsync(StartupEventArgs e)
    {

        string? dataRoot = null;
        for (var i = 0; i < e.Args.Length - 1; i++)
            if (e.Args[i] == "--data-root") dataRoot = System.IO.Path.GetFullPath(e.Args[++i]);
        var profilePath = System.IO.Path.Combine(AppContext.BaseDirectory, "folio-profile.json");
        if (dataRoot == null && System.IO.File.Exists(profilePath))
        {
            using var profile = System.Text.Json.JsonDocument.Parse(await System.IO.File.ReadAllTextAsync(profilePath));
            if (profile.RootElement.TryGetProperty("DataRoot", out var root) && !string.IsNullOrWhiteSpace(root.GetString()))
                dataRoot = System.IO.Path.GetFullPath(root.GetString()!);
        }

        var logDirectory = System.IO.Path.Combine(dataRoot ?? System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Folio"), "logs");
        _host = Host.CreateDefaultBuilder()
            .ConfigureLogging(logging => logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning)
                .AddProvider(new LocalFileLoggerProvider(logDirectory)))
            .ConfigureServices((context, services) =>
            {
                services.AddWpfBlazorWebView();
#if DEBUG
                services.AddBlazorWebViewDeveloperTools();
#endif
                services.AddMudServices();
                services.AddFolioInfrastructure(options => options.RootDirectory = dataRoot);
                services.AddFolioApplication();
                services.AddFolioUI();
                services.AddSingleton<IFilePickerService, Folio.Desktop.Services.WpfFilePickerService>();
                services.AddSingleton<IExternalLinkService, Folio.Desktop.Services.ExternalLinkService>();

                services.AddSingleton<MainWindow>();
            })
            .Build();

        // Run versioned database migrations on startup (FR-DAT-04)
        using (var scope = _host.Services.CreateScope())
        {
            var migrator = scope.ServiceProvider.GetRequiredService<IDatabaseMigrator>();
            await migrator.MigrateAsync();
        }

        // Workers may query Jobs immediately, so schema upgrades must finish first.
        await _host.StartAsync();

        // File arguments support opening/importing PDFs and isolated verification profiles.
        var pdfPaths = e.Args.Where(arg => arg.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) && System.IO.File.Exists(arg)).ToArray();
        if (pdfPaths.Length > 0)
        {
            using var scope = _host.Services.CreateScope();
            var importer = scope.ServiceProvider.GetRequiredService<Folio.Application.Books.IBookImportService>();
            await importer.ImportFilesAsync(pdfPaths);
        }

        var mainWindow = _host.Services.GetRequiredService<MainWindow>();
        mainWindow.Show();
    }

    internal async Task StopHostAsync()
    {
        if (_host != null) await _host.StopAsync(TimeSpan.FromSeconds(3));
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _host?.Dispose();
        base.OnExit(e);
    }
}
