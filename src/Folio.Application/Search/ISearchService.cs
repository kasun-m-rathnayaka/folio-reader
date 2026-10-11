namespace Folio.Application.Search;

public enum SearchResultType
{
    BookTitle = 0,
    PageText = 1,
    Annotation = 2,
    Bookmark = 3,
    Tag = 4
}

public record SearchResultDto(
    Guid BookId,
    string BookTitle,
    string Author,
    int PageIndex,
    string Snippet,
    SearchResultType Type,
    double Rank = 1.0);

public interface ISearchService
{
    Task<IReadOnlyList<SearchResultDto>> SearchLibraryAsync(string query, CancellationToken ct = default);
}
