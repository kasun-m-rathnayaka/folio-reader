using Folio.Domain.Study;

namespace Folio.Application.Study;

public record StudyStatsDto(int TotalFlashcards, int DueFlashcards, int MasteredCards, int TotalVocabulary);

public interface IStudyService
{
    Task<ChapterSummary> GetOrGenerateChapterSummaryAsync(
        Guid bookId,
        string chapterTitle,
        int startPage,
        int endPage,
        string chapterText,
        CancellationToken ct = default);

    Task<string> GetReturnRecapAsync(
        Guid bookId,
        string bookTitle,
        int lastPageIndex,
        string recentPageText,
        IReadOnlyList<string> recentNotes,
        CancellationToken ct = default);

    Task<Flashcard> GenerateFlashcardFromAnnotationAsync(
        Guid bookId,
        Guid? annotationId,
        string quote,
        string? note,
        CancellationToken ct = default);

    Task<Flashcard> ReviewFlashcardAsync(Guid cardId, int qualityRating);

    Task<VocabularyItem> AddVocabularyAsync(
        Guid bookId,
        int pageIndex,
        string word,
        string context,
        string definition);

    Task<StudyStatsDto> GetStudyStatsAsync(Guid? bookId = null);
}
