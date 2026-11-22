namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Opens the library database and brings its schema up to date before any other service queries it.
/// </summary>
public interface IDatabaseSetup
{
    Task InitializeAsync(CancellationToken cancellationToken = default);
}
