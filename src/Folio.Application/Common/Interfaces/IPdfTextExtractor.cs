using Folio.Domain.Geometry;

namespace Folio.Application.Common.Interfaces;

public record ExtractedMetadata(
    string? Title,
    string? Author,
    int PageCount,
    DateTimeOffset? CreationDate);

public record ExtractedWord(
    string Text,
    NormalizedRect Bounds);

public record ExtractedLine(
    string Text,
    NormalizedRect Bounds,
    IReadOnlyList<ExtractedWord> Words);

public record ExtractedPage(
    int PageIndex,
    PageDimensions Dimensions,
    IReadOnlyList<ExtractedLine> Lines,
    string PlainText);

/// <summary>
/// Port for canonical text extraction, running header/footer exclusion, and layout de-interleaving.
/// </summary>
public interface IPdfTextExtractor
{
    Task<ExtractedMetadata> ExtractMetadataAsync(string pdfPath, CancellationToken cancellationToken = default);
    Task<ExtractedPage> ExtractPageAsync(string pdfPath, int pageIndex, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ExtractedPage>> ExtractAllPagesAsync(string pdfPath, IProgress<double>? progress = null, CancellationToken cancellationToken = default);
}
