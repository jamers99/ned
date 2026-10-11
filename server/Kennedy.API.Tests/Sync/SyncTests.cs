using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace Kennedy.API.Tests.Sync;

/// <summary>
/// Exercises the API the way the phones' sync engine does: push upserts in a <c>$batch</c>
/// (PATCH first, POST the ones that 404), then pull everything modified since a cursor.
/// </summary>
public class SyncTests(KennedyApiFactory api) : IClassFixture<KennedyApiFactory>
{
    const string EventFields = "Guid,Type,Start,End,IsNight,SleepLocation,ModifiedAt,Deleted,LoggedBy";
    readonly CancellationToken cancel = TestContext.Current.CancellationToken;

    [Fact]
    public async Task SleepLoggedOnOnePhone_AndDeletedLater_ReachesTheOtherPhone()
    {
        var natalie = await api.SignInAsync("Natalie", "Dev-natalie-1");
        var james = await api.SignInAsync("James", "Dev-james-1");
        var sleepGuid = Guid.NewGuid();
        var sleep = new JsonObject
        {
            ["Type"] = "Sleep",
            ["Start"] = "2026-10-10T23:05:00Z",
            ["IsNight"] = true,
            ["SleepLocation"] = "Crib",
            ["LoggedBy"] = "Natalie"
        };

        var patchStatus = await SendBatchAsync(natalie, "PATCH", $"Event({sleepGuid})", sleep);
        Assert.Equal(HttpStatusCode.NotFound, patchStatus);
        var postStatus = await SendBatchAsync(natalie, "POST", "Event", WithGuid(sleep, sleepGuid));
        Assert.Equal(HttpStatusCode.OK, postStatus);

        var firstPull = await PullEventsAsync(james, "2000-01-01T00:00:00Z");
        var pulled = Assert.Single(firstPull, e => e["Guid"]!.GetValue<Guid>() == sleepGuid);
        Assert.Equal("Crib", pulled["SleepLocation"]!.GetValue<string>());
        Assert.False(pulled["Deleted"]!.GetValue<bool>());
        var cursor = pulled["ModifiedAt"]!.GetValue<string>();

        var delete = new JsonObject { ["Deleted"] = true, ["ModifiedAt"] = "2000-01-01T00:00:00Z" };
        Assert.Equal(HttpStatusCode.OK, await SendBatchAsync(natalie, "PATCH", $"Event({sleepGuid})", delete));

        var secondPull = await PullEventsAsync(james, cursor);
        var deleted = Assert.Single(secondPull, e => e["Guid"]!.GetValue<Guid>() == sleepGuid);
        Assert.True(deleted["Deleted"]!.GetValue<bool>());
        Assert.True(deleted["ModifiedAt"]!.GetValue<DateTimeOffset>() > DateTimeOffset.Parse(cursor),
            "The server stamps ModifiedAt on every save and ignores the value a phone sends.");
    }

    [Fact]
    public async Task EverySyncedTable_AcceptsPhoneUpserts()
    {
        var james = await api.SignInAsync("James", "Dev-james-1");
        var rows = new (string EntitySet, JsonObject Body)[]
        {
            ("Growth", new JsonObject { ["MeasuredAt"] = "2026-09-18T14:00:00Z", ["WeightKg"] = 6.917, ["HeadCm"] = 43.18 }),
            ("Food", new JsonObject { ["Name"] = $"Mango {Guid.NewGuid():N}", ["Category"] = "Fruit", ["UseCount"] = 1 }),
            ("Settings", new JsonObject { ["NapsPerDay"] = 2, ["Nap1WakeWindowMinutes"] = 150 }),
            ("Event", new JsonObject { ["Type"] = "Solids", ["Start"] = "2026-09-20T16:30:00Z", ["Foods"] = "Cereal\nPear" })
        };

        foreach (var (entitySet, body) in rows)
        {
            var guid = Guid.NewGuid();
            Assert.Equal(HttpStatusCode.OK, await SendBatchAsync(james, "POST", entitySet, WithGuid(body, guid)));
            var saved = await james.GetFromJsonAsync<JsonObject>($"/api/{entitySet}({guid})?$select=ModifiedAt", cancel);
            Assert.NotNull(saved!["ModifiedAt"]);
        }
    }

    async Task<HttpStatusCode> SendBatchAsync(HttpClient client, string method, string url, JsonObject body)
    {
        var batch = new JsonObject
        {
            ["requests"] = new JsonArray(new JsonObject
            {
                ["id"] = "1",
                ["method"] = method,
                ["url"] = url,
                ["headers"] = new JsonObject { ["content-type"] = "application/json" },
                ["body"] = body.DeepClone()
            })
        };
        var response = await client.PostAsJsonAsync("/api/$batch", batch, cancel);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<JsonObject>(cancel);
        return (HttpStatusCode)result!["responses"]![0]!["status"]!.GetValue<int>();
    }

    async Task<List<JsonNode>> PullEventsAsync(HttpClient client, string cursor)
    {
        var url = $"/api/Event?$select={EventFields}&$filter=ModifiedAt ge {cursor}&$orderby=ModifiedAt";
        var result = await client.GetFromJsonAsync<JsonObject>(url, cancel);
        return result!["value"]!.AsArray().Select(e => e!).ToList();
    }

    static JsonObject WithGuid(JsonObject body, Guid guid)
    {
        var copy = body.DeepClone().AsObject();
        copy["Guid"] = guid.ToString();
        return copy;
    }
}
