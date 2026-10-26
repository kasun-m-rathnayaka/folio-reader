namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Port for opening native desktop file pickers without coupling domain/UI to platform assemblies.
/// </summary>
public interface IFilePickerService
{
    Task<IReadOnlyList<string>> PickPdfFilesAsync();
    Task<string?> PickFolderAsync() => Task.FromResult<string?>(null);
    Task<string?> PickSavePathAsync(string suggestedName, string filter) => Task.FromResult<string?>(null);
}

