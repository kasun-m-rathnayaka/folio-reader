namespace Folio.Domain.Entities;

/// <summary>
/// Many-to-many join relationship between Book and Tag.
/// </summary>
public class BookTag
{
    public Guid BookId { get; set; }
    public Book Book { get; set; } = null!;

    public Guid TagId { get; set; }
    public Tag Tag { get; set; } = null!;

    public DateTimeOffset AddedAt { get; set; } = DateTimeOffset.UtcNow;
}

