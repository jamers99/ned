using Benevia.Core.API.Events;
using Benevia.Core.API.Extensions;
using Benevia.Core.API.Postgres;
using Benevia.Core.DataGenerator;
using Benevia.Core.Events;
using Benevia.Core.Postgres;
using Benevia.Core.Postgres.Model;
using Kennedy.API;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Core creates the admin account on first start and falls back to a well-known password.
if (!builder.Environment.IsDevelopment() && string.IsNullOrEmpty(builder.Configuration["Tenants:Kennedy:AdminPassword"]))
    throw new InvalidOperationException("Set Tenants:Kennedy:AdminPassword before the first start.");

builder.Services
    .AddCorePostgres()
    .AddCoreDataGeneration()
    .AddKennedyAPIModel()
    .AddKennedyAPIDataTypesLogic()
    .AddKennedyAPIBL()
    .AddKennedyAPIEndpoints()
    .AddCoreApiEvents(
        (o, tenant) => o.UseNpgsql(tenant?.ConnectionString),
        apiOptions: o => o.MaxODataBatchParts = 200,
        // Phones should stay signed in. Each refresh issues a new token with a fresh 90 days.
        jwtOptions: o => o.RefreshTokenExpirationDays = 90);

var app = builder.Build();
app.Services.UseBusinessLogicEvents();

var tenants = app.Services.GetAllTenantsMapped(t => new Tenant(t.Id, t.ConnectionString));
await app.Services.UseCorePostgres(tenants);
await app.Services.InitializeDataGeneratorAsync();

app.Use(async (context, next) =>
{
    context.Response.Headers.ContentSecurityPolicy =
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; " +
        "base-uri 'self'; frame-ancestors 'none'";
    await next();
});
app.UseDefaultFiles();
app.UseStaticFiles();

await app.UseCoreApi();
app.Run();

public partial class Program;
