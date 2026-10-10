using System.Runtime.InteropServices;
using Folio.Application.Common.Interfaces;

namespace Folio.Infrastructure.Jobs;

/// <summary>
/// Queries Windows Win32 GetSystemPowerStatus to determine AC vs battery power state (NFR-10).
/// </summary>
public class WindowsBatteryMonitor : IBatteryMonitor
{
    [StructLayout(LayoutKind.Sequential)]
    private struct SystemPowerStatus
    {
        public byte ACLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte SystemStatusFlag;
        public int BatteryLifeTime;
        public int BatteryFullLifeTime;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetSystemPowerStatus(out SystemPowerStatus status);

    public bool IsRunningOnBattery
    {
        get
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows) && GetSystemPowerStatus(out var status))
            {
                // 0 = Offline (on battery power), 1 = Online (AC plugged in), 255 = Unknown
                return status.ACLineStatus == 0;
            }
            return false;
        }
    }

    public int? BatteryPercent
    {
        get
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows) && GetSystemPowerStatus(out var status))
            {
                if (status.BatteryLifePercent <= 100)
                {
                    return status.BatteryLifePercent;
                }
            }
            return null;
        }
    }
}
