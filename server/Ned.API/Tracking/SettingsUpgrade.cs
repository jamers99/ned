using Benevia.Core.Postgres.Subscribers.Attributes;
using Benevia.Core.Postgres.Subscribers.EventAgrs;
using Ned.API.Families;

namespace Ned.API.Tracking;

/// <summary>
/// The two nap wake windows became one, and the bedtime window became a night range (8 PM – 6 AM).
/// Each script also stamps <c>ModifiedAt</c>, so the phones pull the changed row on their next sync.
/// </summary>
public class SettingsUpgrade
{
    [PropertyAdded(nameof(Settings), nameof(Settings.NapWakeWindowMinutes))]
    public void KeepTheFirstNapWakeWindow(PropertyAddedEventArgs args) =>
        args.UpgradeScript($"""
            UPDATE "{args.TableName}" SET "{args.ColumnName}" = "Nap1WakeWindowMinutes", "ModifiedAt" = now();
            """);

    [PropertyAdded(nameof(Settings), nameof(Settings.NightStartMinutes))]
    public void StartNightAt8PM(PropertyAddedEventArgs args) =>
        args.UpgradeScript($"""UPDATE "{args.TableName}" SET "{args.ColumnName}" = {20 * 60}, "ModifiedAt" = now();""");

    [PropertyAdded(nameof(Settings), nameof(Settings.NightEndMinutes))]
    public void EndNightAt6AM(PropertyAddedEventArgs args) =>
        args.UpgradeScript($"""UPDATE "{args.TableName}" SET "{args.ColumnName}" = {6 * 60}, "ModifiedAt" = now();""");

    // The app was written for Kennedy before her name became a setting. The first family's Settings row may still
    // have its old Guid, since families arrive in the same upgrade.
    // Both columns arrive together; the scripts run once they exist.
    [PropertyAdded(nameof(Settings), nameof(Settings.BabyName))]
    public void NameKennedy(PropertyAddedEventArgs args) =>
        args.UpgradeScript($"""
            UPDATE "{args.TableName}"
            SET "{nameof(Settings.BabyName)}" = 'Kennedy', "{nameof(Settings.BabyPronouns)}" = {(int)Pronouns.She},
                "ModifiedAt" = now()
            WHERE "Guid" IN ('{FamiliesUpgrade.FirstFamily}', '{FamiliesUpgrade.OldSettingsGuid}');
            """);
}
