using System.ComponentModel;
using Ned.API.Sync;

namespace Ned.API.Tracking;

/// <summary>
/// Sleep targets shared by a family's phones. There is one row per family, and its <c>Guid</c> is the family's.
/// </summary>
[ApiEntity]
public partial class Settings : ISynced
{
    [Property<DataTypes.Integer>("Naps per day")]
    [DefaultValue(2)]
    public partial int NapsPerDay { get; set; }

    [Property<DataTypes.Integer>("Wake window before a nap (minutes)")]
    [DefaultValue(150)]
    public partial int NapWakeWindowMinutes { get; set; }

    [Property<DataTypes.Integer>("Wake window before bed (minutes)")]
    [DefaultValue(210)]
    public partial int BedtimeWakeWindowMinutes { get; set; }

    [Property<DataTypes.Integer>("Night starts (minutes after midnight)")]
    [DefaultValue(20 * 60)]
    public partial int NightStartMinutes { get; set; }

    [Property<DataTypes.Integer>("Night ends (minutes after midnight)")]
    [DefaultValue(6 * 60)]
    public partial int NightEndMinutes { get; set; }

    [Property<DataTypes.Text>("Baby's name", Description = "Empty until a parent fills it in; the app then says \"Baby\".")]
    public partial string BabyName { get; set; }

    [Property<DataTypes.Enum>("Baby's pronouns")]
    [DefaultValue(Pronouns.They)]
    public partial Pronouns BabyPronouns { get; set; }
}

public enum Pronouns
{
    She,
    He,
    They
}
