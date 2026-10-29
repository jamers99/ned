using System.Security.Cryptography;
using System.Text;

namespace Ned.API.Tracking;

/// <summary>
/// The same name-based Guid the phones give a food (client/src/lib/ids.ts), so "Mango" is one row per family
/// however it's added.
/// </summary>
public static class FoodGuid
{
    /// <summary>
    /// A UUIDv5 (SHA-1) of the trimmed, lower-cased name, in the family's Guid as the namespace.
    /// </summary>
    public static Guid For(Guid family, string name)
    {
        var hash = SHA1.HashData([.. family.ToByteArray(bigEndian: true), .. Encoding.UTF8.GetBytes(name.Trim().ToLowerInvariant())]);
        hash[6] = (byte)((hash[6] & 0x0f) | 0x50);
        hash[8] = (byte)((hash[8] & 0x3f) | 0x80);
        return new Guid(hash.AsSpan(0, 16), bigEndian: true);
    }
}
