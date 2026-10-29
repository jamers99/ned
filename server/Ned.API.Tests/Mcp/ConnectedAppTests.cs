using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Ned.API.Families;
using Ned.API.Tracking;

namespace Ned.API.Tests.Mcp;

/// <summary>
/// Connects an AI app the way Claude's connector does: discover OAuth from a 401 on /mcp, register, sign in
/// and allow on the consent page, trade the code for a token, then read and write through the API.
/// </summary>
[Collection(nameof(NedApiFactory))]
public class ConnectedAppTests(NedApiFactory api)
{
    const string RedirectUri = "https://claude.ai/api/mcp/auth_callback";
    readonly CancellationToken cancel = TestContext.Current.CancellationToken;

    [Fact]
    public async Task Mcp_WithoutAToken_PointsTheAppAtOAuth()
    {
        var browser = Browser();

        var mcp = await browser.PostAsJsonAsync("/mcp", new { jsonrpc = "2.0", id = 1, method = "ping" }, cancel);
        Assert.Equal(HttpStatusCode.Unauthorized, mcp.StatusCode);
        Assert.Contains("resource_metadata=", mcp.Headers.WwwAuthenticate.ToString());

        var resource = await browser.GetFromJsonAsync<JsonObject>("/.well-known/oauth-protected-resource", cancel);
        Assert.Equal("https://localhost/", resource!["authorization_servers"]![0]!.GetValue<string>());

        var server = await browser.GetFromJsonAsync<JsonObject>("/.well-known/oauth-authorization-server", cancel);
        Assert.Equal("https://localhost/connect/register", server!["registration_endpoint"]!.GetValue<string>());
    }

    [Fact]
    public async Task ConnectedApp_LogsSolids_AsTheParentWhoAllowedIt()
    {
        var app = await ConnectedAppAsync("Jane", "Dev-jane-1");
        var name = $"Kiwi {Guid.NewGuid():N}";
        var solids = Guid.NewGuid();

        var created = await app.PostAsJsonAsync("/api/Event", new
        {
            Guid = solids,
            Type = "Solids",
            Start = "2026-10-12T16:30:00Z",
            Foods = $"{name}\nPear\n{name.ToUpperInvariant()}"
        }, cancel);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);

        var saved = await app.GetFromJsonAsync<JsonObject>($"/api/Event({solids})?$select=LoggedBy", cancel);
        Assert.Equal("Jane", saved!["LoggedBy"]!.GetValue<string>());

        var (family, _) = await NedApiFactory.FamilyAsync(app);
        var food = await app.GetFromJsonAsync<JsonObject>(
            $"/api/Food({FoodGuid.For(family, name)})?$select=Name,UseCount,LastUsedAt,ModifiedAt", cancel);
        Assert.Equal(name, food!["Name"]!.GetValue<string>());
        Assert.Equal(1, food["UseCount"]!.GetValue<int>());
        Assert.Equal(DateTimeOffset.Parse("2026-10-12T16:30:00Z"), food["LastUsedAt"]!.GetValue<DateTimeOffset>());
        Assert.True(food["ModifiedAt"]!.GetValue<DateTimeOffset>() > DateTimeOffset.UtcNow.AddMinutes(-1),
            "The phones pull foods by ModifiedAt, so a counted food must be stamped.");
    }

    [Fact]
    public async Task PhoneSolids_LeaveTheFoodsToThePhone()
    {
        var phone = await api.SignInAsync("John", "Dev-john-1");
        var name = $"Plum {Guid.NewGuid():N}";
        var solids = Guid.NewGuid();

        var created = await phone.PostAsJsonAsync("/api/Event", new
        {
            Guid = solids, Type = "Solids", Start = "2026-10-12T16:30:00Z", Foods = name, LoggedBy = ""
        }, cancel);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);

        var saved = await phone.GetFromJsonAsync<JsonObject>($"/api/Event({solids})?$select=LoggedBy", cancel);
        Assert.Equal("John", saved!["LoggedBy"]!.GetValue<string>());
        var (family, _) = await NedApiFactory.FamilyAsync(phone);
        var food = await phone.GetAsync($"/api/Food({FoodGuid.For(family, name)})", cancel);
        Assert.Equal(HttpStatusCode.NotFound, food.StatusCode);
    }

    [Fact]
    public async Task ConnectedApp_LogsANote_ThroughTheMcpTools()
    {
        var app = await ConnectedAppAsync("John", "Dev-john-1");
        var text = $"Rolled over {Guid.NewGuid():N}";

        var initialize = await McpAsync(app, null, new
        {
            jsonrpc = "2.0", id = 1, method = "initialize",
            @params = new { protocolVersion = "2025-06-18", capabilities = new { }, clientInfo = new { name = "test", version = "1" } }
        });
        Assert.Contains("NightWaking", initialize.Body!["result"]!["instructions"]!.GetValue<string>());
        var session = initialize.Session;
        await McpAsync(app, session, new { jsonrpc = "2.0", method = "notifications/initialized" });

        // The tools stage a write, then apply it once the user approves.
        await CallToolAsync(app, session, "benevia_create", new
        {
            entitySet = "Event", stagingKey = "note", body = new { Type = "Note", Start = "2026-10-12T09:00:00Z", Text = text }
        });
        await CallToolAsync(app, session, "benevia_commit", new { action = "save", stagingKey = "note" });

        var notes = await app.GetFromJsonAsync<JsonObject>(
            $"/api/Event?$select=LoggedBy,ModifiedAt&$filter=Text eq '{text}'", cancel);
        var note = Assert.Single(notes!["value"]!.AsArray());
        Assert.Equal("John", note!["LoggedBy"]!.GetValue<string>());
        Assert.True(note["ModifiedAt"]!.GetValue<DateTimeOffset>() > DateTimeOffset.UtcNow.AddMinutes(-1));
    }

    [Fact]
    public void FoodGuid_MatchesThePhones()
    {
        // From client/src/lib/ids.ts. The first family keeps the Guids its phones gave foods before families.
        Assert.Equal(Guid.Parse("d1b871dc-f87b-579e-9e40-9c66f24fa36f"), FoodGuid.For(FamiliesUpgrade.FirstFamily, " Mango "));
        Assert.Equal(Guid.Parse("ea7fee3c-d8c3-5e3b-94e1-6b47a663f80a"),
            FoodGuid.For(Guid.Parse("0b7c4a52-9a3e-4d8f-b1a6-6f2e9c0d4e17"), "Mango"));
    }

    /// <summary>
    /// A client that sends the token a connected app gets, over HTTPS as OAuth requires.
    /// </summary>
    async Task<HttpClient> ConnectedAppAsync(string userName, string password)
    {
        var app = api.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        app.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await ConnectAsync(userName, password));
        return app;
    }

    /// <summary>
    /// Runs the OAuth flow a connector runs, with the parent allowing it on the consent page. Returns the access token.
    /// </summary>
    async Task<string> ConnectAsync(string userName, string password)
    {
        var browser = Browser();
        var registration = await browser.PostAsJsonAsync("/connect/register", new
        {
            client_name = "Claude",
            redirect_uris = new[] { RedirectUri },
            grant_types = new[] { "authorization_code", "refresh_token" },
            response_types = new[] { "code" },
            token_endpoint_auth_method = "none"
        }, cancel);
        registration.EnsureSuccessStatusCode();
        var clientId = (await registration.Content.ReadFromJsonAsync<JsonObject>(cancel))!["client_id"]!.GetValue<string>();

        var verifier = Base64Url(RandomNumberGenerator.GetBytes(32));
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var authorize = await browser.GetAsync("/connect/authorize?response_type=code" +
            $"&client_id={Uri.EscapeDataString(clientId)}&redirect_uri={Uri.EscapeDataString(RedirectUri)}" +
            "&scope=benevia.read%20benevia.write%20benevia.delete%20offline_access" +
            $"&code_challenge={challenge}&code_challenge_method=S256&state=xyz", cancel);
        Assert.Equal(HttpStatusCode.Redirect, authorize.StatusCode);
        var consentPage = authorize.Headers.Location!;
        Assert.Equal("/oauth/consent", consentPage.AbsolutePath);
        var returnUrl = System.Web.HttpUtility.ParseQueryString(consentPage.Query)["returnUrl"]!;

        var page = await browser.GetStringAsync(consentPage.PathAndQuery, cancel);
        Assert.Contains("/oauth/consent.js", page);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/oauth/consent.js", cancel)).StatusCode);

        // What consent.js does: sign in as a parent, read the app's name, then allow reading and writing.
        var signIn = await browser.PostAsJsonAsync("/api/auth/signin",
            new { TenantId = "Ned", Username = userName, Password = password }, cancel);
        var session = (await signIn.Content.ReadFromJsonAsync<JsonObject>(cancel))!["accessToken"]!.GetValue<string>();
        browser.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session);
        var info = await browser.GetFromJsonAsync<JsonObject>(
            $"/api/oauth/consent/info?clientId={Uri.EscapeDataString(clientId)}&scope=benevia.read", cancel);
        Assert.Equal("Claude", info!["clientName"]!.GetValue<string>());
        var approve = await browser.PostAsJsonAsync("/api/oauth/consent/approve",
            new { scopes = new[] { "benevia.read", "benevia.write" }, clientId }, cancel);
        approve.EnsureSuccessStatusCode();
        browser.DefaultRequestHeaders.Authorization = null;

        var approved = await browser.GetAsync($"{returnUrl}&benevia_consent=approve", cancel);
        Assert.Equal(HttpStatusCode.Redirect, approved.StatusCode);
        var callback = approved.Headers.Location!;
        Assert.StartsWith(RedirectUri, callback.ToString());
        var code = System.Web.HttpUtility.ParseQueryString(callback.Query)["code"]!;

        var tokenResponse = await browser.PostAsync("/connect/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = RedirectUri,
            ["client_id"] = clientId,
            ["code_verifier"] = verifier
        }), cancel);
        var token = await tokenResponse.Content.ReadFromJsonAsync<JsonObject>(cancel);
        Assert.True(tokenResponse.IsSuccessStatusCode, token?.ToJsonString());
        Assert.DoesNotContain("benevia.delete", token!["scope"]!.GetValue<string>());
        return token["access_token"]!.GetValue<string>();
    }

    HttpClient Browser() => api.CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
        AllowAutoRedirect = false,
        HandleCookies = true
    });

    async Task<(JsonObject? Body, string? Session)> McpAsync(HttpClient client, string? session, object message)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/mcp") { Content = JsonContent.Create(message) };
        request.Headers.Accept.ParseAdd("application/json");
        request.Headers.Accept.ParseAdd("text/event-stream");
        if (session is not null)
            request.Headers.Add("Mcp-Session-Id", session);
        var response = await client.SendAsync(request, cancel);
        var text = await response.Content.ReadAsStringAsync(cancel);
        Assert.True(response.IsSuccessStatusCode, text);
        if (string.IsNullOrWhiteSpace(text))
            return (null, session);

        // Streamable HTTP answers as JSON or as a server-sent event carrying the JSON.
        var json = text.TrimStart().StartsWith('{') ? text
            : text.Split('\n').Last(line => line.StartsWith("data:"))["data:".Length..];
        response.Headers.TryGetValues("Mcp-Session-Id", out var sessions);
        return (JsonNode.Parse(json)?.AsObject(), sessions?.FirstOrDefault() ?? session);
    }

    async Task CallToolAsync(HttpClient client, string? session, string tool, object arguments)
    {
        var result = await McpAsync(client, session, new
        {
            jsonrpc = "2.0", id = Guid.NewGuid().ToString(), method = "tools/call", @params = new { name = tool, arguments }
        });
        Assert.False(result.Body!["result"]!["isError"]?.GetValue<bool>() ?? false, result.Body.ToJsonString());
    }

    static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
