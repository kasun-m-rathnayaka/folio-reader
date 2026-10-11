using Folio.Domain.Study;

namespace Folio.Application.Study;

public interface IStudyRepository
{
    // Chapter Summaries
    Task<ChapterSummary?> GetChapterSummaryAsync(Guid bookId, string chapterTitle);
    Task<IReadOnlyList<ChapterSummary>> GetSummariesForBookAsync(Guid bookId);
    Task SaveChapterSummaryAsync(ChapterSummary summary);

    // Flashcards
    Task<Flashcard?> GetFlashcardAsync(Guid cardId);
    Task<IReadOnlyList<Flashcard>> GetFlashcardsForBookAsync(Guid bookId);
    Task<IReadOnlyList<Flashcard>> GetDueFlashcardsAsync(Guid? bookId = null);
    Task SaveFlashcardAsync(Flashcard flashcard);
    Task DeleteFlashcardAsync(Guid cardId);

    // Vocabulary
    Task<IReadOnlyList<VocabularyItem>> GetVocabularyForBookAsync(Guid bookId);
    Task<IReadOnlyList<VocabularyItem>> GetAllVocabularyAsync();
    Task SaveVocabularyItemAsync(VocabularyItem item);
    Task DeleteVocabularyItemAsync(Guid itemId);
}
