using Folio.Domain.Geometry;

namespace Folio.Domain.OCR;

public record OcrWord(string Text, NormalizedRect Rect, double Confidence = 1.0);

public record OcrPageResult(
    int PageIndex,
    string FullText,
    IReadOnlyList<OcrWord> Words,
    bool IsScan);

public enum ReflowBlockKind
{
    Heading1 = 0,
    Heading2 = 1,
    Heading3 = 2,
    Paragraph = 3,
    Quote = 4,
    Code = 5,
    ListItem = 6
}

public record ReflowBlock(
    ReflowBlockKind Kind,
    string Text,
    int PageIndex,
    int GlobalCharOffset);

public record ReflowDocument(
    Guid BookId,
    IReadOnlyList<ReflowBlock> Blocks,
    int TotalWords);
