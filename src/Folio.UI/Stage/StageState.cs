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
public enum StagePhase { None, Opening, Handoff, Closing }

/// <summary>A scene the stage should show (SPEC: scenes). Book and shelf ids are optional.</summary>
public sealed record StageScene(string Kind, Guid? BookId = null, Guid? ShelfId = null, int? Page = null)
{
    public static StageScene Hero(Guid? bookId) => new("hero", bookId);
    public static StageScene Shelf(Guid? shelfId, Guid? focusId = null) => new("shelf", focusId, shelfId);
    public static StageScene Details(Guid bookId) => new("details", bookId);
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
    internal Func<PageRect, Task>? AlignHandler;
    internal Func<Guid, PageRect, StageScene, Task>? BeginCloseHandler;

    /// <summary>
    /// The 3D open-book transition runs whenever the stage is available and motion is Full — also from views without a
    /// scene, such as search results (SRC-2): the book then appears on the stage and opens.
    /// </summary>
    public bool CanAnimateBooks => Available && Motion == "full" && BeginOpenHandler != null;

    public async Task<bool> BeginOpenAsync(Guid bookId)
    {
        if (!CanAnimateBooks || Phase != StagePhase.None) return false;
        ReturnScene = Scene;
        if (!await BeginOpenHandler!(bookId)) return false;
        OpeningBookId = bookId; Phase = StagePhase.Opening; Changed?.Invoke();
        return true;
    }

    /// <summary>The reader reports where it drew the current page; the stage aligns its spread to it.</summary>
    public Task ReportReaderPageAsync(PageRect rect) => Phase == StagePhase.Opening && AlignHandler != null ? AlignHandler(rect) : Task.CompletedTask;

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
        Phase = StagePhase.None; OpeningBookId = null; Changed?.Invoke();
    }

    public StageFilter Filter { get; private set; } = new();
    public event Action? FilterChanged;
    public void SetFilter(StageFilter filter) { if (filter == Filter) return; Filter = filter; FilterChanged?.Invoke(); }

    public event Action? Changed;
    public event Action<Guid>? Hovered;
    public event Func<Guid, string, Task>? Activated;
    public event Func<string, Task>? ScrollIntent;
    public event Action<string>? Settled;

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
    internal void ReportSettled(string kind) => Settled?.Invoke(kind);
    internal void ReportAccent(Guid id, string? color) { _accents[id] = color; Changed?.Invoke(); }
}
