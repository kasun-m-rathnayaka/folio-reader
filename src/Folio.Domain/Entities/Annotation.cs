using Folio.Domain.Common;
using Folio.Domain.Enums;

namespace Folio.Domain.Entities;

/// <summary>
/// Represents a user annotation (highlight, underline, strike, marginalia note, or freehand)
/// anchored to normalized page space coordinates (FR-ANN-01..10).
/// </summary>
public class Annotation : BaseEntity
{
    public Guid BookId { get; set; }

    /// <summary>
    /// Zero-based page index.
    /// </summary>
    public int PageIndex { get; set; }

    public AnnotationType Type { get; set; } = AnnotationType.Highlight;

    public HighlightColor Color { get; set; } = HighlightColor.Yellow;

    /// <summary>
    /// JSON serialized array of NormalizedRect coordinates in visible page space [0.0, 1.0].
    /// </summary>
    public string RectsJson { get; set; } = "[]";

    /// <summary>
    /// The exact text span covered by the annotation.
    /// </summary>
    public string? SelectedText { get; set; }

    /// <summary>
    /// Optional user comment or markdown marginalia note.
    /// </summary>
    public string? Note { get; set; }

    // Navigation property
    public Book? Book { get; set; }
}
