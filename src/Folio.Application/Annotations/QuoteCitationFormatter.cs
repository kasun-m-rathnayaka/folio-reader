namespace Folio.Application.Annotations;

public static class QuoteCitationFormatter
{
    public static string Format(string quote, string bookTitle, string? author, int pageIndex)
    {
        string authorText = !string.IsNullOrWhiteSpace(author) ? $"{author}, " : string.Empty;
        return $"\"{quote.Trim()}\" — {authorText}{bookTitle} (p. {pageIndex + 1})";
    }
}
