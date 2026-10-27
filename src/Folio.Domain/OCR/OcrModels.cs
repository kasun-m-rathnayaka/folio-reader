using Folio.Domain.Geometry;

namespace Folio.Domain.OCR;

public record OcrWord(string Text, NormalizedRect Rect, double Confidence = 1.0);

public record OcrPageResult(
    int PageIndex,
    string FullText,
    IReadOnlyList<OcrWord> Words,
    bool IsScan);
