namespace Folio.Application.AI;

public interface IResourceGovernor
{
    bool CanLoadModel(double requiredRamGb, out string reason);
    int GetOptimalThreadCount();
    void NotifyNarrationStarted();
    void NotifyNarrationStopped();
    event Action<bool>? NarrationStateChanged;
}
