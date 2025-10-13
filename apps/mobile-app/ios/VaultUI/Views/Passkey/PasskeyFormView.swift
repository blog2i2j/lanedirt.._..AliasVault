import SwiftUI

private let locBundle = Bundle.vaultUI

/// Form view for creating or replacing a passkey
struct PasskeyFormView: View {
    @ObservedObject var viewModel: PasskeyRegistrationViewModel
    let isReplaceMode: Bool
    let replacingPasskeyId: UUID?

    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var isTitleFocused: Bool

    var replacingPasskey: PasskeyWithCredentialInfo? {
        guard let id = replacingPasskeyId else { return nil }
        return viewModel.existingPasskeys.first(where: { $0.id == id })
    }

    var body: some View {
        ZStack {
            VStack(spacing: 16) {
                ScrollView {
                    VStack(spacing: 16) {
                        // Warning and explanation if replacing
                        if isReplaceMode, let passkey = replacingPasskey {
                            VStack(spacing: 12) {
                                // Explanation text
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(String(localized: "replace_passkey_explanation", bundle: locBundle))
                                        .font(.subheadline)
                                        .foregroundColor(colorScheme == .dark ? ColorConstants.Dark.textMuted : ColorConstants.Light.textMuted)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .padding(.horizontal, 4)
                            }
                            .padding(.horizontal)
                            .padding(.top, 8)
                        }

                        // Editable title field
                        PasskeyTitleInput(title: $viewModel.displayName, focusState: $isTitleFocused)
                            .padding(.top, isReplaceMode ? 8 : 8)

                        // Request details (compact, read-only)
                        VStack(spacing: 8) {
                            CompactInfoRow(
                                label: String(localized: "website", bundle: locBundle),
                                value: viewModel.rpId,
                                icon: "globe"
                            )

                            if let userName = viewModel.userName {
                                CompactInfoRow(
                                    label: String(localized: "username", bundle: locBundle),
                                    value: userName,
                                    icon: "person.fill"
                                )
                            }
                        }
                        .padding(.horizontal)
                    }
                }

                // Action button
                Button(action: {
                    viewModel.createPasskey()
                }, label: {
                    HStack {
                        Image(systemName: "key.fill")
                        Text(isReplaceMode
                            ? String(localized: "confirm_replace", bundle: locBundle)
                            : String(localized: "create_passkey_button_confirm", bundle: locBundle))
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(ColorConstants.Light.primary)
                    .foregroundColor(.white)
                    .cornerRadius(8)
                })
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
            .opacity(viewModel.isLoading ? 0.3 : 1.0)
            .disabled(viewModel.isLoading)

            // Loading overlay
            if viewModel.isLoading {
                LoadingOverlayView(message: viewModel.loadingMessage)
            }
        }
        .navigationTitle(isReplaceMode
            ? String(localized: "replace_passkey_title", bundle: locBundle)
            : String(localized: "create_passkey_title", bundle: locBundle))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Auto-focus the title field
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                isTitleFocused = true
            }
        }
    }
}

/// Loading overlay component with AliasVault branding
private struct LoadingOverlayView: View {
    let message: String
    @Environment(\.colorScheme) private var colorScheme
    @State private var animatingDots: [Bool] = [false, false, false, false]
    @State private var textDots = ""
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 0) {
                // AliasVault logo animation - four pulsing dots
                HStack(spacing: 10) {
                    ForEach(0..<4) { index in
                        Circle()
                            .fill(ColorConstants.Light.tertiary)
                            .frame(width: 8, height: 8)
                            .opacity(animatingDots[index] ? 1.0 : 0.3)
                            .animation(
                                Animation.easeInOut(duration: 0.7)
                                    .repeatForever(autoreverses: true)
                                    .delay(Double(index) * 0.2),
                                value: animatingDots[index]
                            )
                    }
                }
                .padding(12)
                .padding(.horizontal, 12)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(colorScheme == .dark ? Color.clear : Color.white)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(ColorConstants.Light.tertiary, lineWidth: 5)
                        )
                        .shadow(color: Color.black.opacity(0.05), radius: 2, x: 0, y: 1)
                )

                // Loading message with animated dots
                if !message.isEmpty {
                    Text(message + textDots)
                        .font(.body)
                        .foregroundColor(colorScheme == .dark ? ColorConstants.Dark.text : ColorConstants.Light.text)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                        .padding(.top, 16)
                }
            }
            .padding(20)

            Spacer()
        }
        .onAppear {
            // Start dot animations
            for index in 0..<4 {
                animatingDots[index] = true
            }

            // Start text dots animation
            let textTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                if textDots.count >= 3 {
                    textDots = ""
                } else {
                    textDots += "."
                }
            }
            timer = textTimer
        }
        .onDisappear {
            timer?.invalidate()
            timer = nil
        }
    }
}
