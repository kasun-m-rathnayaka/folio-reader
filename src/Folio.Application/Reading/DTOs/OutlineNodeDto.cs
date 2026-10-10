namespace Folio.Application.Reading.DTOs;

/// <summary>
/// Hierarchical node representing a Table of Contents entry in a PDF outline.
/// </summary>
public class OutlineNodeDto
{
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Zero-based target page index.
    /// </summary>
    public int PageIndex { get; set; }

    /// <summary>
    /// Optional named destination or fragment identifier.
    /// </summary>
    public string? Destination { get; set; }

    /// <summary>
    /// Nested outline children.
    /// </summary>
    public List<OutlineNodeDto> Children { get; set; } = new();
}
