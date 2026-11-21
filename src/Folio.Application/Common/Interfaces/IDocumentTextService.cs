namespace Folio.Application.Common.Interfaces;

public record DocumentTextPage(int PageIndex, string Text);
public record TextIndexProgress(string BookTitle, int Page, int Total);
public interface IDocumentTextService
{
    Task<DocumentTextPage> GetPageAsync(Guid bookId, int pageIndex, CancellationToken ct = default);
    /// <summary>Indexes every page. Returns false when the book has no text layer (for example a scanned PDF).</summary>
    Task<bool> IndexBookAsync(Guid bookId, IProgress<TextIndexProgress>? progress = null, CancellationToken ct = default);
    /// <summary>Indexes the library. Books that cannot be indexed are reported with <c>Total == 0</c>.</summary>
    Task IndexLibraryAsync(IProgress<TextIndexProgress>? progress = null, CancellationToken ct = default);
}
