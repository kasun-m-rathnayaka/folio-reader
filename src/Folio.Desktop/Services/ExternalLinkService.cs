using System.Diagnostics;
using Folio.Application.Common.Interfaces;

namespace Folio.Desktop.Services;

public class ExternalLinkService : IExternalLinkService
{
    public Task OpenAsync(Uri uri)
    {
        if (uri.Scheme is not ("http" or "https")) throw new ArgumentException("Only web links can be opened.");
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
        return Task.CompletedTask;
    }
}
