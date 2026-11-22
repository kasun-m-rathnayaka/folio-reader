using Folio.Domain.Entities;
using Folio.UI.Services;

namespace Folio.UI.Tests;

public class ShelfNavigatorTests
{
    private static Shelf S(string name, Guid? id = null) => new() { Id = id ?? Guid.NewGuid(), Name = name };
    private static ShelfNavigator Case(params Shelf[] shelves) { var n = new ShelfNavigator(null!); n.SetShelves(shelves); return n; }

    [Fact]
    public void Rows_are_all_books_then_shelves_in_order()
    {
        var a = S("Design"); var b = S("Research");
        var nav = Case(a, b);
        Assert.Equal(["All books", "Design", "Research"], nav.Rows.Select(r => r.Name));
        Assert.Equal(1, nav.IndexOf(a.Id)); Assert.Equal(0, nav.IndexOf(null)); Assert.Equal(-1, nav.IndexOf(Guid.NewGuid()));
    }

    [Fact]
    public void A_step_moves_the_target_by_one_row_and_stops_at_the_ends()
    {
        var nav = Case(S("A"), S("B"));
        var moved = new List<int>(); nav.TargetChanged += moved.Add;
        Assert.False(nav.Step(-1));                       // already at the top
        Assert.True(nav.Step(1)); nav.OnSettled(1);
        Assert.True(nav.Step(1)); nav.OnSettled(2);
        Assert.False(nav.Step(1));                        // already at the bottom
        Assert.Equal([1, 2], moved);
        Assert.Equal(ShelfTravel.Idle, nav.State);
        Assert.Equal(2, nav.CurrentIndex);
    }

    [Fact]
    public void Auto_repeat_while_travelling_is_ignored_and_one_press_is_queued()
    {
        var nav = Case(S("A"), S("B"), S("C"));
        var moved = new List<int>(); nav.TargetChanged += moved.Add;
        Assert.True(nav.Step(1));
        Assert.False(nav.Step(1, repeat: true));          // held key: dropped while travelling
        Assert.True(nav.Step(1));                          // a fresh press is queued…
        Assert.False(nav.Step(1));                         // …but only one
        Assert.Equal(1, nav.TargetIndex);
        nav.OnSettled(1);                                  // arrival runs the queued step
        Assert.Equal(2, nav.TargetIndex);
        Assert.Equal([1, 2], moved);
        nav.OnSettled(2);
        Assert.Equal(ShelfTravel.Idle, nav.State);
    }

    [Fact]
    public void A_held_key_moves_one_shelf_per_settle()
    {
        var nav = Case(S("A"), S("B"), S("C"));
        Assert.True(nav.Step(1));
        for (var i = 0; i < 20; i++) Assert.False(nav.Step(1, repeat: true));   // repeats while travelling
        nav.OnSettled(1);
        Assert.True(nav.Step(1, repeat: true));                                   // idle again: the next repeat moves one more
        Assert.Equal(2, nav.TargetIndex);
    }

    [Fact]
    public void A_settle_for_a_row_that_is_not_the_target_is_ignored()
    {
        var nav = Case(S("A"), S("B"));
        nav.Step(1); nav.Step(1);
        nav.OnSettled(0);
        Assert.Equal(ShelfTravel.Travelling, nav.State);
        Assert.Equal(1, nav.TargetIndex);
    }

    [Fact]
    public void A_route_matching_the_target_does_nothing_and_another_route_becomes_the_target()
    {
        var a = S("A"); var b = S("B");
        var nav = Case(a, b);
        var moved = new List<int>(); nav.TargetChanged += moved.Add;
        nav.Step(1);
        Assert.True(nav.SyncFromRoute(a.Id));              // the route followed the step
        Assert.Empty(moved.Skip(1));
        Assert.True(nav.SyncFromRoute(b.Id));              // Back, Forward or a sidebar click: set directly
        Assert.Equal(2, nav.TargetIndex);
        Assert.False(nav.SyncFromRoute(Guid.NewGuid()));   // unknown shelf
    }

    [Fact]
    public void Jumping_to_a_row_replaces_a_queued_step()
    {
        var nav = Case(S("A"), S("B"), S("C"), S("D"));
        nav.Step(1); nav.Step(1);                          // one travelling, one queued
        Assert.True(nav.GoTo(4));
        nav.OnSettled(4);
        Assert.Equal(4, nav.TargetIndex); Assert.Equal(ShelfTravel.Idle, nav.State);
    }

    [Fact]
    public void Changing_the_shelves_bumps_the_version_and_keeps_each_position_on_its_shelf()
    {
        var a = S("A"); var b = S("B");
        var nav = Case(a, b);
        nav.Step(1); nav.OnSettled(1); nav.Step(1); nav.OnSettled(2);     // on B
        var version = nav.RowsVersion;
        nav.SetShelves([b, a]);                                            // reordered
        Assert.Equal(version + 1, nav.RowsVersion);
        Assert.Equal(1, nav.TargetIndex);                                  // still on B
        nav.SetShelves([b, a]);                                            // unchanged: no new version
        Assert.Equal(version + 1, nav.RowsVersion);
        nav.SetShelves([a]);                                               // B deleted: back to All books
        Assert.Equal(0, nav.TargetIndex);
    }

    [Fact]
    public async Task The_watchdog_ends_travel_when_the_stage_never_reports()
    {
        var nav = Case(S("A"), S("B"));
        nav.Step(1);
        await Task.Delay(ShelfNavigator.WatchdogMs + 400);
        Assert.Equal(ShelfTravel.Idle, nav.State);
        Assert.Equal(1, nav.CurrentIndex);
    }
}
