using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of IAnnotationRepository.
/// </summary>
public class AnnotationRepository : IAnnotationRepository
{
    private readonly FolioDbContext _context;

    public AnnotationRepository(FolioDbContext context)
    {
        _context = context;
    }

    public async Task<Annotation?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Annotations.FirstOrDefaultAsync(a => a.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<Annotation>> GetByBookIdAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        return await _context.Annotations
            .Where(a => a.BookId == bookId)
            .OrderBy(a => a.PageIndex)
            .ThenBy(a => a.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Annotation>> GetByBookAndPageAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default)
    {
        return await _context.Annotations
            .Where(a => a.BookId == bookId && a.PageIndex == pageIndex)
            .OrderBy(a => a.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Annotation>> QueryAsync(
        Guid? bookId = null,
        AnnotationType? type = null,
        HighlightColor? color = null,
        string? searchText = null,
        string? tag = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Annotations.AsQueryable();

        if (bookId.HasValue)
        {
            query = query.Where(a => a.BookId == bookId.Value);
        }

        if (type.HasValue)
        {
            query = query.Where(a => a.Type == type.Value);
        }

        if (color.HasValue)
        {
            query = query.Where(a => a.Color == color.Value);
        }

        if (!string.IsNullOrWhiteSpace(searchText))
        {
            string term = searchText.Trim().ToLower();
            query = query.Where(a =>
                (a.SelectedText != null && a.SelectedText.ToLower().Contains(term)) ||
                (a.Note != null && a.Note.ToLower().Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(tag))
        {
            string cleanTag = tag.Trim().ToLower();
            query = query.Where(a => a.Tags != null && a.Tags.ToLower().Contains(cleanTag));
        }

        return await query.OrderBy(a => a.PageIndex).ThenBy(a => a.CreatedAt).ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Annotation annotation, CancellationToken cancellationToken = default)
    {
        await _context.Annotations.AddAsync(annotation, cancellationToken);
    }

    public void Update(Annotation annotation)
    {
        annotation.UpdatedAt = DateTimeOffset.UtcNow;
        _context.Annotations.Update(annotation);
    }

    public void Remove(Annotation annotation)
    {
        _context.Annotations.Remove(annotation);
    }
}
