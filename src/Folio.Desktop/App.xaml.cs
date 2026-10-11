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

        _host = Host.CreateDefaultBuilder()
            .ConfigureServices((context, services) =>
            {
                services.AddWpfBlazorWebView();
#if DEBUG
                services.AddBlazorWebViewDeveloperTools();
#endif
                services.AddMudServices();
                services.AddFolioInfrastructure();
                services.AddFolioApplication();
                services.AddFolioUI();
                services.AddSingleton<IFilePickerService, Folio.Desktop.Services.WpfFilePickerService>();

                services.AddSingleton<MainWindow>();
            })
            .Build();

        await _host.StartAsync();

        // Run versioned database migrations on startup (FR-DAT-04)
        using (var scope = _host.Services.CreateScope())
        {
            var migrator = scope.ServiceProvider.GetRequiredService<IDatabaseMigrator>();
            await migrator.MigrateAsync();
        }

        var mainWindow = _host.Services.GetRequiredService<MainWindow>();
        mainWindow.Show();
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        if (_host != null)
        {
            await _host.StopAsync(TimeSpan.FromSeconds(3));
            _host.Dispose();
        }
        base.OnExit(e);
    }
}
