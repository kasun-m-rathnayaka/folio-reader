using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.Application.Reading;

/// <summary>
/// Implements auto-saving and restoring reading positions and active reading time (FR-MEM-01..04).
/// </summary>
public class ReadingPositionService : IReadingPositionService
{
    private readonly IReadingPositionRepository _positionRepository;
    private readonly IBookRepository _bookRepository;
    private readonly IUnitOfWork _unitOfWork;

    public ReadingPositionService(
        IReadingPositionRepository positionRepository,
        IBookRepository bookRepository,
        IUnitOfWork unitOfWork)
    {
        _positionRepository = positionRepository;
        _bookRepository = bookRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<ReadingPosition?> GetPositionAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        return await _positionRepository.GetByBookIdAsync(bookId, cancellationToken);
    }

    public async Task SavePositionAsync(
        Guid bookId,
        int pageIndex,
        double offsetPercent,
        double zoom,
        ReaderViewMode viewMode,
        long activeReadingSeconds,
        CancellationToken cancellationToken = default)
    {
        var position = await _positionRepository.GetByBookIdAsync(bookId, cancellationToken);

        if (position == null)
        {
            position = new ReadingPosition
            {
                BookId = bookId,
                PageIndex = Math.Max(0, pageIndex),
                OffsetPercent = Math.Clamp(offsetPercent, 0.0, 1.0),
                Zoom = zoom > 0 ? zoom : 1.0,
                ViewMode = viewMode,
                ActiveReadingSeconds = activeReadingSeconds
            };
            await _positionRepository.AddAsync(position, cancellationToken);
        }
        else
        {
            position.PageIndex = Math.Max(0, pageIndex);
            position.OffsetPercent = Math.Clamp(offsetPercent, 0.0, 1.0);
            position.Zoom = zoom > 0 ? zoom : 1.0;
            position.ViewMode = viewMode;
            position.ActiveReadingSeconds += activeReadingSeconds;
            _positionRepository.Update(position);
        }

        var book = await _bookRepository.GetByIdAsync(bookId, cancellationToken);
        if (book != null)
        {
            book.LastReadAt = DateTimeOffset.UtcNow;
            if (book.Status == ReadingStatus.WantToRead)
            {
                book.Status = ReadingStatus.Reading;
            }
            _bookRepository.Update(book);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}

