namespace Folio.Domain.Study;

/// <summary>
/// Domain model for cached chapter summaries (FR-AIS-01).
/// </summary>
public class ChapterSummary
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BookId { get; set; }
    public string ChapterTitle { get; set; } = string.Empty;
    public int StartPageIndex { get; set; }
    public int EndPageIndex { get; set; }
    public string SummaryMarkdown { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Domain entity representing a study flashcard governed by the SuperMemo SM-2 algorithm (FR-AIS-05, 06).
/// </summary>
public class Flashcard
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BookId { get; set; }
    public Guid? AnnotationId { get; set; }
    public string Front { get; set; } = string.Empty;
    public string Back { get; set; } = string.Empty;
    public int RepetitionNumber { get; set; } = 0;
    public double EasinessFactor { get; set; } = 2.5;
    public int IntervalDays { get; set; } = 0;
    public DateTimeOffset NextReviewDate { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastReviewedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public bool IsDue => DateTimeOffset.UtcNow >= NextReviewDate;
}

/// <summary>
/// Saved vocabulary item with definition and in-context usage excerpt (FR-AIS-04).
/// </summary>
public class VocabularyItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BookId { get; set; }
    public int PageIndex { get; set; }
    public string Word { get; set; } = string.Empty;
    public string Definition { get; set; } = string.Empty;
    public string ContextSnippet { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
