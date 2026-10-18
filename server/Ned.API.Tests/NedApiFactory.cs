using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Ned.API.Tests;

/// <summary>
/// The test classes share one API, since each new one would recreate the database under the others.
/// </summary>
[CollectionDefinition(nameof(NedApiFactory))]
public class NedApiCollection : ICollectionFixture<NedApiFactory>;

/// <summary>
/// Runs the API against a throwaway PostgreSQL database that is recreated for each test run.
/// </summary>
public class NedApiFactory : WebApplicationFactory<Program>
{
    const string ConnectionString = "Host=localhost;Database=ned_tests;Username=postgres;Password=postgres";

    public NedApiFactory()
    {
        var builder = new NpgsqlConnectionStringBuilder(ConnectionString) { Database = "postgres" };
        using var connection = new NpgsqlConnection(builder.ConnectionString);
        connection.Open();
        using var drop = new NpgsqlCommand("DROP DATABASE IF EXISTS ned_tests WITH (FORCE)", connection);
        drop.ExecuteNonQuery();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Tenants:Ned:ConnectionString", ConnectionString);
        // The MCP tools call the API over HTTP; in tests there's no socket, so route them into the test server.
        builder.ConfigureTestServices(services =>
            services.AddHttpClient("BeneviaOData").ConfigurePrimaryHttpMessageHandler(() => Server.CreateHandler()));
    }

    /// <summary>
    /// Signs in with a parent's development password and returns a client that sends the access token.
    /// </summary>
    public async Task<HttpClient> SignInAsync(string userName, string password)
    {
        var client = CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/signin",
            new { TenantId = "Ned", Username = userName, Password = password },
            TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<JsonObject>(TestContext.Current.CancellationToken);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", body!["accessToken"]!.GetValue<string>());
        return client;
    }
}
