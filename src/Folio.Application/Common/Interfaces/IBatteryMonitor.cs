namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Port for querying host machine power and battery status (NFR-10).
/// </summary>
public interface IBatteryMonitor
{
    bool IsRunningOnBattery { get; }
    int? BatteryPercent { get; }
}

/// <summary>Used where the platform cannot report power status: always "on mains, unknown level".</summary>
public sealed class UnknownBatteryMonitor : IBatteryMonitor
{
    public bool IsRunningOnBattery => false;
    public int? BatteryPercent => null;
}
