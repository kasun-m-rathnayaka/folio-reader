using Folio.UI.Services;
using MudBlazor;

namespace Folio.Desktop.Tests;

public class NotificationServiceTests
{
    [Fact]
    public void RepeatedMessages_AreDeduplicatedAndDismissible()
    {
        var service = new NotificationService();
        var changes = 0;
        service.Changed += () => changes++;
        service.Add("Save failed", Severity.Error);
        service.Add("Save failed", Severity.Error);
        Assert.Single(service.Items);
        Assert.Equal("Something went wrong", service.Items[0].Title);
        service.Dismiss(service.Items[0].Id);
        Assert.Empty(service.Items);
        Assert.Equal(3, changes);
    }

    [Fact]
    public void Notifications_AreBoundedAndClearable()
    {
        var service = new NotificationService();
        for (var i = 0; i < 8; i++) service.Add($"Message {i}");
        Assert.Equal(5, service.Items.Count);
        Assert.Equal("Message 7", service.Items[^1].Message);
        service.Clear();
        Assert.Empty(service.Items);
    }
}
