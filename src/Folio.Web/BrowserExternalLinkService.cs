using Folio.Application.Common.Interfaces;
using Microsoft.JSInterop;

namespace Folio.Web;

/// <summary>Opens an http(s) link the user confirmed in a new tab, without giving it access to this page.</summary>
public sealed class BrowserExternalLinkService(IJSRuntime js) : IExternalLinkService
{
    public async Task OpenAsync(Uri uri)
    {
        if (uri.Scheme is "http" or "https") await js.InvokeVoidAsync("open", uri.AbsoluteUri, "_blank", "noopener,noreferrer");
    }
}
