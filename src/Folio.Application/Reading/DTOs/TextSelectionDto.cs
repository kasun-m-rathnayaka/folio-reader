using Folio.Domain.Geometry;

namespace Folio.Application.Reading.DTOs;

/// <summary>
/// Event payload for user text selection inside the PDF viewport.
/// </summary>
public class TextSelectionDto
{
    public int PageIndex { get; set; }

    public string SelectedText { get; set; } = string.Empty;

    public List<NormalizedRect> Rects { get; set; } = new();
}
