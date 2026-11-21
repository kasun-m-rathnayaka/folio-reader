using Folio.Domain.Entities;

namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Turns a book's stored PDF and cover into URLs the web view can load. Desktop maps the managed folders to the
/// <c>folio.books</c> and <c>folio.covers</c> virtual hosts; the browser creates blob URLs from private file storage.
/// </summary>
public interface IBookUrlResolver
{
    /// <summary>Returns a URL for the book's PDF, or null when the stored file is missing.</summary>
    ValueTask<string?> GetBookUrlAsync(Book book, CancellationToken cancellationToken = default);

    /// <summary>Returns a URL for the book's cover image, or null when it has none.</summary>
    ValueTask<string?> GetCoverUrlAsync(Book book, CancellationToken cancellationToken = default);

    /// <summary>Releases a URL from <see cref="GetBookUrlAsync"/> once the reader closes.</summary>
    ValueTask ReleaseBookUrlAsync(Book book);
}
