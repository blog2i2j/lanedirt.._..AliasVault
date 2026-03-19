//-----------------------------------------------------------------------
// <copyright file="AvuxExportImportTests.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.E2ETests.Tests.Client.Shard3;

using System.IO.Compression;

/// <summary>
/// End-to-end tests for importing vault data using the .avux (unencrypted) format.
/// These tests use a pre-generated .avux file to ensure backward compatibility
/// and that unencrypted exports continue to work with new versions.
/// </summary>
[Parallelizable(ParallelScope.Self)]
[Category("ClientTests")]
[TestFixture]
public class AvuxExportImportTests : VaultImportTestsBase
{
    /// <summary>
    /// Test that importing an unencrypted .avux file works correctly and all data is preserved.
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
        var avuxBytes = await ResourceReaderUtility.ReadEmbeddedResourceBytesAsync("AliasVault.E2ETests.TestData.TestVault.avux");

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
}
