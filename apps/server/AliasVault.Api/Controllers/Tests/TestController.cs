//-----------------------------------------------------------------------
// <copyright file="TestController.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

/*
 * Note: this file is used for E2E testing purposes only. It contains test endpoints that are used by
 * E2E tests (browser extension Playwright tests, mobile app UI tests) to manipulate server state.
 *
 * Security measures:
 * 1. All endpoints check IsDevelopment() and return 404 in production
 * 2. All endpoints are hidden from Swagger documentation via ApiExplorerSettings
 */

namespace AliasVault.Api.Controllers.Tests;

using AliasServerDb;
using AliasVault.Api.Controllers.Abstracts;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Test controller that contains test endpoints for E2E testing purposes.
/// All endpoints are hidden from Swagger and only work in Development environment.
/// </summary>
/// <param name="userManager">UserManager instance.</param>
/// <param name="environment">IWebHostEnvironment instance.</param>
/// <param name="dbContextFactory">DbContext factory instance.</param>
[ApiVersion("1")]
[ApiExplorerSettings(IgnoreApi = true)]
public class TestController(
    UserManager<AliasVaultUser> userManager,
    IWebHostEnvironment environment,
    IAliasServerDbContextFactory dbContextFactory) : AuthenticatedRequestController(userManager)
{
    /// <summary>
    /// Authenticated test request. Used to verify authentication is working.
    /// </summary>
    /// <returns>Static OK.</returns>
    [HttpGet("")]
    public IActionResult TestCall()
    {
        if (!environment.IsDevelopment())
        {
            return NotFound();
        }

        return Ok();
    }

    /// <summary>
    /// Test request that throws an exception. Used for testing error handling.
    /// </summary>
    /// <returns>Never returns - always throws.</returns>
    [AllowAnonymous]
    [HttpGet("Error")]
    public IActionResult TestCallError()
    {
        if (!environment.IsDevelopment())
        {
            return NotFound();
        }

        // Throw an exception here to test error handling.
        throw new ArgumentException("Test error");
    }

    /// <summary>
    /// Delete the newest vault revisions for the current user.
    /// Used for testing RPO (Recovery Point Objective) recovery scenarios.
    /// </summary>
    /// <param name="count">Number of newest revisions to delete.</param>
    /// <returns>OK with the number of deleted revisions, or NotFound in production.</returns>
    [HttpDelete("vault-revisions/{count:int}")]
    public async Task<IActionResult> DeleteVaultRevisions(int count)
    {
        if (!environment.IsDevelopment())
        {
            return NotFound();
        }

        if (count <= 0)
        {
            return BadRequest("Count must be greater than 0");
        }

        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        await using var context = await dbContextFactory.CreateDbContextAsync();

        // Get the newest revisions to delete
        var revisionsToDelete = await context.Vaults
            .Where(v => v.UserId == user.Id)
            .OrderByDescending(v => v.RevisionNumber)
            .Take(count)
            .ToListAsync();

        if (revisionsToDelete.Count == 0)
        {
            return Ok(new { deleted = 0, message = "No revisions found to delete" });
        }

        // Delete the revisions
        context.Vaults.RemoveRange(revisionsToDelete);
        var deletedCount = await context.SaveChangesAsync();

        return Ok(new
        {
            deleted = revisionsToDelete.Count,
            deletedRevisions = revisionsToDelete.Select(r => r.RevisionNumber).ToList(),
            message = $"Deleted {revisionsToDelete.Count} vault revision(s)",
        });
    }

    /// <summary>
    /// Get vault revision information for the current user.
    /// Used for E2E tests to verify vault state.
    /// </summary>
    /// <returns>Vault revision information.</returns>
    [HttpGet("vault-revisions")]
    public async Task<IActionResult> GetVaultRevisions()
    {
        if (!environment.IsDevelopment())
        {
            return NotFound();
        }

        var user = await GetCurrentUserAsync();
        if (user == null)
        {
            return Unauthorized();
        }

        await using var context = await dbContextFactory.CreateDbContextAsync();

        var revisions = await context.Vaults
            .Where(v => v.UserId == user.Id)
            .OrderByDescending(v => v.RevisionNumber)
            .Select(v => new
            {
                v.RevisionNumber,
                v.CreatedAt,
                v.UpdatedAt,
            })
            .ToListAsync();

        return Ok(new
        {
            count = revisions.Count,
            currentRevision = revisions.FirstOrDefault()?.RevisionNumber ?? 0,
            revisions,
        });
    }
}
