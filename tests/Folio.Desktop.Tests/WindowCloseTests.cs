using System.Windows;
using System.Windows.Threading;
using Folio.Desktop.Services;

namespace Folio.Desktop.Tests;

public class WindowCloseTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Close_CompletesForImmediateAndDelayedFlushes_WithoutReenteringClosing(bool delayed)
    {
        var completed = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            var dispatcher = Dispatcher.CurrentDispatcher;
            try
            {
                var flushes = 0;
                var window = new Window { Title="Folio close regression", Width=240,Height=120,ShowActivated=false,ShowInTaskbar=false,WindowStyle=WindowStyle.ToolWindow };
                using var close = new WindowCloseCoordinator(window, async () =>
                {
                    flushes++;
                    if (delayed) await Task.Delay(20);
                }, error => { completed.TrySetException(error); dispatcher.BeginInvokeShutdown(DispatcherPriority.Background); });
                window.Closed += (_,_) => { completed.TrySetResult(flushes); dispatcher.BeginInvokeShutdown(DispatcherPriority.Background); };
                window.Show();
                window.Close();
                if (delayed) window.Close(); // A second request while flushing must not flush twice.
                Dispatcher.Run();
            }
            catch (Exception error) { completed.TrySetException(error); }
        }) { IsBackground=true };
        thread.SetApartmentState(ApartmentState.STA);thread.Start();
        Assert.Equal(1,await completed.Task.WaitAsync(TimeSpan.FromSeconds(10)));
        Assert.True(thread.Join(TimeSpan.FromSeconds(5)));
    }
}
