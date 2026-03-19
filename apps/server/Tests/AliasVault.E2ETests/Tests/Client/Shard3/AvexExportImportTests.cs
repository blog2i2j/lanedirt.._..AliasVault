//-----------------------------------------------------------------------
// <copyright file="AvexExportImportTests.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.E2ETests.Tests.Client.Shard3;

/// <summary>
/// End-to-end tests for importing vault data using the .avex (encrypted) format.
/// These tests use a pre-generated .avex file to ensure backward compatibility
/// and that encrypted exports continue to work with new versions.
/// </summary>
[Parallelizable(ParallelScope.Self)]
[Category("ClientTests")]
[TestFixture]
public class AvexExportImportTests : VaultImportTestsBase
{
    /// <summary>
    /// Gets the test password used for .avex encryption (must match the password used in GenerateAvuxAvexTestFile test).
    /// </summary>
    private const string TestAvexPassword = "testexportpass123";

    /// <summary>
    /// Test that importing an encrypted .avex file works correctly and all data is preserved.
    /// This test uses a pre-generated .avex file (TestVault.avex) that contains the same items as TestVault.avux,
    /// but encrypted with a password. This ensures backward compatibility with existing .avex exports
    /// and validates the password-based decryption flow.
    /// </summary>
    /// <returns>Async task.</returns>
    [Test]
    [Order(1)]
    public async Task ImportAvexFile()
    {
        // Get the .avex test file from embedded resources
        var avexBytes = await ResourceReaderUtility.ReadEmbeddedResourceBytesAsync("AliasVault.E2ETests.TestData.TestVault.avex");

        Assert.That(avexBytes, Is.Not.Null);
        Assert.That(avexBytes.Length, Is.GreaterThan(0), ".avex file should not be empty");

        // Navigate to import/export settings page
        await NavigateUsingBlazorRouter("settings/import-export");
        await WaitForUrlAsync("settings/import-export", "Import / Export");

        // Click on the AliasVault import card
        await Page.ClickAsync("[data-import-service='AliasVault']");

        // Wait for modal to appear by waiting for the file input
        await Page.WaitForSelectorAsync("input[type='file']", new() { State = WaitForSelectorState.Visible });

        // Create a temporary file with the .avex content
        var tempFilePath = Path.Combine(Path.GetTempPath(), $"test-import-{Guid.NewGuid()}.avex");
        await File.WriteAllBytesAsync(tempFilePath, avexBytes);

        try
        {
            // Set the file input using the temporary file
            var fileInput = Page.Locator("input[type='file']");
            await fileInput.SetInputFilesAsync(tempFilePath);

            // Wait for password input to appear (encrypted .avex requires password)
            await Page.WaitForSelectorAsync("input[type='password']", new() { State = WaitForSelectorState.Visible, Timeout = 10000 });

            // Enter the decryption password
            await Page.FillAsync("input[type='password']", TestAvexPassword);

            // Click Decrypt/Next button
            await Page.ClickAsync("button:has-text('Decrypt')");

            // Wait for the verification screen to load
            await Page.WaitForSelectorAsync("button:has-text('Next')", new() { State = WaitForSelectorState.Visible, Timeout = 10000 });

            // Click Next in the verify screen
            await Page.ClickAsync("text=Next");

            // Wait for Import button to be visible
            await Page.WaitForSelectorAsync("button:has-text('Import')");

            // Click Import button to import the items
            await Page.ClickAsync("button:has-text('Import')");
            await Page.WaitForSelectorAsync("text=Successfully imported");

            // Verify all items were imported using shared verification logic
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
    /// Test that importing a .avex file with an incorrect password fails gracefully.
    /// </summary>
    /// <returns>Async task.</returns>
    [Test]
    [Order(2)]
    public async Task ImportAvexFileWithWrongPassword()
    {
        // Get the .avex test file from embedded resources
        var avexBytes = await ResourceReaderUtility.ReadEmbeddedResourceBytesAsync("AliasVault.E2ETests.TestData.TestVault.avex");

        // Navigate to import/export settings page
        await NavigateUsingBlazorRouter("settings/import-export");
        await WaitForUrlAsync("settings/import-export", "Import / Export");

        // Click on the AliasVault import card
        await Page.ClickAsync("[data-import-service='AliasVault']");

        // Wait for modal to appear by waiting for the file input
        await Page.WaitForSelectorAsync("input[type='file']", new() { State = WaitForSelectorState.Visible });

        // Create a temporary file with the .avex content
        var tempFilePath = Path.Combine(Path.GetTempPath(), $"test-import-{Guid.NewGuid()}.avex");
        await File.WriteAllBytesAsync(tempFilePath, avexBytes);

        try
        {
            // Set the file input using the temporary file
            var fileInput = Page.Locator("input[type='file']");
            await fileInput.SetInputFilesAsync(tempFilePath);

            // Wait for password input to appear
            await Page.WaitForSelectorAsync("input[type='password']", new() { State = WaitForSelectorState.Visible, Timeout = 10000 });

            // Enter an INCORRECT password
            await Page.FillAsync("input[type='password']", "wrongpassword123");

            // Click Decrypt button
            await Page.ClickAsync("button:has-text('Decrypt')");

            // Wait for error message to appear
            await Page.WaitForTimeoutAsync(2000); // Give some time for error to show
            var pageContent = await Page.TextContentAsync("body");
            Assert.That(
                pageContent,
                Does.Contain("password").Or.Contains("incorrect").Or.Contains("decrypt").Or.Contains("failed"),
                "Should show error message for incorrect password");
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
}
