//-----------------------------------------------------------------------
// <copyright file="DbCleanupTests.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.E2ETests.Tests.Client.Shard2;

/// <summary>
/// End-to-end tests for the client trash bin functionality.
/// Items are moved to trash (DeletedAt set) when deleted, and remain there for 30 days
/// before being automatically pruned by the vault_pruner.
/// </summary>
[TestFixture]
[Category("ClientTests")]
[NonParallelizable]
public class DbCleanupTests : ClientPlaywrightTest
{
    /// <summary>
    /// Test that deleted items are moved to trash (DeletedAt is set) rather than being immediately removed.
    /// </summary>
    /// <returns>Async task.</returns>
    [Test]
    [Order(1)]
    public async Task DeletedItemsAreMovedToTrashTest()
    {
        // Create two items. One random and one with a known name.
        await CreateItemEntry();
        await CreateItemEntry(new Dictionary<string, string> { { "service-name", "ItemB" } });

        // Delete the item with the known name.
        await DeleteItemEntry("ItemB");

        // Navigate to recently deleted page and verify item is there.
        await NavigateUsingBlazorRouter("items/recently-deleted");

        // Wait for the page to load and check for the deleted item.
        await Page.WaitForSelectorAsync("[data-testid='recently-deleted-item']");
        var deletedItems = await Page.Locator("[data-testid='recently-deleted-item']").CountAsync();
        Assert.That(deletedItems, Is.EqualTo(1), "Expected 1 item in recently deleted.");

        // Verify the item name is displayed.
        var itemName = await Page.Locator("[data-testid='recently-deleted-item-name']").TextContentAsync();
        Assert.That(itemName, Does.Contain("ItemB"), "Expected deleted item to be ItemB.");
    }

    /// <summary>
    /// Test that items can be restored from the trash.
    /// </summary>
    /// <returns>Async task.</returns>
    [Test]
    [Order(2)]
    public async Task ItemsCanBeRestoredFromTrashTest()
    {
        // Create and delete an item.
        await CreateItemEntry(new Dictionary<string, string> { { "service-name", "RestoreMe" } });
        await DeleteItemEntry("RestoreMe");

        // Navigate to recently deleted page.
        await NavigateUsingBlazorRouter("items/recently-deleted");

        // Wait for the page to load.
        await Page.WaitForSelectorAsync("[data-testid='recently-deleted-item']");

        // Click the restore button.
        await Page.Locator("[data-testid='restore-button']").First.ClickAsync();

        // Wait for restore to complete and navigate to items list.
        await WaitForUrlAsync("**/items", 5000);

        // Verify the item is back in the list.
        var itemCard = await Page.Locator($"text=RestoreMe").CountAsync();
        Assert.That(itemCard, Is.GreaterThan(0), "Expected restored item to appear in items list.");
    }

    /// <summary>
    /// Test that items can be permanently deleted from the trash.
    /// </summary>
    /// <returns>Async task.</returns>
    [Test]
    [Order(3)]
    public async Task ItemsCanBePermanentlyDeletedTest()
    {
        // Create and delete an item.
        await CreateItemEntry(new Dictionary<string, string> { { "service-name", "DeleteForever" } });
        await DeleteItemEntry("DeleteForever");

        // Navigate to recently deleted page.
        await NavigateUsingBlazorRouter("items/recently-deleted");

        // Wait for the page to load.
        await Page.WaitForSelectorAsync("[data-testid='recently-deleted-item']");

        // Click the permanently delete button.
        await Page.Locator("[data-testid='permanent-delete-button']").First.ClickAsync();

        // Confirm the deletion in the modal.
        await Page.Locator("[data-testid='confirm-delete-button']").ClickAsync();

        // Wait for deletion to complete.
        await Page.WaitForTimeoutAsync(1000);

        // Verify the item is no longer in the trash.
        var deletedItems = await Page.Locator("[data-testid='recently-deleted-item']").CountAsync();
        Assert.That(deletedItems, Is.EqualTo(0), "Expected no items in recently deleted after permanent deletion.");
    }
}
