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
    /// Leading context (~32 chars) for fuzzy re-anchoring across layout/OCR updates (§8.5).
    /// </summary>
    public string? AnchorPrefix { get; set; }

    /// <summary>
    /// Trailing context (~32 chars) for fuzzy re-anchoring across layout/OCR updates (§8.5).
    /// </summary>
    public string? AnchorSuffix { get; set; }

    /// <summary>
    /// 0-based character offset within canonical page text.
    /// </summary>
    public int? CharacterOffset { get; set; }

    /// <summary>
    /// Version of the extraction engine that produced this anchor.
    /// </summary>
    public int ExtractorVersion { get; set; } = 1;

    /// <summary>
    /// True if the text span could not be re-anchored and requires manual relocation.
    /// </summary>
    public bool IsDetached { get; set; }

    /// <summary>
    /// Optional user comment or markdown marginalia note.
    /// </summary>
    public string? Note { get; set; }

    /// <summary>
    /// Optional comma-separated tags (e.g. "quote,research").
    /// </summary>
    public string? Tags { get; set; }

    // Navigation property
    public Book? Book { get; set; }
}

