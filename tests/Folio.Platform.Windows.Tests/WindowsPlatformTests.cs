using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Platform.Windows.Tests;

public class WindowsPlatformTests
{
    [Fact]
    public void WindowsPlatform_ReplacesNeutralDefaults()
    {
        var root = Path.Combine(Path.GetTempPath(), "FolioWindowsPlatform_" + Guid.NewGuid().ToString("N"));
        try
        {
            var services = new ServiceCollection(); services.AddLogging();
            services.AddFolioInfrastructure(o => o.RootDirectory = root).AddFolioWindowsPlatform();
            using var provider = services.BuildServiceProvider();
            Assert.IsType<WindowsBatteryMonitor>(provider.GetRequiredService<IBatteryMonitor>());
            Assert.IsType<WinRtPdfRasterizer>(provider.GetRequiredService<IPdfRasterizer>());
            Assert.IsType<VirtualHostBookUrlResolver>(provider.GetRequiredService<IBookUrlResolver>());
            Assert.False(provider.GetRequiredService<IPlatformCapabilities>().IsBrowser);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public async Task VirtualHosts_MatchTheDesktopShellMappings()
    {
        var resolver = new VirtualHostBookUrlResolver();
        var book = new Book { Sha256 = new string('A', 64), FilePath = Path.Combine(Path.GetTempPath(), "missing-" + Guid.NewGuid() + ".pdf"), CoverPath = @"C:\covers\x y.webp" };
        Assert.Null(await resolver.GetBookUrlAsync(book));
        Assert.Equal("https://folio.covers/x%20y.webp", await resolver.GetCoverUrlAsync(book));
        Assert.Equal($"https://folio.books/{new string('a', 64)}.pdf", VirtualHostBookUrlResolver.BookUrl(book.Sha256));
    }

    [Fact]
    public async Task WinRtRasterizer_RendersTheFirstFixturePage()
    {
        string fixtures = Fixtures();
        var output = Path.Combine(Path.GetTempPath(), $"folio-cover-{Guid.NewGuid():N}.png");
        try
        {
            await new WinRtPdfRasterizer().RenderPageToImageAsync(Path.Combine(fixtures, "01_single_column_book_300p.pdf"), 0, output, 72, 300);
            Assert.True(new FileInfo(output).Length > 0);
        }
        finally { File.Delete(output); }
    }

    private static string Fixtures()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
        {
            var fixtures = Path.Combine(directory.FullName, "fixtures", "pdf");
            if (Directory.Exists(fixtures)) return fixtures;
        }
        throw new DirectoryNotFoundException("The PDF regression fixtures were not found.");
    }
}
