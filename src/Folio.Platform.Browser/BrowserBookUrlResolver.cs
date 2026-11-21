using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;

namespace Folio.Platform.Browser;

/// <summary>Blob URLs for PDFs and covers stored in OPFS. Book URLs are revoked when the reader closes.</summary>
public sealed class BrowserBookUrlResolver(BrowserJs js, OpfsFileStore files) : IBookUrlResolver
{
    public async ValueTask<string?> GetBookUrlAsync(Book book, CancellationToken cancellationToken = default) =>
        files.BookExists(book.Sha256) ? await js.InvokeAsync<string?>("bookUrl", files.Relative(files.GetBookPath(book.Sha256))) : null;

    public async ValueTask<string?> GetCoverUrlAsync(Book book, CancellationToken cancellationToken = default) =>
        string.IsNullOrWhiteSpace(book.CoverPath) ? null : await js.InvokeAsync<string?>("coverUrl", files.Relative(files.GetCoverPath(book.Sha256)));

    public ValueTask ReleaseBookUrlAsync(Book book) => js.InvokeVoidAsync("revokeUrl", files.Relative(files.GetBookPath(book.Sha256)));
}
