using Folio.Application.Books;
using Folio.Domain.Entities;

namespace Folio.UI.Services;

/// <summary>One row of the bookcase: "All books" (no id) or a shelf.</summary>
public sealed record ShelfRow(Guid? Id, string Name);

public enum ShelfTravel { Idle, Travelling }

/// <summary>
/// The single source of truth for the bookcase rows (WP2): the ordered rows (All books, then shelves in their saved
/// order), a version that changes whenever that list does, where the camera is (<see cref="CurrentIndex"/>) and where it
/// is going (<see cref="TargetIndex"/>). One gesture or key press moves the target by exactly one row; the stage reports
/// when it has arrived, and only then does the navigator go back to Idle.
/// </summary>
public sealed class ShelfNavigator(ILibraryService library)
{
    /// <summary>If the stage never reports arrival (hidden, paused, failed), travel ends after this long.</summary>
    public const int WatchdogMs = 900;

    private readonly object _gate = new();
    private int _queued;
    private CancellationTokenSource? _watchdog;
    private IReadOnlyList<Shelf> _shelves = [];

    public IReadOnlyList<ShelfRow> Rows { get; private set; } = [new(null, "All books")];
    public IReadOnlyList<Shelf> Shelves => _shelves;
    /// <summary>Changes whenever <see cref="Rows"/> changes (shelf created, renamed, reordered or deleted).</summary>
    public int RowsVersion { get; private set; }
    public int CurrentIndex { get; private set; }
    public int TargetIndex { get; private set; }
    public ShelfTravel State { get; private set; }

    /// <summary>The rows changed; views and the stage should read them again.</summary>
    public event Action? RowsChanged;
    /// <summary>A step or jump chose a new target row: the route should follow it.</summary>
    public event Action<int>? TargetChanged;

    public async Task RefreshAsync() => SetShelves(await library.GetShelvesAsync());

    public void SetShelves(IReadOnlyList<Shelf> shelves)
    {
        var rows = new List<ShelfRow> { new(null, "All books") };
        rows.AddRange(shelves.Select(s => new ShelfRow(s.Id, s.Name)));
        bool changed;
        lock (_gate)
        {
            _shelves = shelves;
            changed = !rows.SequenceEqual(Rows);
            if (!changed) return;
            var current = Rows[Math.Clamp(CurrentIndex, 0, Rows.Count - 1)].Id;
            var target = Rows[Math.Clamp(TargetIndex, 0, Rows.Count - 1)].Id;
            Rows = rows; RowsVersion++;
            // Keep each position on the same shelf when rows move; a deleted shelf falls back to All books.
            CurrentIndex = Math.Max(0, IndexOf(current));
            TargetIndex = Math.Max(0, IndexOf(target));
        }
        RowsChanged?.Invoke();
    }

    /// <summary>The row of a shelf (null = All books), or -1 if the shelf no longer exists.</summary>
    public int IndexOf(Guid? shelfId) { for (var i = 0; i < Rows.Count; i++) if (Rows[i].Id == shelfId) return i; return -1; }

    /// <summary>
    /// Moves the target by one row. Auto-repeat while travelling is ignored; a new press while travelling queues at most one
    /// more step. Returns false when nothing moved (edge of the case, repeat, or the queue is full).
    /// </summary>
    public bool Step(int delta, bool repeat = false)
    {
        delta = Math.Sign(delta);
        if (delta == 0) return false;
        lock (_gate)
        {
            if (State == ShelfTravel.Travelling)
            {
                if (repeat || _queued != 0) return false;
                _queued = delta;
                return true;
            }
            var next = Math.Clamp(TargetIndex + delta, 0, Rows.Count - 1);
            if (next == TargetIndex) return false;
            Begin(next);
        }
        TargetChanged?.Invoke(TargetIndex);
        return true;
    }

    /// <summary>Jumps to a row (keys 1–9). Replaces any queued step.</summary>
    public bool GoTo(int index)
    {
        lock (_gate)
        {
            index = Math.Clamp(index, 0, Rows.Count - 1);
            if (index == TargetIndex && State == ShelfTravel.Idle) return false;
            _queued = 0;
            Begin(index);
        }
        TargetChanged?.Invoke(TargetIndex);
        return true;
    }

    /// <summary>
    /// The address changed (Back, Forward, a typed address or a sidebar click). A route that matches the target does nothing;
    /// any other row becomes the target directly. Returns false if the shelf in the address does not exist.
    /// </summary>
    public bool SyncFromRoute(Guid? shelfId)
    {
        lock (_gate)
        {
            var index = IndexOf(shelfId);
            if (index < 0) return false;
            if (index != TargetIndex) { _queued = 0; Begin(index); }
            return true;
        }
    }

    /// <summary>The stage reports the camera arrived at <paramref name="rowIndex"/>.</summary>
    public void OnSettled(int rowIndex)
    {
        int queued;
        lock (_gate)
        {
            if (rowIndex != TargetIndex) return;
            queued = Finish();
        }
        if (queued != 0) Step(queued);
    }

    /// <summary>Called when travel starts. Callers hold the lock.</summary>
    private void Begin(int target)
    {
        TargetIndex = target;
        State = ShelfTravel.Travelling;
        _watchdog?.Cancel();
        var source = _watchdog = new CancellationTokenSource();
        _ = Task.Delay(WatchdogMs, source.Token).ContinueWith(task =>
        {
            if (task.IsCanceled) return;
            int queued;
            lock (_gate) { if (!ReferenceEquals(_watchdog, source)) return; queued = Finish(); }
            if (queued != 0) Step(queued);
        }, TaskScheduler.Default);
    }

    /// <summary>Back to Idle at the target; returns the queued step, if any. Callers hold the lock.</summary>
    private int Finish()
    {
        _watchdog?.Cancel(); _watchdog = null;
        CurrentIndex = TargetIndex; State = ShelfTravel.Idle;
        var queued = _queued; _queued = 0;
        return queued;
    }
}
