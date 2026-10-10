using System.IO;
using System.Windows;
using Folio.Application.Common.Interfaces;
using Microsoft.Web.WebView2.Core;

namespace Folio.Desktop;

/// <summary>
/// Native WPF shell hosting BlazorWebView with virtual host streaming for pdf.js (ADR-005).
/// </summary>
public partial class MainWindow : Window
{
    public MainWindow(IServiceProvider services, IFileStore fileStore)
    {
        InitializeComponent();

        blazorWebView.Services = services;

        blazorWebView.BlazorWebViewInitialized += (sender, e) =>
        {
            try
            {
                // Virtual host mapping to managed books folder with Allow permissions (ADR-005)
                e.WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "folio.books",
                    fileStore.BooksDirectory,
                    CoreWebView2HostResourceAccessKind.Allow);

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