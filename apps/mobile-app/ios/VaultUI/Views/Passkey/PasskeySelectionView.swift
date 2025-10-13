import SwiftUI

private let locBundle = Bundle.vaultUI

/// Selection view for choosing between creating new or replacing existing passkey
struct PasskeySelectionView: View {
    @ObservedObject var viewModel: PasskeyRegistrationViewModel
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 24) {
            // Create new button
            NavigationLink(value: PasskeyNavigationDestination.createNew) {
                HStack {
                    Image(systemName: "key.fill")
                    Text(String(localized: "create_new_passkey", bundle: locBundle))
                }
                .padding()
                .frame(maxWidth: .infinity)
                .background(ColorConstants.Light.primary)
                .foregroundColor(.white)
                .cornerRadius(8)
            }
            .buttonStyle(PlainButtonStyle())

            // Divider
            HStack {
                Rectangle()
                    .fill(colorScheme == .dark ? ColorConstants.Dark.textMuted : ColorConstants.Light.textMuted)
                    .frame(height: 1)
                Text(String(localized: "or", bundle: locBundle))
                    .font(.caption)
                    .foregroundColor(colorScheme == .dark ? ColorConstants.Dark.textMuted : ColorConstants.Light.textMuted)
                Rectangle()
                    .fill(colorScheme == .dark ? ColorConstants.Dark.textMuted : ColorConstants.Light.textMuted)
                    .frame(height: 1)
            }
            .padding(.horizontal)

            // Existing passkeys list
            VStack(alignment: .leading, spacing: 8) {
                Text(String(localized: "select_passkey_to_replace", bundle: locBundle))
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(colorScheme == .dark ? ColorConstants.Dark.text : ColorConstants.Light.text)
                    .padding(.horizontal)

                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(viewModel.existingPasskeys) { passkeyInfo in
                            NavigationLink(value: PasskeyNavigationDestination.replace(passkeyInfo.id)) {
                                ExistingPasskeyRow(passkey: passkeyInfo)
                            }
                            .buttonStyle(PlainButtonStyle())
                        }
                    }
                }
                .frame(maxHeight: 200)
            }

            Spacer()

            // Cancel button
            Button(action: {
                viewModel.cancel()
            }, label: {
                Text(String(localized: "cancel", bundle: locBundle))
                    .padding()
                    .frame(maxWidth: .infinity)
                    .foregroundColor(ColorConstants.Light.primary)
            })
        }
        .padding(.horizontal)
        .padding(.bottom, 20)
        .navigationTitle(String(localized: "create_passkey_title", bundle: locBundle))
        .navigationBarTitleDisplayMode(.inline)
    }
}
