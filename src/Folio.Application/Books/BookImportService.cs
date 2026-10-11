using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.Application.Books;

/// <summary>
/// Implements PDF file ingestion, metadata extraction, deduplication, and cover thumbnailing (FR-LIB-01..03).
/// Non-destructive: source file is never altered; managed copy is stored under library/books/&lt;sha256&gt;.pdf.
/// </summary>
public class BookImportService : IBookImportService
{
    private readonly IBookRepository _bookRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IFileStore _fileStore;
    private readonly IPdfTextExtractor _pdfTextExtractor;
    private readonly IPdfRasterizer? _pdfRasterizer;

    public BookImportService(
        IBookRepository bookRepository,
        IUnitOfWork unitOfWork,
        IFileStore fileStore,
        IPdfTextExtractor pdfTextExtractor,
        IPdfRasterizer? pdfRasterizer = null)
    {
        _bookRepository = bookRepository;
        _unitOfWork = unitOfWork;
        _fileStore = fileStore;
        _pdfTextExtractor = pdfTextExtractor;
        _pdfRasterizer = pdfRasterizer;
    }

    public async Task<ImportResult> ImportFileAsync(string sourceFilePath, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(sourceFilePath))
        {
            throw new FileNotFoundException($"Import source file not found: {sourceFilePath}", sourceFilePath);
        }

        // 1. Calculate SHA-256
        string sha256 = await _fileStore.ComputeSha256Async(sourceFilePath, cancellationToken);

        // 2. Deduplication check: return existing book if already in library (FR-LIB-02)
        var existingBook = await _bookRepository.GetBySha256Async(sha256, cancellationToken);
        if (existingBook != null)
        {
            return new ImportResult(IsNew: false, Book: existingBook);
        }

        // 3. Copy to managed storage library/books/<sha256>.pdf
        string managedPath = await _fileStore.StoreBookAsync(sourceFilePath, sha256, cancellationToken);

        // 4. Extract metadata via PdfPig
        string fallbackTitle = Path.GetFileNameWithoutExtension(sourceFilePath);
        string title = fallbackTitle;
        string? author = null;
        int pageCount = 1;

        try
        {
            var meta = await Task.Run(() => _pdfTextExtractor.ExtractMetadataAsync(managedPath, cancellationToken), cancellationToken);
            if (!string.IsNullOrWhiteSpace(meta.Title))
            {
                title = meta.Title;
            }
            author = meta.Author;
            pageCount = Math.Max(1, meta.PageCount);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            throw new InvalidDataException("This PDF could not be opened. It may be damaged or password protected.", ex);
        }

        // 5. Generate cover thumbnail for page 1 within performance budget (FR-LIB-03)
        string coverPath = _fileStore.GetCoverPath(sha256);
        string? finalCoverPath = null;

        if (_pdfRasterizer != null)
        {
            try
            {
                await _pdfRasterizer.RenderPageToImageAsync(
                    managedPath,
                    pageIndex: 0,
                    outputImagePath: coverPath,
                    targetDpi: 150,
                    maxDimensionPx: 600,
                    cancellationToken: cancellationToken);

                if (File.Exists(coverPath))
                {
                    finalCoverPath = coverPath;
                }
            }
            catch (OperationCanceledException) { throw; }
            catch
            {
                // Thumbnail failure does not abort book ingestion
            }
        }

        // 6. Create Book entity with initial reading position
        var book = new Book
        {
            Sha256 = sha256,
            Title = title,
            Author = author,
            PageCount = pageCount,
            FileSizeBytes = new FileInfo(managedPath).Length,
            FilePath = managedPath,
            CoverPath = finalCoverPath,
            Status = ReadingStatus.WantToRead,
            ReadingPosition = new ReadingPosition
            {
                PageIndex = 0,
                OffsetPercent = 0.0,
                Zoom = 1.0,
                ViewMode = ReaderViewMode.Continuous
            }
        };

        // 7. Persist to SQLite
        await _bookRepository.AddAsync(book, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new ImportResult(IsNew: true, Book: book);
    }

    public async Task<IReadOnlyList<ImportResult>> ImportFilesAsync(
        IEnumerable<string> sourceFilePaths,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default)
    {
        var paths = sourceFilePaths.ToList();
        var results = new List<ImportResult>(paths.Count);

        for (int i = 0; i < paths.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var result = await ImportFileAsync(paths[i], cancellationToken);
                results.Add(result);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                // Per-file error recording allows non-blocking multi-file import (FR-LIB-01)
                results.Add(new ImportResult(
                    IsNew: false,
                    Book: new Book { Title = Path.GetFileNameWithoutExtension(paths[i]) },
                    Error: ex.Message));
            }

            progress?.Report((double)(i + 1) / paths.Count);
        }

        return results;
    }
}

