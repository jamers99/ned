using System.ComponentModel;
using Kennedy.API.Sync;
using Microsoft.EntityFrameworkCore;

namespace Kennedy.API.Tracking;

[ApiEntity]
[Index(nameof(ModifiedAt))]
[Description("Anything time-based: a sleep, a night waking, a feed, solids, or a note.")]
public partial class Event : ISynced
{
    [Property<DataTypes.Enum>("Type")]
    public partial EventType Type { get; set; }

    [Required]
    [Property<DataTypes.DateTime>("Start")]
    public partial DateTimeOffset Start { get; set; }

    [Property<DataTypes.DateTime>("End", Description = "Empty while a sleep or feed timer is running.")]
    public partial DateTimeOffset? End { get; set; }

    [Property<DataTypes.Boolean>("Night", Description = "Sleep only. A night sleep runs from bedtime to morning wake.")]
    public partial bool IsNight { get; set; }

    [Property<DataTypes.Enum>("Where")]
    public partial SleepLocation? SleepLocation { get; set; }

    [Property<DataTypes.Enum>("Fell asleep")]
    public partial SleepOnset? SleepOnset { get; set; }

    [Property<DataTypes.Enum>("Woke up")]
    public partial WakeMood? WakeMood { get; set; }

    [Property<DataTypes.Enum>("Back to sleep by", Description = "Night waking only.")]
    public partial SettledBy? SettledBy { get; set; }

    [Property<DataTypes.Enum>("Feed kind")]
    public partial FeedKind? FeedKind { get; set; }

    [Property<DataTypes.Integer>("Left seconds")]
    public partial int LeftSeconds { get; set; }

    [Property<DataTypes.Integer>("Right seconds")]
    public partial int RightSeconds { get; set; }

    [Property<DataTypes.Enum>("Started on")]
    public partial Side? StartSide { get; set; }

    [Property<DataTypes.Enum>("Active side", Description = "Nursing timer state, so a running feed survives app close.")]
    public partial Side? ActiveSide { get; set; }

    [Property<DataTypes.DateTime>("Active since", Description = "When the active side started its current run.")]
    public partial DateTimeOffset? ActiveSince { get; set; }

    [Property<DataTypes.Decimal>("Bottle (oz)")]
    public partial decimal? BottleOz { get; set; }

    [Property<DataTypes.MultilineText>("Foods", Description = "Solids only. One food name per line.")]
    public partial string Foods { get; set; }

    [Property<DataTypes.Enum>("How much")]
    public partial SolidAmount? SolidAmount { get; set; }

    [Property<DataTypes.MultilineText>("Note")]
    public partial string Text { get; set; }
}

public enum EventType
{
    Sleep,
    NightWaking,
    Feed,
    Solids,
    Note
}

public enum SleepLocation
{
    Crib,
    Contact,
    OnTheGo
}

public enum SleepOnset
{
    Own,
    Fed,
    Rocked,
    Held
}

public enum WakeMood
{
    Happy,
    Fussy,
    Crying
}

public enum SettledBy
{
    Feeding,
    Soothing,
    Own
}

public enum FeedKind
{
    Nursing,
    Bottle
}

public enum Side
{
    Left,
    Right
}

public enum SolidAmount
{
    Taste,
    Some,
    All
}
