using Folio.Domain.OCR;

namespace Folio.Application.OCR;

public interface IOcrService
{
    Task<bool> IsScannedPageAsync(string pdfPath, int pageIndex);
    Task<OcrPageResult> RecognizePageAsync(string pdfPath, int pageIndex, CancellationToken ct = default);
}
