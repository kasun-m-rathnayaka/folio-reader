namespace Folio.Infrastructure.Persistence;

/// <summary>Restore excludes writers and invalidates contexts created before the restore.</summary>
public sealed class LibraryMaintenanceGate
{
    private readonly SemaphoreSlim _writers = new(1, 1);
    private int _generation;
    public int Generation => Volatile.Read(ref _generation);
    public void CompleteRestore() => Interlocked.Increment(ref _generation);
    public async ValueTask<IAsyncDisposable> AcquireAsync(CancellationToken ct = default)
    {
        await _writers.WaitAsync(ct);
        return new Lease(_writers);
    }
    private sealed class Lease(SemaphoreSlim semaphore) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() { semaphore.Release(); return ValueTask.CompletedTask; }
    }
}
