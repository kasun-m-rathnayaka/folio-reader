namespace Folio.Application.Common.Interfaces;

public interface IExternalLinkService
{
    Task OpenAsync(Uri uri);
}
