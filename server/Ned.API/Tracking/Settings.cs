using System.ComponentModel;
using Ned.API.Sync;

namespace Ned.API.Tracking;

/// <summary>
/// Sleep targets shared by both phones. There is one row, with a fixed <c>Guid</c> that both phones use.
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
}
