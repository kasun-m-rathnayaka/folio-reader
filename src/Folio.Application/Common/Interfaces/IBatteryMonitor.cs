namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Port for querying host machine power and battery status (NFR-10).
/// </summary>
public interface IBatteryMonitor
{
    bool IsRunningOnBattery { get; }
    int? BatteryPercent { get; }
}
