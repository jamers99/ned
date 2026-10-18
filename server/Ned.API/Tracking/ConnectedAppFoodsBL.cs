using Benevia.Core.Events.LogicBuilders;

namespace Ned.API.Tracking;

/// <summary>
/// A phone that saves solids also counts each food in Food, which feeds the Solids screen's recents. An AI app
/// connected over MCP can't work out a food's Guid, so the server counts the foods of the solids it logs.
/// Phones are left alone: their own count would be counted twice.
/// </summary>
[Logic]
public class ConnectedAppFoodsBL(Event.Logic events, IHttpContextAccessor http)
{
    // Core stamps the tokens it issues to connected apps with this kind.
    const string TokenKind = "tokenKind";
    const string ConnectedApp = "delegated_app";

    [RegisterLogic]
    public void CountTheFoodsOfSolidsFromConnectedApps()
    {
        events.OnPreSave().Do((solids, args) =>
        {
            if (solids.Type != EventType.Solids || !solids._State.IsNew
                || http.HttpContext?.User.FindFirst(TokenKind)?.Value != ConnectedApp)
                return;

            foreach (var name in FoodNames(solids.Foods))
            {
                var guid = FoodGuid.For(name);
                var food = args.Context.GetNewEntities<Food>().FirstOrDefault(f => f.Guid == guid)
                    ?? args.GetEntity<Food>(guid)
                    ?? new Food(args.Context) { Guid = guid, Name = name };
                food.UseCount++;
                if (food.LastUsedAt is null || food.LastUsedAt < solids.Start)
                    food.LastUsedAt = solids.Start;
            }
        });
    }

    static IEnumerable<string> FoodNames(string? foods) =>
        (foods ?? string.Empty).Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .DistinctBy(name => name.ToLowerInvariant());
}
