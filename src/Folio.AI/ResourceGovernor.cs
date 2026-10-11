using Folio.Application.AI;

namespace Folio.AI;

/// <summary>
/// Monitors CPU and RAM resources, enforces memory headroom before model loading,
/// and throttles inference priority during active audio narration (FR-AIR-06, §8.2.4).
/// </summary>
public class ResourceGovernor : IResourceGovernor
{
    private const double RequiredHeadroomGb = 2.0;

    public event Action<bool>? NarrationStateChanged;

    public bool CanLoadModel(double requiredRamGb, out string reason)
    {
        var memStatus = new NativeMethods.MEMORYSTATUSEX();
        if (NativeMethods.GlobalMemoryStatusEx(memStatus))
        {
            double availRamGb = memStatus.ullAvailPhys / (1024.0 * 1024.0 * 1024.0);
            double totalNeededGb = requiredRamGb + RequiredHeadroomGb;

            if (availRamGb < totalNeededGb)
            {
                reason = $"Insufficient physical RAM. Available: {availRamGb:F1} GB, Required: {totalNeededGb:F1} GB ({requiredRamGb:F1} GB model + {RequiredHeadroomGb:F1} GB OS headroom).";
                return false;
            }

            reason = $"RAM check passed. Available: {availRamGb:F1} GB.";
            return true;
        }

        reason = "Unable to query system memory status.";
        return true; // Fallback to allowing if query fails
    }

    public int GetOptimalThreadCount()
    {
        int logicalCores = Environment.ProcessorCount;
        return Math.Clamp(logicalCores / 2, 2, 8);
    }

    public void NotifyNarrationStarted()
    {
        NarrationStateChanged?.Invoke(true);
    }

    public void NotifyNarrationStopped()
    {
        NarrationStateChanged?.Invoke(false);
    }
}
