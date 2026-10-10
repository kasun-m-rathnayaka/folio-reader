namespace Folio.Domain.Enums;

/// <summary>
/// Type of annotation created on a PDF page.
/// </summary>
public enum AnnotationType
{
    Highlight = 0,
    Underline = 1,
    Strike = 2,
    MarginNote = 3,
    Freehand = 4
}
