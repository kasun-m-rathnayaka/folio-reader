using Folio.Domain.Enums;

namespace Folio.Application.Reading.DTOs;

/// <summary>
/// Data transfer object representing the saved viewport position and zoom state.
/// </summary>
public class ReadingPositionDto
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
    /// Viewport zoom multiplier (1.0 = 100%).
    /// </summary>
    public double Zoom { get; set; } = 1.0;

    /// <summary>
    /// Layout view mode.
    /// </summary>
    public ReaderViewMode ViewMode { get; set; } = ReaderViewMode.Continuous;

    /// <summary>
    /// Active reading duration in seconds.
    /// </summary>
    public long ActiveReadingSeconds { get; set; }
}

