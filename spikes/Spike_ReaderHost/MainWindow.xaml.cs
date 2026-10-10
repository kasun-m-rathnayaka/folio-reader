using System;
using System.IO;
using System.Windows;
using Microsoft.AspNetCore.Components.WebView.Wpf;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Web.WebView2.Core;

namespace Spike_ReaderHost;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();

        var services = new ServiceCollection();
        services.AddWpfBlazorWebView();
#if DEBUG
        services.AddBlazorWebViewDeveloperTools();
#endif
        blazorWebView.Services = services.BuildServiceProvider();

        blazorWebView.BlazorWebViewInitialized += (sender, e) =>
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string p1 = Path.GetFullPath(Path.Combine(baseDir, @"..\..\..\..\fixtures\pdf"));
                string p2 = Path.GetFullPath(@"fixtures\pdf");
                string fixturesDir = Directory.Exists(p1) ? p1 : (Directory.Exists(p2) ? p2 : p1);

                File.AppendAllText("spike_log.txt", $"Mapping https://folio.books/ to {fixturesDir} (Exists: {Directory.Exists(fixturesDir)})\n");
                Console.WriteLine($"[Spike S1] Mapping https://folio.books/ to {fixturesDir}");

                // Virtual host mapping to local fixtures folder with Allow permissions
                e.WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "folio.books",
                    fixturesDir,
                    CoreWebView2HostResourceAccessKind.Allow
                );

                // Security settings
                e.WebView.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
                e.WebView.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;

                e.WebView.CoreWebView2.WebMessageReceived += (s, args) =>
                {
                    File.AppendAllText("spike_js_log.txt", $"{args.TryGetWebMessageAsString()}\n");
                };
            }
            catch (Exception ex)
            {
                File.AppendAllText("spike_log.txt", $"Exception in BlazorWebViewInitialized: {ex}\n");
            }
        };
    }
}
