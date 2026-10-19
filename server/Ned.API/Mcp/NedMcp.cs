using Benevia.Core.API.Communications.Authentication;
using Benevia.Core.API.Workflows;
using Benevia.Core.MCP;

namespace Ned.API.Mcp;

/// <summary>
/// Lets an AI app such as Claude read and log Ned's data over MCP. The app signs in with a parent's account
/// through Core's OAuth, on the consent page served here. The phones keep using Core's own sign-in.
/// </summary>
public static class NedMcp
{
    /// <summary>
    /// What an agent needs to know about Ned, appended to Core's generic MCP rules. Clients cut the whole
    /// instructions block at 2,048 bytes and Core's rules use most of it, so keep this short.
    /// </summary>
    const string AppInstructions = """
        ## Ned
        A baby tracker. Event.Type: Sleep, NightWaking, Feed, Solids, Note. A night is one Sleep (IsNight) from bedtime to morning; NightWakings overlap it, so night sleep = its length − wakings. End is empty while a timer runs. Times are UTC; read Settings for the night range and show local times.
        Rows are never removed: skip Deleted=true, and delete by setting Deleted=true. Set IsNight on a Sleep starting in the night range. A Feed is Nursing (Left/RightSeconds) or Bottle (BottleOz). Foods: one name per line.
        """;

    /// <summary>
    /// Adds MCP and OAuth when an OAuth secret is configured. Returns whether it did.
    /// </summary>
    public static bool AddNedMcp(this WebApplicationBuilder builder)
    {
        var oauth = builder.Configuration.GetSection("OAuth").Get<CoreOAuthOptions>();
        if (string.IsNullOrEmpty(oauth?.Secret))
            return false;

        // Behind Azure's proxy the app sees plain HTTP, so OAuth must be told its public https address.
        if (!builder.Environment.IsDevelopment() && string.IsNullOrEmpty(oauth.PublicOrigin))
            throw new InvalidOperationException("Set OAuth:PublicOrigin (e.g. https://ned-baby.azurewebsites.net) with OAuth:Secret.");

        // Core's authorize endpoint sends the browser to {Client:BaseUrls[0]}/oauth/consent, which this app serves.
        if (!string.IsNullOrEmpty(oauth.PublicOrigin))
            builder.Configuration["Client:BaseUrls:0"] = oauth.PublicOrigin;

        // The MCP tools call /api over a socket to this server, at the address it listens on. Azure's container
        // has no IPv6 loopback, so listening on any address ([::]) makes that call dial [::1] and fail.
        // Listening on 0.0.0.0 makes it dial 127.0.0.1.
        var urls = builder.Configuration["URLS"];
        if (string.IsNullOrEmpty(urls) && builder.Configuration["HTTP_PORTS"] is { Length: > 0 } ports)
            urls = string.Join(';', ports.Split(';').Select(port => $"http://*:{port}"));
        if (!string.IsNullOrEmpty(urls))
            builder.WebHost.UseUrls([.. urls.Split(';', StringSplitOptions.RemoveEmptyEntries).Select(url => url
                .Replace("://[::]", "://0.0.0.0").Replace("://*", "://0.0.0.0").Replace("://+", "://0.0.0.0"))]);

        builder.Services
            .AddCoreOAuth(o =>
            {
                o.Secret = oauth.Secret;
                o.PublicOrigin = oauth.PublicOrigin;
            })
            // The MCP tools stage writes in a workflow and apply them once the user approves.
            .AddCoreApiWorkflows()
            .AddCoreMcpServer(o => o.AppInstructions = AppInstructions);
        return true;
    }

    /// <summary>
    /// Maps /mcp and the consent page. Call before UseCoreApi, so a 401 from /mcp points the app at OAuth.
    /// </summary>
    public static void UseNedMcp(this WebApplication app)
    {
        app.UseCoreMcp();
        app.MapGet("/oauth/consent", () => Page("consent.html", "text/html; charset=utf-8"));
        app.MapGet("/oauth/consent.js", () => Page("consent.js", "text/javascript; charset=utf-8"));
    }

    static IResult Page(string name, string contentType) =>
        Results.Stream(typeof(NedMcp).Assembly.GetManifestResourceStream($"Ned.API.Mcp.{name}")!, contentType);
}
