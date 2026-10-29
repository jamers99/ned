using Benevia.Core.Postgres.Subscribers.Attributes;
using Benevia.Core.Postgres.Subscribers.EventAgrs;

namespace Ned.API.Families;

/// <summary>
/// Before anyone could sign up, Ned had one family: every parent and every record. They become the first family.
/// </summary>
public class FamiliesUpgrade
{
    /// <summary>
    /// The first family's Guid is the namespace its phones already derived food Guids from, so those stay the same.
    /// </summary>
    public static readonly Guid FirstFamily = Guid.Parse("3f6b2c1e-8d4a-4f0b-9c7e-1a2b3c4d5e6f");

    // The one Settings row every phone used. A family's Settings row now has the family's Guid.
    public const string OldSettingsGuid = "5e771465-0000-4000-8000-000000000001";

    [EntityAdded(typeof(Member))]
    public void PutEveryoneInTheFirstFamily(EntityAddedEventArgs args) =>
        args.UpgradeScript($"""
            INSERT INTO "Family" ("Guid", "InviteCode")
            SELECT '{FirstFamily}', substr(code, 1, 4) || '-' || substr(code, 5, 4)
            FROM (SELECT upper(substr(md5(random()::text), 1, 8)) AS code) random
            WHERE EXISTS (SELECT 1 FROM "UserRoles" ur JOIN "Roles" r ON r."Id" = ur."RoleId" WHERE r."Name" = 'Parent');
            INSERT INTO "{args.TableName}" ("Guid", "FamilyGuid")
            SELECT ur."UserId", '{FirstFamily}' FROM "UserRoles" ur JOIN "Roles" r ON r."Id" = ur."RoleId" WHERE r."Name" = 'Parent';
            UPDATE "Event" SET "FamilyGuid" = '{FirstFamily}' WHERE EXISTS (SELECT 1 FROM "Family");
            UPDATE "Growth" SET "FamilyGuid" = '{FirstFamily}' WHERE EXISTS (SELECT 1 FROM "Family");
            UPDATE "Food" SET "FamilyGuid" = '{FirstFamily}' WHERE EXISTS (SELECT 1 FROM "Family");
            UPDATE "Settings" SET "Guid" = '{FirstFamily}', "FamilyGuid" = '{FirstFamily}', "ModifiedAt" = now()
            WHERE "Guid" = '{OldSettingsGuid}' AND EXISTS (SELECT 1 FROM "Family");
            """);
}
