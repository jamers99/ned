using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace Ned.API.Tests.Families;

/// <summary>
/// Anyone can sign up. A sign-up starts a family, or joins one with its invite code, and each family sees only
/// its own records.
/// </summary>
[Collection(nameof(NedApiFactory))]
public class FamilyTests(NedApiFactory api)
{
    const string Password = "Test-pass-1";
    readonly CancellationToken cancel = TestContext.Current.CancellationToken;

    [Fact]
    public async Task SignUp_WithTheInviteCode_SharesTheFamily()
    {
        var first = await api.SignUpAsync(Name("Ada"), Password);
        var (family, code) = await NedApiFactory.FamilyAsync(first);
        var sleep = await PostEventAsync(first);

        // Read aloud and typed in lower case, without the dash.
        var second = await api.SignUpAsync(Name("Bo"), Password, $" {code.Replace("-", "").ToLowerInvariant()} ");

        Assert.Equal(family, (await NedApiFactory.FamilyAsync(second)).Guid);
        var pulled = await second.GetFromJsonAsync<JsonObject>($"/api/Event({sleep})?$select=Guid", cancel);
        Assert.Equal(sleep, pulled!["Guid"]!.GetValue<Guid>());
    }

    [Fact]
    public async Task AnotherFamily_CannotSeeOrChangeYourRecords()
    {
        var ours = await api.SignUpAsync(Name("Cy"), Password);
        var sleep = await PostEventAsync(ours);
        var theirs = await api.SignUpAsync(Name("Di"), Password);
        Assert.NotEqual((await NedApiFactory.FamilyAsync(ours)).Guid, (await NedApiFactory.FamilyAsync(theirs)).Guid);

        var pull = await theirs.GetFromJsonAsync<JsonObject>("/api/Event?$select=Guid", cancel);
        Assert.DoesNotContain(pull!["value"]!.AsArray(), e => e!["Guid"]!.GetValue<Guid>() == sleep);
        Assert.Equal(HttpStatusCode.NotFound, (await theirs.GetAsync($"/api/Event({sleep})", cancel)).StatusCode);

        var patch = await theirs.PatchAsJsonAsync($"/api/Event({sleep})", new { Deleted = true }, cancel);
        Assert.False(patch.IsSuccessStatusCode);
        var ourCopy = await ours.GetFromJsonAsync<JsonObject>($"/api/Event({sleep})?$select=Deleted", cancel);
        Assert.False(ourCopy!["Deleted"]!.GetValue<bool>());
    }

    [Fact]
    public async Task ANewRecord_CannotClaimAnotherFamily()
    {
        var ours = await api.SignUpAsync(Name("Ed"), Password);
        var (family, _) = await NedApiFactory.FamilyAsync(ours);
        var theirs = await api.SignUpAsync(Name("Flo"), Password);

        var note = Guid.NewGuid();
        var post = await theirs.PostAsJsonAsync("/api/Event", new
        {
            Guid = note, Type = "Note", Start = "2026-10-12T09:00:00Z", FamilyGuid = family
        }, cancel);

        Assert.Equal(HttpStatusCode.BadRequest, post.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ours.GetAsync($"/api/Event({note})", cancel)).StatusCode);
    }

    [Fact]
    public async Task SignUp_WithAWrongCode_IsRefused()
    {
        var response = await api.CreateClient().PostAsJsonAsync("/api/signup",
            new { Username = Name("Gus"), Password, InviteCode = "ZZZZ-ZZZZ" }, cancel);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("invite code", await response.Content.ReadAsStringAsync(cancel));
    }

    [Fact]
    public async Task SignUp_WithATakenName_IsRefused()
    {
        var response = await api.CreateClient().PostAsJsonAsync("/api/signup",
            new { Username = "John", Password }, cancel);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    async Task<Guid> PostEventAsync(HttpClient client)
    {
        var guid = Guid.NewGuid();
        var response = await client.PostAsJsonAsync("/api/Event",
            new { Guid = guid, Type = "Sleep", Start = "2026-10-10T23:05:00Z", IsNight = true }, cancel);
        Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode} {await response.Content.ReadAsStringAsync(cancel)}");
        return guid;
    }

    static string Name(string first) => $"{first}{Guid.NewGuid():N}"[..20];
}
