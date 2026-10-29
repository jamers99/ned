using Benevia.Core.API.Communications.Authentication.Models;
using Benevia.Core.API.Communications.Authentication.Services.Tenant;
using Benevia.Core.API.Database;
using Benevia.Core.API.Roles;
using Benevia.Core.Events;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Ned.API.Parents;

namespace Ned.API.Families;

public record SignUpDto(string? Username, string? Password, string? InviteCode);

/// <summary>
/// Anyone can make an account. Without an invite code it starts a new family; with one, it joins that family.
/// The phone then signs in with Core's <c>/api/auth/signin</c> as usual.
/// </summary>
[ApiController]
[Route("api/signup")]
[EnableRateLimiting(RateLimit)]
public class SignUpController(
    DbContext dbContext,
    ITenantService tenants,
    UserManager<User> userManager,
    IDataContext dataContext,
    EventContext eventContext) : ControllerBase
{
    public const string RateLimit = "signup";
    public const string TenantId = "Ned";

    [HttpPost]
    public async Task<IActionResult> SignUpAsync([FromBody] SignUpDto dto, CancellationToken cancel)
    {
        var userName = dto.Username?.Trim() ?? string.Empty;
        if (userName.Length is < 2 or > 40)
            return BadRequest("Choose a user name of 2 to 40 letters.");
        if (string.IsNullOrEmpty(dto.Password))
            return BadRequest("Choose a password.");

        dbContext.Database.SetConnectionString(tenants.GetAll()[TenantId].ConnectionString);
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancel);

        Family? family = null;
        if (!string.IsNullOrWhiteSpace(dto.InviteCode))
        {
            var code = InviteCode.Normalize(dto.InviteCode);
            family = dataContext.GetEntities<Family>().FirstOrDefault(f => f.InviteCode == code);
            if (family is null)
                return BadRequest("That invite code doesn't match a family. Check it with your partner.");
        }

        var role = await dbContext.Set<Role>().SingleAsync(r => r.Name == ParentsBlankData.ParentRole, cancel);
        // Core's users see everything unless told otherwise; a parent sees only their family.
        var user = new User { UserName = userName, FirstName = userName, HasFullAccess = false };
        var created = await userManager.CreateAsync(user, dto.Password);
        if (!created.Succeeded)
            return BadRequest(string.Join(" ", created.Errors.Select(e => e.Description)));

        dataContext.AddEntity(new UserRole { UserId = user.Id, RoleId = role.Id });
        family ??= new Family(eventContext) { InviteCode = InviteCode.New() };
        _ = new Member(eventContext) { Guid = user.Id, Family = family };
        if (!dataContext.SaveChanges())
            return Problem("Could not create the account. Try again.");

        await transaction.CommitAsync(cancel);
        return Ok(new { username = user.UserName });
    }
}
