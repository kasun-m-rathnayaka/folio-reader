using System.Text.Json;
using Folio.Desktop.Services;

namespace Folio.Desktop.Tests;

public class WebMessageKindsTests
{
    [Theory]
    [InlineData("\"__bwv:AttachPage\"", false)]
    [InlineData("null", false)]
    [InlineData("[]", false)]
    [InlineData("{\"kind\":1}", false)]
    [InlineData("{\"kind\":\"theme-changed\"}", false)]
    [InlineData("{\"kind\":\"import-drop\"}", true)]
    public void DropDetection_DoesNotInterceptFrameworkOrMalformedMessages(string json, bool expected)
    {
        using var document = JsonDocument.Parse(json);
        Assert.Equal(expected, WebMessageKinds.Is(document.RootElement, "import-drop"));
    }
}
