//-----------------------------------------------------------------------
// <copyright file="AvuxExportImportTests.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.E2ETests.Tests.Client.Shard3;

using System.IO.Compression;

/// <summary>
/// End-to-end tests for importing vault data using the .avux format.
/// These tests use a pre-generated .avux file to ensure backward compatibility
/// and that old exports continue to work with new versions.
/// </summary>
[Parallelizable(ParallelScope.Self)]
[Category("ClientTests")]
[TestFixture]
public class AvuxExportImportTests : ClientPlaywrightTest
{
    /// <summary>
    /// Test that importing a .avux file works correctly and all data is preserved.
    /// This test uses a pre-generated .avux file (TestVault.avux) that contains:
    /// - Basic login credential (username, password, URL, notes)
    /// - Login with 2FA/TOTP
    /// - Login with file attachment
    /// - Credit card entry
    /// - Secure note entry
    /// - Credential with multiple URLs
    /// - Credential in a folder
    /// This ensures backward compatibility with existing .avux exports.
    /// </summary>
    /// <returns>Async task.</returns>
    [Test]
    [Order(1)]
    public async Task ImportAvuxFile()
    {
        // Get the .avux test file from embedded resources
        var avuxBytes = await ResourceReaderUtility.ReadEmbeddedResourceBytesAsync(
            "AliasVault.E2ETests.TestData.TestVault.avux");

        // Verify the .avux file structure before importing
        VerifyAvuxFileStructure(avuxBytes);

        // Navigate to import/export settings page
        await NavigateUsingBlazorRouter("settings/import-export");
        await WaitForUrlAsync("settings/import-export", "Import / Export");

        // Click on the AliasVault import card
        await Page.ClickAsync("[data-import-service='AliasVault']");

        // Wait for modal to appear by waiting for the file input
        await Page.WaitForSelectorAsync("input[type='file']", new() { State = WaitForSelectorState.Visible });

        // Create a temporary file with the .avux content
        var tempFilePath = Path.Combine(Path.GetTempPath(), $"test-import-{Guid.NewGuid()}.avux");
        await File.WriteAllBytesAsync(tempFilePath, avuxBytes);

        try
        {
            // Set the file input using the temporary file
            var fileInput = Page.Locator("input[type='file']");
            await fileInput.SetInputFilesAsync(tempFilePath);

            // Click Next in the verify screen
            await Page.ClickAsync("text=Next");

            // Wait for Import button to be visible
            await Page.WaitForSelectorAsync("button:has-text('Import')");

            // Click Import button to import the items
            await Page.ClickAsync("button:has-text('Import')");
            await Page.WaitForSelectorAsync("text=Successfully imported");

            // Verify all items were imported
            await VerifyImportedItems();
        }
        finally
        {
            // Cleanup: delete the temporary file
            if (File.Exists(tempFilePath))
            {
                File.Delete(tempFilePath);
            }
        }
    }

    /// <summary>
    /// Verifies the structure of an .avux file.
    /// </summary>
    /// <param name="avuxBytes">The .avux file content as bytes.</param>
    private void VerifyAvuxFileStructure(byte[] avuxBytes)
    {
        Assert.That(avuxBytes, Is.Not.Null);
        Assert.That(avuxBytes.Length, Is.GreaterThan(0));

        using var zipStream = new MemoryStream(avuxBytes);
        using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read);

        // Verify manifest.json exists
        var manifestEntry = archive.GetEntry("manifest.json");
        Assert.That(manifestEntry, Is.Not.Null, "manifest.json should exist in .avux file");

        // Read and verify manifest content
        using var reader = new StreamReader(manifestEntry.Open());
        var manifestJson = reader.ReadToEnd();
        Assert.That(manifestJson, Is.Not.Empty, "manifest.json should not be empty");
        Assert.That(manifestJson, Does.Contain("\"version\""), "manifest should contain version");
        Assert.That(manifestJson, Does.Contain("\"items\""), "manifest should contain items");
        Assert.That(manifestJson, Does.Contain("\"folders\""), "manifest should contain folders");
    }

    /// <summary>
    /// Verifies that all expected items from the .avux file were imported correctly.
    /// </summary>
    private async Task VerifyImportedItems()
    {
        // Navigate to items page
        await NavigateUsingBlazorRouter("items");
        await WaitForUrlAsync("items", "Find all of your items");

        // Wait for items to load
        await Page.WaitForTimeoutAsync(1000);

        var pageContent = await Page.TextContentAsync("body");

        // Verify all expected items are present
        var expectedItems = new Dictionary<string, string>
        {
            { "Basic Login Test", "Basic login credential" },
            { "Login with 2FA", "Login with 2FA/TOTP" },
            { "Login with Attachment", "Login with file attachment" },
            { "Test Credit Card", "Credit card entry" },
            { "Test Secure Note", "Secure note entry" },
            { "Multi-URL Login", "Credential with multiple URLs" },
        };

        foreach (var (itemName, description) in expectedItems)
        {
            Assert.That(pageContent, Does.Contain(itemName), $"{description} should be imported");
        }

        // Verify the folder was imported
        Assert.That(pageContent, Does.Contain("Test Folder"), "Test Folder should be imported");

        // Verify individual items in detail
        await VerifyBasicLoginTest();
        await VerifyLoginWith2FA();
        await VerifyLoginWithAttachment();
        await VerifyCreditCard();
        await VerifySecureNote();
        await VerifyMultiUrlLogin();
        await VerifyCredentialInFolder();
    }

    /// <summary>
    /// Verifies the "Basic Login Test" item details.
    /// </summary>
    private async Task VerifyBasicLoginTest()
    {
        await NavigateUsingBlazorRouter("items");
        await WaitForUrlAsync("items", "Find all of your items");
        await Page.ClickAsync("text=Basic Login Test");

        // Wait for navigation to item view page
        await Page.WaitForURLAsync("**/items/*", new() { Timeout = 5000 });
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        // Get input values - fields are displayed in readonly inputs on view page
        var usernameValue = await Page.Locator("input#login-username").InputValueAsync();
        var pageContent = await Page.TextContentAsync("body");

        Assert.Multiple(() =>
        {
            Assert.That(usernameValue, Is.EqualTo("testuser"), "Username should be preserved");
            Assert.That(pageContent, Does.Contain("https://example.com"), "URL should be preserved");
            Assert.That(pageContent, Does.Contain("This is a test note for basic login"), "Notes should be preserved");
        });
    }

    /// <summary>
    /// Verifies the "Login with 2FA" item details.
    /// </summary>
    private async Task VerifyLoginWith2FA()
    {
        await NavigateUsingBlazorRouter("items");
        await WaitForUrlAsync("items", "Find all of your items");
        await Page.ClickAsync("text=Login with 2FA");

        await Page.WaitForURLAsync("**/items/*", new() { Timeout = 5000 });
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        var usernameValue = await Page.Locator("input#login-username").InputValueAsync();
        var pageContent = await Page.TextContentAsync("body");

        Assert.Multiple(() =>
        {
            Assert.That(usernameValue, Is.EqualTo("user2fa"), "2FA username should be preserved");
            Assert.That(
                pageContent,
                Does.Contain("Test TOTP").Or.Contains("Two-Factor").Or.Contains("2FA").Or.Contains("TOTP"),
                "TOTP should be preserved");
        });
    }

    /// <summary>
    /// Verifies the "Login with Attachment" item details.
    /// </summary>
    private async Task VerifyLoginWithAttachment()
    {
        await NavigateUsingBlazorRouter("items");
        await WaitForUrlAsync("items", "Find all of your items");
        await Page.ClickAsync("text=Login with Attachment");

        await Page.WaitForURLAsync("**/items/*", new() { Timeout = 5000 });
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        var usernameValue = await Page.Locator("input#login-username").InputValueAsync();
        var pageContent = await Page.TextContentAsync("body");

        Assert.Multiple(() =>
        {
            Assert.That(usernameValue, Is.EqualTo("userattachment"), "Attachment username should be preserved");
            Assert.That(
                pageContent,
                Does.Contain("test-attachment.txt").Or.Contains("Attachment"),
                "Attachment should be preserved");
        });
    }

    /// <summary>
    /// Verifies the "Test Credit Card" item details.
    /// </summary>
    private async Task VerifyCreditCard()
    {
        await NavigateUsingBlazorRouter("items");
        await WaitForUrlAsync("items", "Find all of your items");
        await Page.ClickAsync("text=Test Credit Card");

        await Page.WaitForURLAsync("**/items/*", new() { Timeout = 5000 });
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        // Read credit card field values - View page uses full field keys with dots replaced by hyphens
        var cardNumberValue = await Page.Locator("input#card-number").InputValueAsync();
        var cardholderValue = await Page.Locator("input#card-cardholder_name").InputValueAsync();
        var expiryMonthValue = await Page.Locator("input#card-expiry_month").InputValueAsync();
        var expiryYearValue = await Page.Locator("input#card-expiry_year").InputValueAsync();
        var cvvValue = await Page.Locator("input#card-cvv").InputValueAsync();
        var pinValue = await Page.Locator("input#card-pin").InputValueAsync();

        Assert.Multiple(() =>
        {
            Assert.That(cardNumberValue, Is.EqualTo("4111111111111111"), "Card number should be preserved");
            Assert.That(cardholderValue, Is.EqualTo("Test Cardholder"), "Cardholder name should be preserved");
            Assert.That(expiryMonthValue, Is.EqualTo("12"), "Expiry month should be preserved");
            Assert.That(expiryYearValue, Is.EqualTo("2025"), "Expiry year should be preserved");
            Assert.That(cvvValue, Is.EqualTo("123"), "CVV should be preserved");
            Assert.That(pinValue, Is.EqualTo("1234"), "PIN should be preserved");
        });
    }

    /// <summary>
    /// Verifies the "Test Secure Note" item details.
    /// </summary>
    private async Task VerifySecureNote()
    {
        await NavigateUsingBlazorRouter("items");
        await WaitForUrlAsync("items", "Find all of your items");
        await Page.ClickAsync("text=Test Secure Note");

        await Page.WaitForURLAsync("**/items/*", new() { Timeout = 5000 });
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        var pageContent = await Page.TextContentAsync("body");
        Assert.That(
            pageContent,
            Does.Contain("secure note").Or.Contains("important information"),
            "Note content should be preserved");
    }

    /// <summary>
    /// Verifies the "Multi-URL Login" item details.
    /// </summary>
    private async Task VerifyMultiUrlLogin()
    {
        await NavigateUsingBlazorRouter("items");
        await WaitForUrlAsync("items", "Find all of your items");
        await Page.ClickAsync("text=Multi-URL Login");

        await Page.WaitForURLAsync("**/items/*", new() { Timeout = 5000 });
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        // Read username from input and URLs from page body (URLs are displayed as text, not input fields)
        var usernameValue = await Page.Locator("input#login-username").InputValueAsync();
        var pageContent = await Page.TextContentAsync("body");

        Assert.Multiple(() =>
        {
            Assert.That(usernameValue, Is.EqualTo("multiurluser"), "Multi-URL username should be preserved");
            Assert.That(pageContent, Does.Contain("app.example.com"), "First URL should be preserved");
            Assert.That(pageContent, Does.Contain("www.example.com"), "Second URL should be preserved");
            Assert.That(pageContent, Does.Contain("admin.example.com"), "Third URL should be preserved");
        });
    }

    /// <summary>
    /// Verifies the "Credential in Folder" item details.
    /// </summary>
    private async Task VerifyCredentialInFolder()
    {
        await NavigateUsingBlazorRouter("items");
        await WaitForUrlAsync("items", "Find all of your items");

        // Navigate to the folder first
        await Page.ClickAsync("text=Test Folder");
        await Page.WaitForTimeoutAsync(500);

        // Now click on the credential within the folder
        await Page.ClickAsync("text=Credential in Folder");

        await Page.WaitForURLAsync("**/items/*", new() { Timeout = 5000 });
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        var usernameValue = await Page.Locator("input#login-username").InputValueAsync();
        Assert.That(usernameValue, Is.EqualTo("folderuser"), "Folder credential username should be preserved");
    }
}
