using System.IO;
using System.Windows;
using Folio.Application.Common.Interfaces;
using Microsoft.Web.WebView2.Core;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Folio.Desktop;

/// <summary>
/// Native WPF shell hosting BlazorWebView with virtual host streaming for pdf.js (ADR-005).
/// </summary>
public partial class MainWindow : Window
{
    private readonly Services.WindowCloseCoordinator _close;
    public MainWindow(IServiceProvider services, IFileStore fileStore, IAppPreferencesService preferences)
    {
        InitializeComponent();
        SourceInitialized += (_, _) => Services.WindowTheme.Apply(this, preferences.Current.DarkMode);

        blazorWebView.Services = services;
        _close = new Services.WindowCloseCoordinator(this, async () =>
        {
            var session = (IReadingSessionLifetime?)services.GetService(typeof(IReadingSessionLifetime));
            if (session?.SaveBeforeClose is { } save) await save();
            await ((App)System.Windows.Application.Current).StopHostAsync();
        }, ex =>
        {
            ((ILogger<MainWindow>?)services.GetService(typeof(ILogger<MainWindow>)))?.LogError(ex, "Could not flush the reader before window close.");
            MessageBox.Show("Folio could not close cleanly. Your last saved position is kept. Please try closing again.", "Folio", MessageBoxButton.OK, MessageBoxImage.Warning);
        });
        Closed += (_, _) => _close.Dispose();

        blazorWebView.BlazorWebViewInitialized += async (sender, e) =>
        {
            try
            {
                // Virtual host mapping to managed books folder with Allow permissions (ADR-005)
                e.WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "folio.books",
                    fileStore.BooksDirectory,
                    CoreWebView2HostResourceAccessKind.Allow);
                e.WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "folio.covers", fileStore.CoversDirectory, CoreWebView2HostResourceAccessKind.DenyCors);
                e.WebView.CoreWebView2.NavigationStarting += (_, navigation) =>
                {
                    if (!Uri.TryCreate(navigation.Uri, UriKind.Absolute, out var uri) ||
                        (uri.Scheme != "https" || uri.Host != "0.0.0.1")) navigation.Cancel = true;
                };
                e.WebView.CoreWebView2.NewWindowRequested += (_, request) => request.Handled = true;
                e.WebView.CoreWebView2.WebMessageReceived += (_, message) =>
                {
                    try
                    {
                        using var payload = JsonDocument.Parse(message.WebMessageAsJson);
                        if (Services.WebMessageKinds.Is(payload.RootElement, "import-drop"))
                        {
                            var paths = message.AdditionalObjects.Select(item => item switch
                            {
                                CoreWebView2File file => file.Path,
                                CoreWebView2FileSystemHandle handle => handle.Path,
                                _ => null
                            }).Where(path => !string.IsNullOrWhiteSpace(path)).Cast<string>().ToArray();
                            ((Folio.Application.Books.ImportInbox)services.GetService(typeof(Folio.Application.Books.ImportInbox))!).Add(paths);
                        }
                        if (payload.RootElement.ValueKind == JsonValueKind.Object &&
                            payload.RootElement.TryGetProperty("kind", out var messageKind) && messageKind.GetString() == "theme-changed" &&
                            payload.RootElement.TryGetProperty("darkMode", out var darkMode) &&
                            darkMode.ValueKind is JsonValueKind.True or JsonValueKind.False)
                        {
                            Services.WindowTheme.Apply(this, darkMode.GetBoolean());
                        }
                        if (payload.RootElement.ValueKind == JsonValueKind.Object &&
                            payload.RootElement.TryGetProperty("kind", out var kind) && kind.GetString() == "reader-error")
                        {
                            var logger = (ILogger<MainWindow>?)services.GetService(typeof(ILogger<MainWindow>));
                            logger?.LogError("Reader engine {Code}: {Detail}", payload.RootElement.GetProperty("code").GetString(), payload.RootElement.GetProperty("detail").GetString());
                        }
                    }
                    catch (JsonException) { }
                };
                var receiver = e.WebView.CoreWebView2.GetDevToolsProtocolEventReceiver("Runtime.exceptionThrown");
                receiver.DevToolsProtocolEventReceived += (_, details) =>
                {
                    using var payload = JsonDocument.Parse(details.ParameterObjectAsJson);
                    var exception = payload.RootElement.GetProperty("exceptionDetails");
                    var description = exception.TryGetProperty("exception", out var value) && value.TryGetProperty("description", out var text) ? text.GetString() : exception.GetProperty("text").GetString();
                    ((ILogger<MainWindow>?)services.GetService(typeof(ILogger<MainWindow>)))?.LogError("WebView runtime error: {Description}", description);
                };
                await e.WebView.CoreWebView2.CallDevToolsProtocolMethodAsync("Runtime.enable", "{}");

                e.WebView.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
                e.WebView.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to configure WebView2 virtual host: {ex}");
            }
        };
    }
}
