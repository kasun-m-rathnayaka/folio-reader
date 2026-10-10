namespace Folio.Domain.Entities;

/// <summary>
/// Many-to-many join relationship between Book and Shelf.
/// </summary>
public class BookShelf
{
    public Guid BookId { get; set; }
    public Book Book { get; set; } = null!;

    public Guid ShelfId { get; set; }
    public Shelf Shelf { get; set; } = null!;

    public DateTimeOffset AddedAt { get; set; } = DateTimeOffset.UtcNow;
}
