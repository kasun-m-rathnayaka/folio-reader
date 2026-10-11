using Folio.Application.Study;
using Folio.Domain.Study;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Persistence.Repositories;

public class StudyRepository : IStudyRepository
{
    private readonly FolioDbContext _context;

    public StudyRepository(FolioDbContext context)
    {
        _context = context;
    }

    // Chapter Summaries
    public async Task<ChapterSummary?> GetChapterSummaryAsync(Guid bookId, string chapterTitle)
    {
        return await _context.ChapterSummaries
            .FirstOrDefaultAsync(s => s.BookId == bookId && s.ChapterTitle == chapterTitle);
    }

    public async Task<IReadOnlyList<ChapterSummary>> GetSummariesForBookAsync(Guid bookId)
    {
        return await _context.ChapterSummaries
            .Where(s => s.BookId == bookId)
            .OrderBy(s => s.StartPageIndex)
            .ToListAsync();
    }

    public async Task SaveChapterSummaryAsync(ChapterSummary summary)
    {
        var existing = await _context.ChapterSummaries.FindAsync(summary.Id);
        if (existing != null)
        {
            _context.Entry(existing).CurrentValues.SetValues(summary);
        }
        else
        {
            _context.ChapterSummaries.Add(summary);
        }
        await _context.SaveChangesAsync();
    }

    // Flashcards
    public async Task<Flashcard?> GetFlashcardAsync(Guid cardId)
    {
        return await _context.Flashcards.FindAsync(cardId);
    }

    public async Task<IReadOnlyList<Flashcard>> GetFlashcardsForBookAsync(Guid bookId)
    {
        return await _context.Flashcards
            .Where(f => f.BookId == bookId)
            .OrderBy(f => f.NextReviewDate)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<Flashcard>> GetDueFlashcardsAsync(Guid? bookId = null)
    {
        var now = DateTimeOffset.UtcNow;
        var query = _context.Flashcards.AsQueryable();

        if (bookId.HasValue)
        {
            query = query.Where(f => f.BookId == bookId.Value);
        }

        return await query
            .Where(f => f.NextReviewDate <= now)
            .OrderBy(f => f.NextReviewDate)
            .ToListAsync();
    }

    public async Task SaveFlashcardAsync(Flashcard flashcard)
    {
        var existing = await _context.Flashcards.FindAsync(flashcard.Id);
        if (existing != null)
        {
            _context.Entry(existing).CurrentValues.SetValues(flashcard);
        }
        else
        {
            _context.Flashcards.Add(flashcard);
        }
        await _context.SaveChangesAsync();
    }

    public async Task DeleteFlashcardAsync(Guid cardId)
    {
        var existing = await _context.Flashcards.FindAsync(cardId);
        if (existing != null)
        {
            _context.Flashcards.Remove(existing);
            await _context.SaveChangesAsync();
        }
    }

    // Vocabulary
    public async Task<IReadOnlyList<VocabularyItem>> GetVocabularyForBookAsync(Guid bookId)
    {
        return await _context.VocabularyItems
            .Where(v => v.BookId == bookId)
            .OrderByDescending(v => v.CreatedAt)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<VocabularyItem>> GetAllVocabularyAsync()
    {
        return await _context.VocabularyItems
            .OrderByDescending(v => v.CreatedAt)
            .ToListAsync();
    }

    public async Task SaveVocabularyItemAsync(VocabularyItem item)
    {
        var existing = await _context.VocabularyItems.FindAsync(item.Id);
        if (existing != null)
        {
            _context.Entry(existing).CurrentValues.SetValues(item);
        }
        else
        {
            _context.VocabularyItems.Add(item);
        }
        await _context.SaveChangesAsync();
    }

    public async Task DeleteVocabularyItemAsync(Guid itemId)
    {
        var existing = await _context.VocabularyItems.FindAsync(itemId);
        if (existing != null)
        {
            _context.VocabularyItems.Remove(existing);
            await _context.SaveChangesAsync();
        }
    }
}
