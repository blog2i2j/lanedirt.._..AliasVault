//-----------------------------------------------------------------------
// <copyright file="RustCoreService.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Services.JsInterop.RustCore;

using System.Text.Json;
using Microsoft.JSInterop;

/// <summary>
/// JavaScript interop wrapper for the Rust WASM core library.
/// Provides vault merge and credential matching functionality via WASM.
/// </summary>
public class RustCoreService : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        WriteIndented = false,
    };

    private readonly IJSRuntime jsRuntime;
    private bool? isAvailable;

    /// <summary>
    /// Initializes a new instance of the <see cref="RustCoreService"/> class.
    /// </summary>
    /// <param name="jsRuntime">The JS runtime for interop.</param>
    public RustCoreService(IJSRuntime jsRuntime)
    {
        this.jsRuntime = jsRuntime;
    }

    /// <summary>
    /// Check if the Rust WASM module is available.
    /// </summary>
    /// <returns>True if the WASM module is loaded and available.</returns>
    public async Task<bool> IsAvailableAsync()
    {
        // Only return cached result if it's true (successful initialization).
        // If false or null, we should try again since WASM might still be loading.
        if (isAvailable == true)
        {
            return true;
        }

        try
        {
            var result = await jsRuntime.InvokeAsync<bool>("rustCoreIsAvailable");
            if (result)
            {
                isAvailable = true;
            }

            return result;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Wait for the Rust WASM module to become available with retries.
    /// </summary>
    /// <param name="maxRetries">Maximum number of retry attempts.</param>
    /// <param name="delayMs">Delay between retries in milliseconds.</param>
    /// <returns>True if the WASM module became available.</returns>
    public async Task<bool> WaitForAvailabilityAsync(int maxRetries = 10, int delayMs = 100)
    {
        for (int i = 0; i < maxRetries; i++)
        {
            if (await IsAvailableAsync())
            {
                return true;
            }

            await Task.Delay(delayMs);
        }

        return false;
    }

    /// <summary>
    /// Merge two vaults using Last-Write-Wins (LWW) strategy.
    /// </summary>
    /// <param name="input">The merge input containing local and server tables.</param>
    /// <returns>The merge output with SQL statements to execute.</returns>
    /// <exception cref="InvalidOperationException">Thrown if merge fails or WASM module is unavailable.</exception>
    public async Task<MergeOutput> MergeVaultsAsync(MergeInput input)
    {
        // Wait for WASM to be available with retries, as it may still be loading.
        if (!await WaitForAvailabilityAsync())
        {
            throw new InvalidOperationException("Rust WASM module is not available.");
        }

        var inputJson = JsonSerializer.Serialize(input, JsonOptions);
        var resultJson = await jsRuntime.InvokeAsync<string>("rustCoreMergeVaults", inputJson);

        if (string.IsNullOrEmpty(resultJson))
        {
            throw new InvalidOperationException("Merge operation returned empty result.");
        }

        var result = JsonSerializer.Deserialize<MergeOutput>(resultJson, JsonOptions);
        if (result == null)
        {
            throw new InvalidOperationException("Failed to deserialize merge result.");
        }

        if (!result.Success && !string.IsNullOrEmpty(result.Error))
        {
            throw new InvalidOperationException($"Merge failed: {result.Error}");
        }

        return result;
    }

    /// <summary>
    /// Get the list of table names that need to be synced.
    /// </summary>
    /// <returns>Array of table names.</returns>
    public async Task<string[]> GetSyncableTableNamesAsync()
    {
        if (!await IsAvailableAsync())
        {
            return SyncableTables.Names;
        }

        try
        {
            var result = await jsRuntime.InvokeAsync<string[]>("rustCoreGetSyncableTableNames");
            return result ?? SyncableTables.Names;
        }
        catch
        {
            return SyncableTables.Names;
        }
    }

    /// <summary>
    /// Extract domain from URL.
    /// </summary>
    /// <param name="url">The URL to extract domain from.</param>
    /// <returns>The extracted domain.</returns>
    public async Task<string> ExtractDomainAsync(string url)
    {
        if (!await IsAvailableAsync())
        {
            return string.Empty;
        }

        try
        {
            return await jsRuntime.InvokeAsync<string>("rustCoreExtractDomain", url);
        }
        catch
        {
            return string.Empty;
        }
    }

    /// <summary>
    /// Extract root domain from a domain string.
    /// </summary>
    /// <param name="domain">The domain to extract root from.</param>
    /// <returns>The root domain.</returns>
    public async Task<string> ExtractRootDomainAsync(string domain)
    {
        if (!await IsAvailableAsync())
        {
            return string.Empty;
        }

        try
        {
            return await jsRuntime.InvokeAsync<string>("rustCoreExtractRootDomain", domain);
        }
        catch
        {
            return string.Empty;
        }
    }

    /// <inheritdoc/>
    public ValueTask DisposeAsync()
    {
        return ValueTask.CompletedTask;
    }
}
