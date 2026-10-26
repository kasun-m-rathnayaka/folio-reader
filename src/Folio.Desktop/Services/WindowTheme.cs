using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace Folio.Desktop.Services;

public static class WindowTheme
{
    // Windows 11 DWM attributes keep the native caption buttons and window behavior.
    public static void Apply(Window window, bool darkMode)
    {
        var background = darkMode ? Color.FromRgb(0x12, 0x12, 0x12) : Color.FromRgb(0xF3, 0xF5, 0xF7);
        window.Background = new SolidColorBrush(background);
        var handle = new WindowInteropHelper(window).Handle;
        if (handle == IntPtr.Zero) return;

        SetAttribute(handle, 20, darkMode ? 1 : 0); // DWMWA_USE_IMMERSIVE_DARK_MODE
        SetAttribute(handle, 35, ColorRef(background)); // DWMWA_CAPTION_COLOR
        SetAttribute(handle, 36, darkMode ? 0xEEEEEE : 0x38291B); // DWMWA_TEXT_COLOR
    }

    private static int ColorRef(Color color) => color.R | (color.G << 8) | (color.B << 16);

    private static void SetAttribute(IntPtr handle, int attribute, int value) =>
        DwmSetWindowAttribute(handle, attribute, ref value, sizeof(int));

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
