using System.ComponentModel;
using System.Windows;

namespace Folio.Desktop.Services;

/// <summary>Flush once, then post the final close after the current Closing event returns.</summary>
public sealed class WindowCloseCoordinator : IDisposable
{
    private readonly Window _window;
    private readonly Func<Task> _beforeClose;
    private readonly Action<Exception> _failed;
    private bool _canClose, _pending;

    public WindowCloseCoordinator(Window window, Func<Task> beforeClose, Action<Exception> failed)
    {
        _window = window; _beforeClose = beforeClose; _failed = failed;
        window.Closing += OnClosing;
    }

    private async void OnClosing(object? sender, CancelEventArgs args)
    {
        if (_canClose) return;
        args.Cancel = true;
        if (_pending) return;
        _pending = true;
        try
        {
            await _beforeClose();
            _canClose = true;
            // Completion may be synchronous. Never call Close inside Closing.
            _ = _window.Dispatcher.BeginInvoke(new Action(_window.Close));
        }
        catch (Exception ex) { _pending = false; _failed(ex); }
    }

    public void Dispose() => _window.Closing -= OnClosing;
}
