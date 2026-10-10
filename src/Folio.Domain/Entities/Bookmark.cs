using Folio.Domain.Common;
using Folio.Domain.Enums;

namespace Folio.Domain.Entities;

/// <summary>
/// Represents a dog-ear or named bookmark anchored to a page (FR-BKM-01..03).
/// </summary>
public class Bookmark : BaseEntity
{
    public Guid BookId { get; set; }

    /// <summary>
    /// Zero-based page index.
    /// </summary>
    public int PageIndex { get; set; }

    /// <summary>
    /// Optional user label or chapter name for the bookmark.
    /// </summary>
    public string? Label { get; set; }

    /// <summary>
    /// Ribbon / marker color.
    /// </summary>
    public HighlightColor? Color { get; set; }

    /// <summary>
    /// True if this is a dog-ear fold on the page corner.
    /// </summary>
    public bool IsDogEar { get; set; }

    // Navigation property
    public Book? Book { get; set; }
}
