using Folio.Domain.Geometry;

namespace Folio.Application.Common.Interfaces;

public record OcrWord(string Text, NormalizedRect Bounds);
public record OcrLine(string Text, NormalizedRect Bounds, IReadOnlyList<OcrWord> Words);
public record OcrResult(IReadOnlyList<OcrLine> Lines, string FullText);

/// <summary>
/// Port for optical character recognition on scanned PDF pages (e.g. WinRT Windows.Media.Ocr).
/// </summary>
public interface IOcrEngine
{
    Task<OcrResult> RecognizeImageAsync(string imagePath, CancellationToken cancellationToken = default);
}
