using Folio.Application.Common.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Folio.Platform.Windows;

public static class WindowsPlatformServiceCollectionExtensions
{
    /// <summary>
    /// Windows implementations of the platform ports. Call after <c>AddFolioInfrastructure</c>: it replaces the
    /// neutral defaults (unknown battery, no rasterizer) with the Windows ones.
    /// </summary>
    public static IServiceCollection AddFolioWindowsPlatform(this IServiceCollection services)
    {
        services.Replace(ServiceDescriptor.Singleton<IBatteryMonitor, WindowsBatteryMonitor>());
        services.Replace(ServiceDescriptor.Singleton<IPdfRasterizer, WinRtPdfRasterizer>());
        services.Replace(ServiceDescriptor.Singleton<IBookUrlResolver, VirtualHostBookUrlResolver>());
        services.Replace(ServiceDescriptor.Singleton<IPlatformCapabilities, DesktopPlatformCapabilities>());
        return services;
    }
}
