using Folio.Application.AI;
using Folio.Domain.Study;

namespace Folio.Application.Study;

public class StudyService : IStudyService
{
    private readonly IStudyRepository _repository;
    private readonly ILocalAiService _aiService;

    public StudyService(IStudyRepository repository, ILocalAiService aiService)
    {
        _repository = repository;
        _aiService = aiService;
    }

    public async Task<ChapterSummary> GetOrGenerateChapterSummaryAsync(
        Guid bookId,
        string chapterTitle,
        int startPage,
        int endPage,
        string chapterText,
        CancellationToken ct = default)
    {
        // 1. Check database cache
        var cached = await _repository.GetChapterSummaryAsync(bookId, chapterTitle);
        if (cached != null)
        {
            return cached;
        }

        // 2. Generate summary via Local AI
        string systemPrompt = "You are an analytical reading tutor. Provide: 1) A concise 2-sentence executive summary. 2) 3 to 5 bulleted key arguments or takeaways. Format with Markdown.";
        string excerpt = chapterText.Length > 4000 ? chapterText[..4000] : chapterText;
        string userPrompt = $"Chapter: \"{chapterTitle}\" (Pages {startPage + 1}–{endPage + 1})\n\n{excerpt}";

        string aiSummary = await _aiService.CompletePromptAsync(systemPrompt, userPrompt, temperature: 0.3, maxTokens: 400, ct);

        if (string.IsNullOrWhiteSpace(aiSummary))
        {
            aiSummary = $"### {chapterTitle}\n\n* Executive summary: Chapter covers pages {startPage + 1} through {endPage + 1}.\n* Key topics explored in this section of the text.\n* Review your highlights and notes in this range for specific details.";
        }

        var summary = new ChapterSummary
        {
            BookId = bookId,
            ChapterTitle = chapterTitle,
            StartPageIndex = startPage,
            EndPageIndex = endPage,
            SummaryMarkdown = aiSummary,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await _repository.SaveChapterSummaryAsync(summary);
        return summary;
    }

    public async Task<string> GetReturnRecapAsync(
        Guid bookId,
        string bookTitle,
        int lastPageIndex,
        string recentPageText,
        IReadOnlyList<string> recentNotes,
        CancellationToken ct = default)
    {
        string systemPrompt = "You are a warm reading companion. The user has returned to reading this book after an absence. Provide an engaging 2-sentence recap reminding them where they were in the book and what concept was being explored.";
        string notesContext = recentNotes.Count > 0 ? $"Recent notes: {string.Join("; ", recentNotes)}" : "No recent notes.";
        string excerpt = recentPageText.Length > 1500 ? recentPageText[..1500] : recentPageText;
        string userPrompt = $"Book: \"{bookTitle}\"\nPage: {lastPageIndex + 1}\n{notesContext}\nExcerpt:\n{excerpt}";

        string recap = await _aiService.CompletePromptAsync(systemPrompt, userPrompt, temperature: 0.3, maxTokens: 150, ct);
        if (!string.IsNullOrWhiteSpace(recap))
        {
            return recap;
        }

        return $"Welcome back to **{bookTitle}**! You were previously reading on page {lastPageIndex + 1}. Continue your journey right where you left off.";
    }

    public async Task<Flashcard> GenerateFlashcardFromAnnotationAsync(
        Guid bookId,
        Guid? annotationId,
        string quote,
        string? note,
        CancellationToken ct = default)
    {
        string systemPrompt = "You are a study card generator. Given a highlighted quote and an optional reader note, create a high-yield study flashcard.\nOutput format:\nFront: <Question testing the key idea>\nBack: <Concise, direct answer based on the quote>";
        string userPrompt = $"Quote: \"{quote}\"\nReader Note: \"{note ?? "None"}\"";

        string generated = await _aiService.CompletePromptAsync(systemPrompt, userPrompt, temperature: 0.2, maxTokens: 200, ct);

        string front = $"What is the significance of: \"{quote.Trim()}\"?";
        string back = !string.IsNullOrWhiteSpace(note) ? note.Trim() : quote.Trim();

        if (!string.IsNullOrWhiteSpace(generated))
        {
            var lines = generated.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            string? foundFront = null;
            string? foundBack = null;

            foreach (var line in lines)
            {
                if (line.StartsWith("Front:", StringComparison.OrdinalIgnoreCase))
                {
                    foundFront = line["Front:".Length..].Trim();
                }
                else if (line.StartsWith("Back:", StringComparison.OrdinalIgnoreCase))
                {
                    foundBack = line["Back:".Length..].Trim();
                }
            }

            if (!string.IsNullOrWhiteSpace(foundFront) && !string.IsNullOrWhiteSpace(foundBack))
            {
                front = foundFront;
                back = foundBack;
            }
        }

        var flashcard = new Flashcard
        {
            BookId = bookId,
            AnnotationId = annotationId,
            Front = front,
            Back = back,
            RepetitionNumber = 0,
            EasinessFactor = Sm2Algorithm.DefaultEasinessFactor,
            IntervalDays = 0,
            NextReviewDate = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await _repository.SaveFlashcardAsync(flashcard);
        return flashcard;
    }

    public async Task<Flashcard> ReviewFlashcardAsync(Guid cardId, int qualityRating)
    {
        var card = await _repository.GetFlashcardAsync(cardId)
            ?? throw new ArgumentException($"Flashcard {cardId} not found.");

        var result = Sm2Algorithm.Calculate(
            qualityRating,
            card.RepetitionNumber,
            card.EasinessFactor,
            card.IntervalDays,
            DateTimeOffset.UtcNow);

        card.RepetitionNumber = result.Repetitions;
        card.EasinessFactor = result.EasinessFactor;
        card.IntervalDays = result.IntervalDays;
        card.NextReviewDate = result.NextReviewDate;
        card.LastReviewedAt = DateTimeOffset.UtcNow;

        await _repository.SaveFlashcardAsync(card);
        return card;
    }

    public async Task<VocabularyItem> AddVocabularyAsync(
        Guid bookId,
        int pageIndex,
        string word,
        string context,
        string definition)
    {
        var item = new VocabularyItem
        {
            BookId = bookId,
            PageIndex = pageIndex,
            Word = word.Trim(),
            ContextSnippet = context.Trim(),
            Definition = definition.Trim(),
            CreatedAt = DateTimeOffset.UtcNow
        };

        await _repository.SaveVocabularyItemAsync(item);
        return item;
    }

    public async Task<StudyStatsDto> GetStudyStatsAsync(Guid? bookId = null)
    {
        var cards = bookId.HasValue
            ? await _repository.GetFlashcardsForBookAsync(bookId.Value)
            : await _repository.GetDueFlashcardsAsync(null);

        var vocab = bookId.HasValue
            ? await _repository.GetVocabularyForBookAsync(bookId.Value)
            : await _repository.GetAllVocabularyAsync();

        int total = cards.Count;
        int due = cards.Count(c => c.IsDue);
        int mastered = cards.Count(c => c.RepetitionNumber >= 3 && c.EasinessFactor >= 2.5);

        return new StudyStatsDto(total, due, mastered, vocab.Count);
    }
}
