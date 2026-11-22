using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;

namespace Folio.Platform.Windows;

/// <summary>
/// Serves managed PDFs and covers through the WebView2 virtual hosts mapped in the desktop shell (ADR-005).
/// </summary>
public sealed class VirtualHostBookUrlResolver : IBookUrlResolver
{
    public const string BooksHost = "folio.books";
    public const string CoversHost = "folio.covers";

    public ValueTask<string?> GetBookUrlAsync(Book book, CancellationToken cancellationToken = default) =>
        ValueTask.FromResult(File.Exists(book.FilePath) ? BookUrl(book.Sha256) : null);

    public ValueTask<string?> GetCoverUrlAsync(Book book, CancellationToken cancellationToken = default) =>
        ValueTask.FromResult(CoverUrl(book.CoverPath));

    public ValueTask ReleaseBookUrlAsync(Book book) => ValueTask.CompletedTask;

    internal static string BookUrl(string sha256) => $"https://{BooksHost}/{sha256.ToLowerInvariant()}.pdf";

    internal static string? CoverUrl(string? coverPath) => string.IsNullOrWhiteSpace(coverPath)
        ? null
        : $"https://{CoversHost}/{Uri.EscapeDataString(Path.GetFileName(coverPath))}";
}
