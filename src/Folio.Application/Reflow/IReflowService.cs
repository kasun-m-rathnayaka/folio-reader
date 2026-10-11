using Folio.Domain.OCR;

namespace Folio.Application.Reflow;

public interface IReflowService
{
    Task<ReflowDocument> BuildReflowDocumentAsync(Guid bookId, string pdfPath, CancellationToken ct = default);
    int MapReflowOffsetToPageIndex(ReflowDocument doc, int characterOffset);
    int MapPageToReflowOffset(ReflowDocument doc, int pageIndex, double offsetPercent);
}
