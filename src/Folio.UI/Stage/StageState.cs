using Folio.Application.Books;
using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.UI.Stage;

/// <summary>Sort and filters applied to the books on the stage (LIB-6): the same rule builds the HTML focus layer.</summary>
public sealed record StageFilter(LibrarySort Sort = LibrarySort.Recent, ReadingStatus? Status = null, string? Query = null)
{
    public IReadOnlyList<Book> Apply(IEnumerable<Book> books)
    {
        var query = Query?.Trim();
        return books.Where(b => (Status == null || b.Status == Status) &&
                (string.IsNullOrEmpty(query) || b.Title.Contains(query, StringComparison.CurrentCultureIgnoreCase) || (b.Author?.Contains(query, StringComparison.CurrentCultureIgnoreCase) ?? false)))
            .ToList();
    }

    /// <summary>Books on a row: every filtered book for "All books" (null), else those on the shelf.</summary>
    public static IReadOnlyList<Book> Row(IReadOnlyList<Book> filtered, Guid? shelfId) =>
        shelfId is { } id ? filtered.Where(b => b.BookShelves.Any(s => s.ShelfId == id)).ToList() : filtered;
}

/// <summary>A rectangle in viewport CSS pixels (the reader's page).</summary>
public sealed record PageRect(double X, double Y, double Width, double Height);

/// <summary>Where the open/close sequence is (OPN-1, OPN-2).</summary>
public enum StagePhase { None, Opening, Handoff, Closing, Reading }

/// <summary>A scene the stage should show (SPEC: scenes). Book and shelf ids are optional.</summary>
public sealed record StageScene(string Kind, Guid? BookId = null, int? RowIndex = null, int? RowsVersion = null, int? Page = null)
{
    public static StageScene Hero(Guid? bookId) => new("hero", bookId);
    /// <summary>A bookcase row by index and the row-list version it was computed from (WP2).</summary>
    public static StageScene Shelf(int rowIndex, int rowsVersion, Guid? focusId = null) => new("shelf", focusId, rowIndex, rowsVersion);
}

/// <summary>
/// Shared between pages and the persistent <see cref="StageHost"/>: pages say which scene to show; the host reports
/// whether 3D is available and what the user points at. Blazor owns this state; the stage only renders it.
/// </summary>
public sealed class StageState
{
    /// <summary>The scene requested by the current page, or null when no page uses the stage (it pauses).</summary>
    public StageScene? Scene { get; private set; }
    /// <summary>True once the stage started; false before, after a fallback, or when the user chose 2D.</summary>
    public bool Available { get; private set; }
    /// <summary>Why the 2D library is used even though 3D was chosen (no WebGL2, software renderer, slow, context lost).</summary>
    public string? FallbackReason { get; private set; }
    public bool Starting { get; private set; } = true;
    public Guid? HoveredBookId { get; private set; }
    public IReadOnlyDictionary<Guid, string?> Accents => _accents;
    private readonly Dictionary<Guid, string?> _accents = [];

    // ---- opening and closing a book (OPN-1, OPN-2) ----------------------------------------------------------------

    public StagePhase Phase { get; private set; }
    public Guid? OpeningBookId { get; private set; }
    /// <summary>The motion level the stage runs at: full, reduced or off.</summary>
    public string Motion { get; internal set; } = "full";
    /// <summary>The scene shown before the book opened; closing returns to it.</summary>
    public StageScene? ReturnScene { get; private set; }
    internal Func<Guid, Task<bool>>? BeginOpenHandler;
    internal Func<Guid, Task<bool>>? BeginReadingHandler;
    internal Func<int, int, Task>? ReadingStartHandler;
    internal Func<StageScene, Task>? CloseReadingHandler;
    internal Func<StageScene, Task>? AbortReadingHandler;
    /// <summary>True while the open book is drawn as a 3D spread (opening, reading or closing); false for the flat reader.</summary>
    public bool ReadingSpread { get; private set; }
    /// <summary>Zoom: the reader shows flat pages over the paused stage; Esc (or Z) returns to the spread.</summary>
    public bool ReadingFlat { get; private set; }
    /// <summary>Set from the Reading view setting.</summary>
    public bool Prefer3DReading { get; set; } = true;
    /// <summary>The book opens as a 3D spread when 3D is on, motion is not Off and the user has not chosen flat pages.</summary>
    public bool CanRead3D => Available && Motion != "off" && Prefer3DReading && BeginReadingHandler != null && Phase == StagePhase.None;
    internal Func<PageRect, Task>? AlignHandler;
    internal Func<Guid, PageRect, StageScene, Task>? BeginCloseHandler;

    /// <summary>
    /// The 3D open-book transition runs whenever the stage is available and motion is Full — also from views without a
    /// scene, such as search results (SRC-2): the book then appears on the stage and opens.
    /// </summary>
    public bool CanAnimateBooks => Available && Motion == "full" && BeginOpenHandler != null;

    public async Task<bool> BeginOpenAsync(Guid bookId)
    {
        if (CanRead3D)
        {
            ReturnScene = Scene;
            if (!await BeginReadingHandler!(bookId)) return false;
            OpeningBookId = bookId; ReadingSpread = true; ReadingFlat = false; Phase = StagePhase.Opening; Changed?.Invoke();
            return true;
        }
        if (!CanAnimateBooks || Phase != StagePhase.None) return false;
        ReturnScene = Scene; ReaderPageReported = false;
        if (!await BeginOpenHandler!(bookId)) return false;
        OpeningBookId = bookId; Phase = StagePhase.Opening; Changed?.Invoke();
        return true;
    }

    /// <summary>The reader has the document open: the 3D book lands on this page (riffling to it from the front).</summary>
    public Task ReadingStartAsync(int pageIndex, int totalPages) => ReadingSpread && ReadingStartHandler != null ? ReadingStartHandler(pageIndex, totalPages) : Task.CompletedTask;

    /// <summary>The book lies open on the page: the reader's text layer takes over the spread.</summary>
    internal void CompleteReadingOpen()
    {
        if (!ReadingSpread || Phase != StagePhase.Opening) return;
        Phase = StagePhase.Reading; Changed?.Invoke();
    }

    /// <summary>Zoom (Z) crossfades to the flat reader; false returns to the 3D spread.</summary>
    public void SetReadingFlat(bool flat) { if (!ReadingSpread || ReadingFlat == flat) return; ReadingFlat = flat; Changed?.Invoke(); }

    /// <summary>The document could not be opened: the stage puts the book back and the reader shows its error.</summary>
    public async Task AbortReadingAsync()
    {
        if (!ReadingSpread) return;
        var scene = ReturnScene ?? StageScene.Hero(null);
        ReadingSpread = false; ReadingFlat = false; Phase = StagePhase.None; OpeningBookId = null; Changed?.Invoke();
        if (AbortReadingHandler != null) await AbortReadingHandler(scene);
    }

    /// <summary>Closes the open book (cover shuts, book returns to its slot); the view leaves at once while the stage finishes.</summary>
    public async Task BeginCloseReadingAsync()
    {
        if (!ReadingSpread || Phase == StagePhase.Closing) return;
        ReadingFlat = false; Phase = StagePhase.Closing; Changed?.Invoke();
        if (CloseReadingHandler != null) await CloseReadingHandler(ReturnScene ?? StageScene.Hero(null));
    }

    /// <summary>The reader reports where it drew the current page; the stage aligns its spread to it.</summary>
    public Task ReportReaderPageAsync(PageRect rect)
    {
        if (Phase != StagePhase.Opening || AlignHandler == null) return Task.CompletedTask;
        ReaderPageReported = true;
        return AlignHandler(rect);
    }

    /// <summary>True once the reader has told the opening book where its page is; the stage then finishes on its own clock.</summary>
    public bool ReaderPageReported { get; private set; }

    /// <summary>The spread is aligned: crossfade to the reader (120 ms), then the stage pauses.</summary>
    public async Task CompleteHandoffAsync()
    {
        if (Phase != StagePhase.Opening) return;
        Phase = StagePhase.Handoff; Changed?.Invoke();
        await Task.Delay(140);
        if (Phase == StagePhase.Handoff) { Phase = StagePhase.None; OpeningBookId = null; Changed?.Invoke(); }
    }

    public bool CanAnimateClose => Available && Motion == "full" && BeginCloseHandler != null && ReturnScene != null && Phase == StagePhase.None;

    /// <summary>Shows the 3D spread aligned with the reader's page, then closes the book back into the library.</summary>
    public async Task BeginCloseAsync(Guid bookId, PageRect rect)
    {
        if (!CanAnimateClose) return;
        OpeningBookId = bookId; Phase = StagePhase.Closing; Changed?.Invoke();
        await BeginCloseHandler!(bookId, rect, ReturnScene!);
    }

    public void EndClose()
    {
        if (Phase != StagePhase.Closing) return;
        Phase = StagePhase.None; OpeningBookId = null; ReadingSpread = false; ReadingFlat = false; Changed?.Invoke();
    }

    public StageFilter Filter { get; private set; } = new();
    public event Action? FilterChanged;
    public void SetFilter(StageFilter filter) { if (filter == Filter) return; Filter = filter; FilterChanged?.Invoke(); }

    public event Action? Changed;
    public event Action<Guid>? Hovered;
    public event Func<Guid, string, Task>? Activated;
    public event Func<string, Task>? ScrollIntent;
    public event Action<string, int>? Settled;
    /// <summary>The stage was given a scene for a newer row list than it holds and asks for the library again.</summary>
    public event Func<Task>? RowsStale;

    private object? _owner;

    /// <summary>Shows a scene on behalf of <paramref name="owner"/> (normally the page component).</summary>
    public void Show(StageScene scene, object owner)
    {
        _owner = owner;
        if (scene == Scene) return;
        Scene = scene; Changed?.Invoke();
    }

    /// <summary>Clears the scene if <paramref name="owner"/> set it: the stage pauses until another page shows one.</summary>
    public void Release(object owner)
    {
        if (!ReferenceEquals(_owner, owner) || Scene == null) return;
        _owner = null; Scene = null; Changed?.Invoke();
    }

    internal void SetAvailable(bool available, string? reason)
    {
        Available = available; FallbackReason = reason; Starting = false; Changed?.Invoke();
    }
    internal void ReportHover(Guid id) { HoveredBookId = id; Hovered?.Invoke(id); }
    internal Task ReportActivated(Guid id, string action) => Activated?.Invoke(id, action) ?? Task.CompletedTask;
    internal Task ReportScroll(string direction) => ScrollIntent?.Invoke(direction) ?? Task.CompletedTask;
    internal void ReportSettled(string kind, int rowIndex) => Settled?.Invoke(kind, rowIndex);
    internal Task ReportRowsStale() => RowsStale?.Invoke() ?? Task.CompletedTask;
    internal void ReportAccent(Guid id, string? color) { _accents[id] = color; Changed?.Invoke(); }
}
