namespace Folio.Domain.Entities;

public class DocumentPage
{
    public Guid BookId { get; set; }
    public int PageIndex { get; set; }
    public string Text { get; set; } = "";
    public string WordsJson { get; set; } = "[]";
    public bool IsOcr { get; set; }
    public Book Book { get; set; } = null!;
}
