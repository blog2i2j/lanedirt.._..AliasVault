//-----------------------------------------------------------------------
// <copyright file="MobileUnlockUtility.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Auth.Services;

using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AliasVault.Client.Services.JsInterop;
using AliasVault.Shared.Models.WebApi.Auth;
using Microsoft.Extensions.Logging;

/// <summary>
/// Utility class for logging in with mobile app functionality.
/// </summary>
public sealed class MobileUnlockUtility : IDisposable
{
    private readonly HttpClient _httpClient;
    private readonly JsInteropService _jsInteropService;
    private readonly ILogger<MobileUnlockUtility> _logger;

    private Timer? _pollingTimer;
    private string? _requestId;
    private string? _privateKey;
    private CancellationTokenSource? _cancellationTokenSource;

    /// <summary>
    /// Initializes a new instance of the <see cref="MobileUnlockUtility"/> class.
    /// </summary>
    /// <param name="httpClient">The HTTP client.</param>
    /// <param name="jsInteropService">The JS interop service.</param>
    /// <param name="logger">The logger.</param>
    public MobileUnlockUtility(HttpClient httpClient, JsInteropService jsInteropService, ILogger<MobileUnlockUtility> logger)
    {
        _httpClient = httpClient;
        _jsInteropService = jsInteropService;
        _logger = logger;
    }

    /// <summary>
    /// Initiates a mobile unlock request and returns the request ID for QR code generation.
    /// </summary>
    /// <returns>The request ID.</returns>
    /// <exception cref="HttpRequestException">Thrown when the request fails with status code.</exception>
    public async Task<string> InitiateAsync()
    {
        // Generate RSA key pair
        var keyPair = await _jsInteropService.GenerateRsaKeyPair();
        _privateKey = keyPair.PrivateKey;

        // Send public key to server
        var request = new MobileUnlockInitiateRequest(keyPair.PublicKey);
        var response = await _httpClient.PostAsJsonAsync("v1/Auth/mobile-unlock/initiate", request);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Failed to initiate mobile unlock: {response.StatusCode}", null, response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<MobileUnlockInitiateResponse>();
        if (result == null)
        {
            throw new InvalidOperationException("Failed to parse mobile unlock initiate response");
        }

        _requestId = result.RequestId;
        return _requestId;
    }

    /// <summary>
    /// Starts polling the server for mobile unlock response.
    /// </summary>
    /// <param name="onSuccess">Callback for successful authentication.</param>
    /// <param name="onError">Callback for errors.</param>
    /// <returns>Task.</returns>
    public Task StartPollingAsync(Func<string, string, string, string, string, string, string, Task> onSuccess, Action<string> onError)
    {
        if (string.IsNullOrEmpty(_requestId) || string.IsNullOrEmpty(_privateKey))
        {
            throw new InvalidOperationException("Must call InitiateAsync() before starting polling");
        }

        _cancellationTokenSource = new CancellationTokenSource();

        // Start polling timer (every 3 seconds)
        _pollingTimer = new Timer(async _ => await PollServerAsync(onSuccess, onError), null, TimeSpan.Zero, TimeSpan.FromSeconds(3));

        // Auto-stop after 2 minutes
        Task.Delay(TimeSpan.FromMinutes(2), _cancellationTokenSource.Token)
            .ContinueWith(
                _ =>
                {
                    if (!_cancellationTokenSource.IsCancellationRequested)
                    {
                        StopPolling();
                        onError("Mobile unlock request timed out");
                    }
                },
                TaskScheduler.Default);

        return Task.CompletedTask;
    }

    /// <summary>
    /// Stops polling the server.
    /// </summary>
    public void StopPolling()
    {
        _pollingTimer?.Dispose();
        _pollingTimer = null;
        _cancellationTokenSource?.Cancel();
        _cancellationTokenSource?.Dispose();
        _cancellationTokenSource = null;
    }

    /// <summary>
    /// Cleans up resources.
    /// </summary>
    public void Cleanup()
    {
        StopPolling();
        _privateKey = null;
        _requestId = null;
    }

    /// <inheritdoc/>
    public void Dispose()
    {
        Cleanup();
    }

    private async Task PollServerAsync(Func<string, string, string, string, string, string, string, Task> onSuccess, Action<string> onError)
    {
        if (string.IsNullOrEmpty(_requestId) || _cancellationTokenSource?.IsCancellationRequested == true)
        {
            return;
        }

        try
        {
            var response = await _httpClient.GetAsync($"v1/Auth/mobile-unlock/poll/{_requestId}");

            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    StopPolling();
                    _privateKey = null;
                    _requestId = null;
                    onError("Mobile unlock request expired or not found");
                    return;
                }

                throw new InvalidOperationException($"Polling failed: {response.StatusCode}");
            }

            var result = await response.Content.ReadFromJsonAsync<MobileUnlockPollResponse>();

            if (result?.Fulfilled == true && !string.IsNullOrEmpty(result.EncryptedDecryptionKey) && !string.IsNullOrEmpty(result.Username) && result.Token != null && !string.IsNullOrEmpty(result.Salt) && !string.IsNullOrEmpty(result.EncryptionType) && !string.IsNullOrEmpty(result.EncryptionSettings))
            {
                // Stop polling
                StopPolling();

                // Decrypt the decryption key using private key
                var decryptionKey = await _jsInteropService.DecryptWithPrivateKey(result.EncryptedDecryptionKey, _privateKey!);

                // Clear sensitive data
                _privateKey = null;
                _requestId = null;

                // Call success callback
                await onSuccess(result.Username, result.Token.Token, result.Token.RefreshToken, decryptionKey, result.Salt, result.EncryptionType, result.EncryptionSettings);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during mobile unlock polling");
            StopPolling();
            _privateKey = null;
            _requestId = null;
            onError(ex.Message);
        }
    }
}
