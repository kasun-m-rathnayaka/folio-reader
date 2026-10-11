using Folio.Application.AI;
using Folio.Application.Study;
using Folio.Domain.Study;
using Xunit;

namespace Folio.Infrastructure.Tests;

public class StudyToolsTests
{
    [Fact]
    public void Sm2_InitialReviewPass_SetsIntervalToOneDay()
    {
        var now = DateTimeOffset.UtcNow;
        var result = Sm2Algorithm.Calculate(
            quality: 4,
            currentRepetitions: 0,
            currentEasinessFactor: 2.5,
            currentIntervalDays: 0,
            reviewTime: now);

        Assert.Equal(1, result.Repetitions);
        Assert.Equal(1, result.IntervalDays);
        Assert.True(result.EasinessFactor >= 2.5);
        Assert.Equal(now.AddDays(1), result.NextReviewDate);
    }

    [Fact]
    public void Sm2_SecondReviewPass_SetsIntervalToSixDays()
    {
        var now = DateTimeOffset.UtcNow;
        var result = Sm2Algorithm.Calculate(
            quality: 4,
            currentRepetitions: 1,
            currentEasinessFactor: 2.5,
            currentIntervalDays: 1,
            reviewTime: now);

        Assert.Equal(2, result.Repetitions);
        Assert.Equal(6, result.IntervalDays);
        Assert.Equal(now.AddDays(6), result.NextReviewDate);
    }

    [Fact]
    public void Sm2_FailedReview_ResetsToZeroRepetitions()
    {
        var now = DateTimeOffset.UtcNow;
        var result = Sm2Algorithm.Calculate(
            quality: 1, // Wrong
            currentRepetitions: 4,
            currentEasinessFactor: 2.5,
            currentIntervalDays: 15,
            reviewTime: now);

        Assert.Equal(0, result.Repetitions);
        Assert.Equal(1, result.IntervalDays);
        Assert.Equal(now.AddDays(1), result.NextReviewDate);
    }

    [Fact]
    public void Sm2_EasinessFactor_NeverDropsBelowMinimumFloor()
    {
        double ef = 1.35;
        for (int i = 0; i < 5; i++)
        {
            var result = Sm2Algorithm.Calculate(quality: 0, currentRepetitions: 0, currentEasinessFactor: ef, currentIntervalDays: 1);
            ef = result.EasinessFactor;
        }

        Assert.True(ef >= 1.3);
    }

    [Fact]
    public async Task StudyService_CreatesAndReviewsFlashcard()
    {
        var repo = new InMemoryStudyRepository();
        var ai = new TestAiService();
        var service = new StudyService(repo, ai);

        var bookId = Guid.NewGuid();
        var card = await service.GenerateFlashcardFromAnnotationAsync(
            bookId, null, "Entropy always increases in an isolated system.", "Second Law of Thermodynamics");

        Assert.NotNull(card);
        Assert.Equal(0, card.RepetitionNumber);
        Assert.Equal(2.5, card.EasinessFactor);

        // Review card with score 5
        var reviewed = await service.ReviewFlashcardAsync(card.Id, 5);
        Assert.Equal(1, reviewed.RepetitionNumber);
        Assert.Equal(1, reviewed.IntervalDays);
        Assert.True(reviewed.EasinessFactor >= 2.5);
    }

    private class InMemoryStudyRepository : IStudyRepository
    {
        private readonly List<Flashcard> _flashcards = new();
        private readonly List<ChapterSummary> _summaries = new();
        private readonly List<VocabularyItem> _vocab = new();

        public Task<ChapterSummary?> GetChapterSummaryAsync(Guid bookId, string chapterTitle) =>
            Task.FromResult(_summaries.FirstOrDefault(s => s.BookId == bookId && s.ChapterTitle == chapterTitle));

        public Task<IReadOnlyList<ChapterSummary>> GetSummariesForBookAsync(Guid bookId) =>
            Task.FromResult((IReadOnlyList<ChapterSummary>)_summaries.Where(s => s.BookId == bookId).ToList());

        public Task SaveChapterSummaryAsync(ChapterSummary summary)
        {
            _summaries.RemoveAll(s => s.Id == summary.Id);
            _summaries.Add(summary);
            return Task.CompletedTask;
        }

        public Task<Flashcard?> GetFlashcardAsync(Guid cardId) =>
            Task.FromResult(_flashcards.FirstOrDefault(c => c.Id == cardId));

        public Task<IReadOnlyList<Flashcard>> GetFlashcardsForBookAsync(Guid bookId) =>
            Task.FromResult((IReadOnlyList<Flashcard>)_flashcards.Where(c => c.BookId == bookId).ToList());

        public Task<IReadOnlyList<Flashcard>> GetDueFlashcardsAsync(Guid? bookId = null) =>
            Task.FromResult((IReadOnlyList<Flashcard>)_flashcards.Where(c => c.IsDue).ToList());

        public Task SaveFlashcardAsync(Flashcard flashcard)
        {
            _flashcards.RemoveAll(c => c.Id == flashcard.Id);
            _flashcards.Add(flashcard);
            return Task.CompletedTask;
        }

        public Task DeleteFlashcardAsync(Guid cardId)
        {
            _flashcards.RemoveAll(c => c.Id == cardId);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<VocabularyItem>> GetVocabularyForBookAsync(Guid bookId) =>
            Task.FromResult((IReadOnlyList<VocabularyItem>)_vocab.Where(v => v.BookId == bookId).ToList());

        public Task<IReadOnlyList<VocabularyItem>> GetAllVocabularyAsync() =>
            Task.FromResult((IReadOnlyList<VocabularyItem>)_vocab.ToList());

        public Task SaveVocabularyItemAsync(VocabularyItem item)
        {
            _vocab.RemoveAll(v => v.Id == item.Id);
            _vocab.Add(item);
            return Task.CompletedTask;
        }

        public Task DeleteVocabularyItemAsync(Guid itemId)
        {
            _vocab.RemoveAll(v => v.Id == itemId);
            return Task.CompletedTask;
        }
    }

    private class TestAiService : ILocalAiService
    {
        public Task<string> CompletePromptAsync(string systemPrompt, string userPrompt, double temperature = 0.2, int maxTokens = 512, CancellationToken ct = default) =>
            Task.FromResult("Front: What principle states entropy increases?\nBack: Second Law of Thermodynamics");

        public Task<string> DefineAndExplainAsync(string wordOrPhrase, string surroundingContext, CancellationToken ct = default) =>
            Task.FromResult("Definition: Test definition");

        public Task<string> DescribeFigureAsync(string base64Image, string caption, CancellationToken ct = default) =>
            Task.FromResult("Figure description");

        public Task<string> SmartCleanupAsync(string rawText, CancellationToken ct = default) =>
            Task.FromResult(rawText);
    }
}
