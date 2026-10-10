using Folio.Domain.Common;
using Folio.Domain.Enums;

namespace Folio.Domain.Entities;

/// <summary>
/// Persists the last active reading position and session telemetry for a book.
/// Auto-saved with 2-second debounce and synchronously on close/blur (FR-MEM-01..04).
/// </summary>
public class ReadingPosition : BaseEntity
{
    public Guid BookId { get; set; }

    /// <summary>
    /// Zero-based page index.
    /// </summary>
    public int PageIndex { get; set; }

    /// <summary>
    /// Vertical normalized scroll offset within the page [0.0, 1.0].
    /// </summary>
    public double OffsetPercent { get; set; }

    /// <summary>
    /// Viewport zoom multiplier (e.g. 1.0 = 100%).
    /// </summary>
    public double Zoom { get; set; } = 1.0;

    /// <summary>
    /// Layout view mode (defaults to Continuous vertical scroll).
    /// </summary>
    public ReaderViewMode ViewMode { get; set; } = ReaderViewMode.Continuous;

    /// <summary>
    /// Cumulative active reading time in seconds (pauses after 2 minutes idle).
    /// </summary>
    public long ActiveReadingSeconds { get; set; }

    // Navigation property
    public Book? Book { get; set; }
}
