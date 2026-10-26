using Folio.Application.Common.Interfaces;
using Microsoft.Win32;

namespace Folio.Desktop.Services;

/// <summary>
/// WPF implementation of IFilePickerService using native OpenFileDialog.
/// </summary>
public class WpfFilePickerService : IFilePickerService
{
    public Task<string?> PickFolderAsync()
    {
        var dialog = new OpenFolderDialog { Title = "Import PDFs from folder", Multiselect = false };
        return Task.FromResult(dialog.ShowDialog(System.Windows.Application.Current.MainWindow) == true ? dialog.FolderName : null);
    }
    public Task<string?> PickSavePathAsync(string suggestedName, string filter)
    {
        var dialog = new SaveFileDialog { FileName = suggestedName, Filter = filter, Title = "Save export", AddExtension = true };
        return Task.FromResult(dialog.ShowDialog() == true ? dialog.FileName : null);
    }
    public Task<IReadOnlyList<string>> PickPdfFilesAsync()
    {
        var dialog = new OpenFileDialog
        {
            Filter = "PDF Documents (*.pdf)|*.pdf|All Files (*.*)|*.*",
            Multiselect = true,
            Title = "Import Books into Folio"
        };

        if (dialog.ShowDialog() == true && dialog.FileNames.Length > 0)
        {
            return Task.FromResult<IReadOnlyList<string>>(dialog.FileNames);
        }

        return Task.FromResult<IReadOnlyList<string>>(Array.Empty<string>());
    }

}
