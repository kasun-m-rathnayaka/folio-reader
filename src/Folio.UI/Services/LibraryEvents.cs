namespace Folio.UI.Services;

/// <summary>Raised when books, shelves or counts change (import, trash, edits) so open views reload.</summary>
public sealed class LibraryEvents
{
    public event Func<Task>? Changed;
    public async Task NotifyAsync()
    {
        if (Changed == null) return;
        foreach (var handler in Changed.GetInvocationList().Cast<Func<Task>>()) await handler();
    }
}
