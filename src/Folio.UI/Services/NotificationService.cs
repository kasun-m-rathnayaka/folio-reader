using MudBlazor;

namespace Folio.UI.Services;

public record AppNotification(Guid Id, string Message, Severity Severity, string Title);

public sealed class NotificationService
{
    private readonly List<AppNotification> _items = [];
    public IReadOnlyList<AppNotification> Items => _items;
    public event Action? Changed;

    public void Add(string message, Severity severity = Severity.Info, string? title = null)
    {
        // Collapse repeated errors instead of covering the reader with identical cards.
        _items.RemoveAll(item => item.Message == message && item.Severity == severity);
        _items.Add(new(Guid.NewGuid(), message, severity, title ?? severity switch
        {
            Severity.Error => "Something went wrong",
            Severity.Warning => "Please check",
            Severity.Success => "Done",
            _ => "Folio"
        }));
        if (_items.Count > 5) _items.RemoveAt(0);
        Changed?.Invoke();
    }

    public void Dismiss(Guid id) { _items.RemoveAll(item => item.Id == id); Changed?.Invoke(); }
    public void Clear() { _items.Clear(); Changed?.Invoke(); }
}
