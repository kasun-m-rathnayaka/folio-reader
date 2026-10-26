using Folio.Domain.OCR;

namespace Folio.Application.Common.Interfaces;

public record DocumentTextPage(int PageIndex, string Text, IReadOnlyList<Folio.Domain.OCR.OcrWord> Words, bool IsOcr);
public record TextIndexProgress(string BookTitle, int Page, int Total);
public interface IDocumentTextService
{
    Task<DocumentTextPage> GetPageAsync(Guid bookId, int pageIndex, CancellationToken ct = default);
    Task IndexBookAsync(Guid bookId, IProgress<TextIndexProgress>? progress = null, CancellationToken ct = default);
    Task IndexLibraryAsync(IProgress<TextIndexProgress>? progress = null, CancellationToken ct = default);
}
