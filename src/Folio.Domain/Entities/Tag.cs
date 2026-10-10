using Folio.Domain.Common;

namespace Folio.Domain.Entities;

/// <summary>
/// User tag applied to books for flexible categorization.
/// </summary>
public class Tag : BaseEntity
{
    public string Name { get; set; } = string.Empty;

    public string? ColorHex { get; set; }

    // Navigation property
    public ICollection<BookTag> BookTags { get; set; } = new List<BookTag>();
}
