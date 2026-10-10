using Folio.Application.Common.Interfaces;
using Microsoft.Win32;

namespace Folio.Desktop.Services;

/// <summary>
/// WPF implementation of IFilePickerService using native OpenFileDialog.
/// </summary>
public class WpfFilePickerService : IFilePickerService
{
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

