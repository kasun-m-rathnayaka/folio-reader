using MudBlazor;

namespace Folio.UI.Services;

public record AppNotification(Guid Id, string Message, Severity Severity, string Title);

public sealed class NotificationService : IDisposable
{
    private readonly List<AppNotification> _items = [];
    private readonly object _sync = new();
    private readonly CancellationTokenSource _lifetime = new();
    public IReadOnlyList<AppNotification> Items { get { lock (_sync) return _items.ToArray(); } }
    public event Action? Changed;

    public void Add(string message, Severity severity = Severity.Info, string? title = null)
    {
        // Collapse repeated errors instead of covering the reader with identical cards.
        var item = new AppNotification(Guid.NewGuid(), message, severity, title ?? severity switch
        {
            Severity.Error => "Something went wrong",
            Severity.Warning => "Please check",
            Severity.Success => "Done",
            _ => "Folio"
        });
        lock (_sync)
        {
            _items.RemoveAll(existing => existing.Message == message && existing.Severity == severity);
            _items.Add(item);
            if (_items.Count > 5) _items.RemoveAt(0);
        }
        Changed?.Invoke();
        if (severity is Severity.Success or Severity.Info or Severity.Normal) _ = DismissLater(item.Id, _lifetime.Token);
    }

    public void Dismiss(Guid id) { lock (_sync) _items.RemoveAll(item => item.Id == id); Changed?.Invoke(); }
    public void Clear() { lock (_sync) _items.Clear(); Changed?.Invoke(); }
    private async Task DismissLater(Guid id, CancellationToken ct)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(8), ct); Dismiss(id); }
        catch (OperationCanceledException) { }
    }
    public void Dispose() { _lifetime.Cancel(); _lifetime.Dispose(); }
}
