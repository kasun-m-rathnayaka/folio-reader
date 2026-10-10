namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Port for opening native desktop file pickers without coupling domain/UI to platform assemblies.
/// </summary>
public interface IFilePickerService
{
    Task<IReadOnlyList<string>> PickPdfFilesAsync();
}
