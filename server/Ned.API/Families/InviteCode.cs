using System.Security.Cryptography;

namespace Ned.API.Families;

public static class InviteCode
{
    // No 0/O or 1/I/L, so a code read aloud or off a screen is typed right the first time.
    const string Letters = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

    /// <summary>
    /// Eight random letters, shown as two groups of four: "K7QM-3WXP". About 40 bits, and sign-ups are rate-limited.
    /// </summary>
    public static string New()
    {
        var code = RandomNumberGenerator.GetString(Letters, 8);
        return $"{code[..4]}-{code[4..]}";
    }

    /// <summary>
    /// What a parent typed, as stored: upper case, with the dash, ignoring spaces.
    /// </summary>
    public static string Normalize(string typed)
    {
        var letters = new string([.. typed.ToUpperInvariant().Where(char.IsLetterOrDigit)]);
        return letters.Length == 8 ? $"{letters[..4]}-{letters[4..]}" : letters;
    }
}
