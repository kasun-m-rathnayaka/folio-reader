using Folio.Domain.Geometry;

namespace Folio.Domain.Audio;

public enum TextBlockKind
{
    Paragraph = 0,
    Heading = 1,
    List = 2,
    Caption = 3,
    Footnote = 4,
    Header = 5,
    Footer = 6,
    PageNumber = 7,
    TocEntry = 8,
    Code = 9,
    FigureRegion = 10,
    TableRegion = 11
}

/// <summary>
/// Represents an atomic sentence segmented for TTS narration, highlighting, and audio follow-along (FR-TTS-01..05).
/// </summary>
public record SentenceSpoken
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public int PageIndex { get; init; }
    public string OriginalText { get; init; } = string.Empty;
    public string SpokenText { get; init; } = string.Empty;
    public TextBlockKind Kind { get; init; } = TextBlockKind.Paragraph;
    public IReadOnlyList<NormalizedRect> Rects { get; init; } = Array.Empty<NormalizedRect>();
    public int CharacterOffset { get; init; }
    public bool ShouldSkip { get; init; }
    public double EstimatedDurationSeconds { get; init; }
}

public record PronunciationRule(string Pattern, string Replacement, bool IsRegex = false);
