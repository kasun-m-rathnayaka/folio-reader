using Folio.Domain.Common;

namespace Folio.Domain.Entities;

/// <summary>
/// Represents a user-defined collection/shelf for organizing books (FR-LIB-04).
/// </summary>
public class Shelf : BaseEntity
{
    public string Name { get; set; } = string.Empty;

    public int SortOrder { get; set; }

    // Navigation property
    public ICollection<BookShelf> BookShelves { get; set; } = new List<BookShelf>();
}

