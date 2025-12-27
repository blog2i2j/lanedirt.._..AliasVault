import { Buffer } from 'buffer';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePreventRemove } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, Alert, Keyboard, Platform, ScrollView, KeyboardAvoidingView } from 'react-native';
import Toast from 'react-native-toast-message';

import { CreateIdentityGenerator, CreateUsernameEmailGenerator, Gender, Identity, IdentityHelperUtils, convertAgeRangeToBirthdateOptions } from '@/utils/dist/core/identity-generator';
import type { Attachment, Item, ItemField, TotpCode, ItemType } from '@/utils/dist/core/models/vault';
import { ItemTypes, getSystemFieldsForItemType, FieldKey } from '@/utils/dist/core/models/vault';
import type { FaviconExtractModel } from '@/utils/dist/core/models/webapi';
import { CreatePasswordGenerator, PasswordGenerator } from '@/utils/dist/core/password-generator';
import emitter from '@/utils/EventEmitter';
import { extractServiceNameFromUrl } from '@/utils/UrlUtility';

import { useColors } from '@/hooks/useColorScheme';
import { useVaultMutate } from '@/hooks/useVaultMutate';

import { AdvancedPasswordField } from '@/components/form/AdvancedPasswordField';
import { EmailDomainField } from '@/components/form/EmailDomainField';
import { FormField, FormFieldRef } from '@/components/form/FormField';
import { AttachmentUploader } from '@/components/items/details/AttachmentUploader';
import { TotpEditor } from '@/components/items/details/TotpEditor';
import LoadingOverlay from '@/components/LoadingOverlay';
import { ThemedContainer } from '@/components/themed/ThemedContainer';
import { ThemedText } from '@/components/themed/ThemedText';
import { AliasVaultToast } from '@/components/Toast';
import { RobustPressable } from '@/components/ui/RobustPressable';
import { useAuth } from '@/context/AuthContext';
import { useDb } from '@/context/DbContext';
import { useWebApi } from '@/context/WebApiContext';

type ItemMode = 'random' | 'manual';

// Default item type for mobile app - currently only Login/Alias type is supported
const DEFAULT_ITEM_TYPE: ItemType = ItemTypes.Alias;

/**
 * Add or edit an item screen.
 */
export default function AddEditItemScreen() : React.ReactNode {
  const { id, serviceUrl } = useLocalSearchParams<{ id: string, serviceUrl?: string }>();
  const router = useRouter();
  const colors = useColors();
  const dbContext = useDb();
  const authContext = useAuth();
  const [mode, setMode] = useState<ItemMode>('random');
  const { executeVaultMutation, syncStatus } = useVaultMutate();
  const navigation = useNavigation();
  const webApi = useWebApi();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const itemNameRef = useRef<FormFieldRef>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaveDisabled, setIsSaveDisabled] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [originalAttachmentIds, setOriginalAttachmentIds] = useState<string[]>([]);
  const [totpCodes, setTotpCodes] = useState<TotpCode[]>([]);
  const [originalTotpCodeIds, setOriginalTotpCodeIds] = useState<string[]>([]);
  const [passkeyIdsMarkedForDeletion, setPasskeyIdsMarkedForDeletion] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { t } = useTranslation();

  // Item state
  const [item, setItem] = useState<Item | null>(null);

  // Form state for dynamic fields - key is FieldKey, value is the field value
  const [fieldValues, setFieldValues] = useState<Record<string, string | string[]>>({});

  // Track last generated values to avoid overwriting manual entries
  const [lastGeneratedValues, setLastGeneratedValues] = useState<{
    username: string | null;
    password: string | null;
    email: string | null;
  }>({ username: null, password: null, email: null });

  /**
   * If we received an ID, we're in edit mode.
   */
  const isEditMode = id !== undefined && id.length > 0;

  /**
   * Get all applicable system fields for the current item type.
   */
  const applicableSystemFields = useMemo(() => {
    if (!item) {
      return [];
    }
    return getSystemFieldsForItemType(item.ItemType);
  }, [item]);

  /**
   * Handle field value change.
   */
  const handleFieldChange = useCallback((fieldKey: string, value: string | string[]) => {
    setFieldValues(prev => ({
      ...prev,
      [fieldKey]: value
    }));
    setHasUnsavedChanges(true);
  }, []);

  /**
   * Generate a random identity.
   */
  const generateRandomIdentity = useCallback(async () : Promise<Identity> => {
    const identityLanguage = await dbContext.sqliteClient!.getEffectiveIdentityLanguage();
    const identityGenerator = CreateIdentityGenerator(identityLanguage);

    const genderPreference = await dbContext.sqliteClient!.getDefaultIdentityGender();
    const ageRange = await dbContext.sqliteClient!.getDefaultIdentityAgeRange();
    const birthdateOptions = convertAgeRangeToBirthdateOptions(ageRange);

    return identityGenerator.generateRandomIdentity(genderPreference, birthdateOptions);
  }, [dbContext.sqliteClient]);

  /**
   * Prevent accidental dismissal when there are unsaved changes.
   */
  usePreventRemove(hasUnsavedChanges, ({ data }) : void => {
    Alert.alert(
      t('credentials.unsavedChanges.title'),
      t('credentials.unsavedChanges.message'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
          /** Cancel button handler. */
          onPress: () : void => {}
        },
        {
          text: t('credentials.unsavedChanges.discard'),
          style: 'destructive',
          /** Discard button handler. */
          onPress: () : void => {
            setHasUnsavedChanges(false);
            navigation.dispatch(data.action);
          },
        },
      ]
    );
  });

  /**
   * Load an existing item from the database in edit mode.
   */
  const loadExistingItem = useCallback(async () : Promise<void> => {
    try {
      const existingItem = await dbContext.sqliteClient!.getItemById(id);
      if (existingItem) {
        setItem(existingItem);

        // Initialize field values from existing fields
        const initialValues: Record<string, string | string[]> = {};
        existingItem.Fields.forEach((field) => {
          initialValues[field.FieldKey] = field.Value;
        });

        // Normalize birthdate if present
        if (initialValues[FieldKey.AliasBirthdate]) {
          initialValues[FieldKey.AliasBirthdate] = IdentityHelperUtils.normalizeBirthDate(
            initialValues[FieldKey.AliasBirthdate] as string
          );
        }

        setFieldValues(initialValues);

        // Check if alias fields have values to set mode
        const hasAliasFields = initialValues[FieldKey.AliasFirstName] || initialValues[FieldKey.AliasLastName];
        if (hasAliasFields) {
          setMode('manual');
        }

        // Load attachments for this item
        const itemAttachments = await dbContext.sqliteClient!.getAttachmentsForItem(id);
        setAttachments(itemAttachments);
        setOriginalAttachmentIds(itemAttachments.map(a => a.Id));

        // Load TOTP codes for this item
        const itemTotpCodes = await dbContext.sqliteClient!.getTotpCodesForItem(id);
        setTotpCodes(itemTotpCodes);
        setOriginalTotpCodeIds(itemTotpCodes.map(tc => tc.Id));
      }
    } catch (err) {
      console.error('Error loading item:', err);
      Toast.show({
        type: 'error',
        text1: t('credentials.errors.loadFailed'),
        text2: t('auth.errors.enterPassword')
      });
    }
  }, [id, dbContext.sqliteClient, t]);

  /**
   * On mount, load an existing item if we're in edit mode, or initialize new item.
   */
  useEffect(() => {
    /** Initialize the component by loading settings and handling initial state. */
    const initializeComponent = async (): Promise<void> => {
      if (authContext.isOffline) {
        setTimeout(() => {
          Toast.show({
            type: 'error',
            text1: t('credentials.offlineMessage'),
            position: 'bottom'
          });
        }, 100);
        router.dismiss();
        return;
      }

      if (isEditMode) {
        loadExistingItem();
      } else {
        // Create mode - initialize new item
        let serviceName = '';
        let itemUrl = '';

        if (serviceUrl) {
          const decodedUrl = decodeURIComponent(serviceUrl);
          serviceName = extractServiceNameFromUrl(decodedUrl);
          itemUrl = decodedUrl;
        }

        const newItem: Item = {
          Id: crypto.randomUUID().toUpperCase(),
          Name: serviceName,
          ItemType: DEFAULT_ITEM_TYPE,
          FolderId: null,
          Fields: [],
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString()
        };

        setItem(newItem);

        // Set URL in field values if provided
        if (itemUrl) {
          setFieldValues(prev => ({
            ...prev,
            [FieldKey.LoginUrl]: itemUrl
          }));
        }

        // Focus the item name field after a short delay
        setTimeout(() => {
          itemNameRef.current?.focus();
        }, 100);
      }
    };

    initializeComponent();
  }, [id, isEditMode, serviceUrl, loadExistingItem, authContext.isOffline, router, t]);

  /**
   * Initialize the password generator with settings from user's vault.
   */
  const initializePasswordGenerator = useCallback(async () : Promise<PasswordGenerator> => {
    const passwordSettings = await dbContext.sqliteClient!.getPasswordSettings();
    return CreatePasswordGenerator(passwordSettings);
  }, [dbContext.sqliteClient]);

  /**
   * Generate a random alias and password.
   */
  const generateRandomAlias = useCallback(async (): Promise<void> => {
    const passwordGenerator = await initializePasswordGenerator();
    const identity = await generateRandomIdentity();
    const password = passwordGenerator.generateRandomPassword();
    const defaultEmailDomain = await dbContext.sqliteClient!.getDefaultEmailDomain();
    const email = defaultEmailDomain ? `${identity.emailPrefix}@${defaultEmailDomain}` : identity.emailPrefix;

    // Check current values
    const currentUsername = (fieldValues[FieldKey.LoginUsername] as string) ?? '';
    const currentPassword = (fieldValues[FieldKey.LoginPassword] as string) ?? '';
    const currentEmail = (fieldValues[FieldKey.LoginEmail] as string) ?? '';

    const newValues: Record<string, string | string[]> = { ...fieldValues };

    // Only overwrite email if it's empty or matches the last generated value
    if (!currentEmail || currentEmail === lastGeneratedValues.email) {
      newValues[FieldKey.LoginEmail] = email;
    }

    // Always update alias identity fields
    newValues[FieldKey.AliasFirstName] = identity.firstName;
    newValues[FieldKey.AliasLastName] = identity.lastName;
    newValues[FieldKey.AliasGender] = identity.gender;
    newValues[FieldKey.AliasBirthdate] = IdentityHelperUtils.normalizeBirthDate(identity.birthDate.toISOString());

    // Only overwrite username if it's empty or matches the last generated value
    if (!currentUsername || currentUsername === lastGeneratedValues.username) {
      newValues[FieldKey.LoginUsername] = identity.nickName;
    }

    // Only overwrite password if it's empty or matches the last generated value
    if (!currentPassword || currentPassword === lastGeneratedValues.password) {
      newValues[FieldKey.LoginPassword] = password;
      setIsPasswordVisible(true);
    }

    setFieldValues(newValues);
    setHasUnsavedChanges(true);

    // Update tracking with new generated values
    setLastGeneratedValues({
      username: identity.nickName,
      password: password,
      email: email
    });
  }, [fieldValues, initializePasswordGenerator, generateRandomIdentity, dbContext.sqliteClient, lastGeneratedValues]);

  /**
   * Clear all alias fields.
   */
  const clearAliasFields = useCallback(() => {
    setFieldValues(prev => ({
      ...prev,
      [FieldKey.AliasFirstName]: '',
      [FieldKey.AliasLastName]: '',
      [FieldKey.AliasGender]: '',
      [FieldKey.AliasBirthdate]: '',
    }));
    setHasUnsavedChanges(true);
  }, []);

  /**
   * Check if any alias fields have values.
   */
  const hasAliasValues = useMemo(() => {
    return !!(
      fieldValues[FieldKey.AliasFirstName] ||
      fieldValues[FieldKey.AliasLastName] ||
      fieldValues[FieldKey.AliasGender] ||
      fieldValues[FieldKey.AliasBirthdate]
    );
  }, [fieldValues]);

  /**
   * Handle the generate random alias button press.
   */
  const handleGenerateRandomAlias = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (hasAliasValues) {
      clearAliasFields();
    } else {
      await generateRandomAlias();
    }
  }, [generateRandomAlias, clearAliasFields, hasAliasValues]);

  /**
   * Submit the form for either creating or updating an item.
   */
  const onSubmit = useCallback(async () : Promise<void> => {
    if (isSaveDisabled || !item) {
      return;
    }

    setIsSaveDisabled(true);
    Keyboard.dismiss();
    setIsSyncing(true);

    // If we're creating a new item and mode is random, generate random values first
    if (!isEditMode && mode === 'random') {
      await generateRandomAlias();
    }

    // Build the fields array from fieldValues
    const fields: ItemField[] = [];

    applicableSystemFields.forEach(systemField => {
      const value = fieldValues[systemField.FieldKey];

      // Only include fields with non-empty values
      if (value && (Array.isArray(value) ? value.length > 0 : value.toString().trim() !== '')) {
        fields.push({
          FieldKey: systemField.FieldKey,
          Label: systemField.FieldKey,
          FieldType: systemField.FieldType,
          Value: value,
          IsHidden: systemField.IsHidden,
          DisplayOrder: systemField.DefaultDisplayOrder,
          IsCustomField: false,
          EnableHistory: systemField.EnableHistory
        });
      }
    });

    // Normalize birthdate if present
    const birthdateField = fields.find(f => f.FieldKey === FieldKey.AliasBirthdate);
    if (birthdateField && typeof birthdateField.Value === 'string') {
      birthdateField.Value = IdentityHelperUtils.normalizeBirthDate(birthdateField.Value);
    }

    // Build the item to save
    let itemToSave: Item = {
      ...item,
      Id: isEditMode ? id : crypto.randomUUID().toUpperCase(),
      Name: item.Name || t('items.untitled'),
      Fields: fields,
      UpdatedAt: new Date().toISOString()
    };

    // Extract favicon from URL if present
    const urlValue = fieldValues[FieldKey.LoginUrl];
    const urlString = Array.isArray(urlValue) ? urlValue[0] : urlValue;
    if (urlString && urlString !== 'https://' && urlString !== 'http://') {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Favicon extraction timed out')), 5000)
        );

        const faviconPromise = webApi.get<FaviconExtractModel>('Favicon/Extract?url=' + urlString);
        const faviconResponse = await Promise.race([faviconPromise, timeoutPromise]) as FaviconExtractModel;
        if (faviconResponse?.image) {
          const decodedImage = Uint8Array.from(Buffer.from(faviconResponse.image as string, 'base64'));
          itemToSave.Logo = decodedImage;
        }
      } catch {
        // Favicon extraction failed or timed out - not critical
      }
    }

    await executeVaultMutation(async () => {
      if (isEditMode) {
        await dbContext.sqliteClient!.updateItem(itemToSave, originalAttachmentIds, attachments, originalTotpCodeIds, totpCodes);

        // Delete passkeys if marked for deletion
        if (passkeyIdsMarkedForDeletion.length > 0) {
          for (const passkeyId of passkeyIdsMarkedForDeletion) {
            await dbContext.sqliteClient!.deletePasskeyById(passkeyId);
          }
        }
      } else {
        await dbContext.sqliteClient!.createItem(itemToSave, attachments, totpCodes);
      }

      // Emit event to notify list and detail views to refresh
      emitter.emit('credentialChanged', itemToSave.Id);
    },
    {
      /** Handle successful vault mutation. */
      onSuccess: () => {
        setHasUnsavedChanges(false);

        if (serviceUrl && !isEditMode) {
          router.replace('/items/autofill-item-created');
        } else {
          setIsSyncing(false);
          setIsSaveDisabled(false);
          router.dismiss();

          setTimeout(() => {
            if (isEditMode) {
              Toast.show({
                type: 'success',
                text1: t('credentials.toasts.credentialUpdated'),
                position: 'bottom'
              });
            } else {
              Toast.show({
                type: 'success',
                text1: t('credentials.toasts.credentialCreated'),
                position: 'bottom'
              });
              router.push(`/items/${itemToSave.Id}`);
            }
          }, 100);
        }
      },
      /** Handle error during vault mutation. */
      onError: (error) => {
        Toast.show({
          type: 'error',
          text1: t('credentials.errors.saveFailed'),
          text2: error.message,
          position: 'bottom'
        });
        console.error('Error saving item:', error.message);
        setIsSyncing(false);
        setIsSaveDisabled(false);
      }
    });
  }, [isEditMode, id, serviceUrl, router, executeVaultMutation, dbContext.sqliteClient, mode, generateRandomAlias, webApi, isSaveDisabled, item, fieldValues, applicableSystemFields, t, originalAttachmentIds, attachments, originalTotpCodeIds, totpCodes, passkeyIdsMarkedForDeletion]);

  /**
   * Generate a random username based on current identity fields.
   */
  const generateRandomUsername = useCallback(async () : Promise<void> => {
    try {
      const firstName = (fieldValues[FieldKey.AliasFirstName] as string) ?? '';
      const lastName = (fieldValues[FieldKey.AliasLastName] as string) ?? '';
      const birthDate = (fieldValues[FieldKey.AliasBirthdate] as string) ?? '';

      let username: string;

      if (!firstName && !lastName && !birthDate) {
        const randomIdentity = await generateRandomIdentity();
        username = randomIdentity.nickName;
      } else {
        const usernameEmailGenerator = CreateUsernameEmailGenerator();

        let gender = Gender.Other;
        try {
          gender = (fieldValues[FieldKey.AliasGender] as string) as Gender;
        } catch {
          // Gender parsing failed, default to other
        }

        let parsedBirthDate = new Date(birthDate);
        if (!birthDate || isNaN(parsedBirthDate.getTime())) {
          parsedBirthDate = new Date();
        }

        const identity: Identity = {
          firstName,
          lastName,
          nickName: '',
          gender,
          birthDate: parsedBirthDate,
          emailPrefix: (fieldValues[FieldKey.LoginEmail] as string) ?? '',
        };

        username = usernameEmailGenerator.generateUsername(identity);
      }

      handleFieldChange(FieldKey.LoginUsername, username);
      setLastGeneratedValues(prev => ({ ...prev, username }));
    } catch (error) {
      console.error('Error generating random username:', error);
    }
  }, [fieldValues, generateRandomIdentity, handleFieldChange]);

  /**
   * Handle the delete button press.
   */
  const handleDelete = async () : Promise<void> => {
    if (!id) {
      return;
    }

    Keyboard.dismiss();

    Alert.alert(
      t('credentials.deleteCredential'),
      t('credentials.deleteConfirm'),
      [
        {
          text: t('common.cancel'),
          style: "cancel"
        },
        {
          text: t('common.delete'),
          style: "destructive",
          /** Delete the item. */
          onPress: async () : Promise<void> => {
            setIsSyncing(true);

            await executeVaultMutation(async () => {
              await dbContext.sqliteClient!.trashItem(id);
            });

            emitter.emit('credentialChanged', id);

            setTimeout(() => {
              Toast.show({
                type: 'success',
                text1: t('credentials.toasts.credentialDeleted'),
                position: 'bottom'
              });
            }, 200);

            setIsSyncing(false);
            router.back();
            router.back();
          }
        }
      ]
    );
  };

  /**
   * Get the top padding for the container.
   */
  const getTopPadding = (): number => {
    if (Platform.OS !== 'ios') {
      return 0;
    }
    const iosVersion = parseInt(Platform.Version as string, 10);
    return iosVersion >= 26 ? 72 : 52;
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: getTopPadding(),
    },
    contentContainer: {
      paddingBottom: 40,
      paddingTop: 16,
    },
    deleteButton: {
      alignItems: 'center',
      backgroundColor: colors.errorBackground,
      borderColor: colors.errorBorder,
      borderRadius: 8,
      borderWidth: 1,
      padding: 10,
    },
    deleteButtonText: {
      color: colors.errorText,
      fontWeight: '600',
    },
    generateButton: {
      alignItems: 'center',
      borderRadius: 8,
      flexDirection: 'row',
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    generateButtonPrimary: {
      backgroundColor: colors.primary,
    },
    generateButtonSecondary: {
      backgroundColor: colors.textMuted,
    },
    generateButtonText: {
      color: colors.primarySurfaceText,
      fontWeight: '600',
      marginLeft: 6,
    },
    headerLeftButton: {
      paddingHorizontal: 8,
    },
    headerLeftButtonText: {
      color: colors.primary,
    },
    headerRightButton: {
      paddingHorizontal: 8,
    },
    headerRightButtonDisabled: {
      opacity: 0.5,
    },
    modeButton: {
      alignItems: 'center',
      borderRadius: 6,
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      padding: 8,
    },
    modeButtonActive: {
      backgroundColor: colors.primary,
    },
    modeButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    modeButtonTextActive: {
      color: colors.primarySurfaceText,
    },
    modeSelector: {
      backgroundColor: colors.accentBackground,
      borderRadius: 8,
      flexDirection: 'row',
      marginBottom: 16,
      padding: 4,
    },
    section: {
      backgroundColor: colors.accentBackground,
      borderRadius: 8,
      marginBottom: 24,
      padding: 16,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 10,
    },
  });

  /**
   * Handle cancel button press with unsaved changes check.
   */
  const handleCancel = useCallback(() : void => {
    if (hasUnsavedChanges) {
      Alert.alert(
        t('credentials.unsavedChanges.title'),
        t('credentials.unsavedChanges.message'),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('credentials.unsavedChanges.discard'),
            style: 'destructive',
            /** Discard button handler. */
            onPress: () : void => {
              setHasUnsavedChanges(false);
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  }, [hasUnsavedChanges, router, t]);

  // Set header buttons
  useEffect(() => {
    navigation.setOptions({
      ...(Platform.OS === 'ios' && {
        /** Header left button. */
        headerLeft: () : React.ReactNode => (
          <RobustPressable
            onPress={handleCancel}
            style={styles.headerLeftButton}
          >
            <ThemedText style={styles.headerLeftButtonText}>{t('common.cancel')}</ThemedText>
          </RobustPressable>
        ),
      }),
      /** Header right button. */
      headerRight: () => (
        <RobustPressable
          onPress={onSubmit}
          style={[styles.headerRightButton, isSaveDisabled && styles.headerRightButtonDisabled]}
          disabled={isSaveDisabled}
        >
          <MaterialIcons
            name="save"
            size={Platform.OS === 'android' ? 24 : 22}
            color={colors.primary}
          />
        </RobustPressable>
      ),
    });
  }, [navigation, mode, onSubmit, colors.primary, isEditMode, router, styles.headerLeftButton, styles.headerLeftButtonText, styles.headerRightButton, styles.headerRightButtonDisabled, isSaveDisabled, t, handleCancel]);

  // Check for passkeys (in edit mode)
  const hasPasskey = useMemo(() => {
    return item?.HasPasskey ?? false;
  }, [item]);

  if (!item) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title: isEditMode ? t('credentials.editCredential') : t('credentials.addCredential') }} />
      {(isSyncing) && (
        <LoadingOverlay status={syncStatus} />
      )}

      <ThemedContainer style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 30 : 80}
        >
          <ScrollView
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!isEditMode && (
              <View style={styles.modeSelector}>
                <RobustPressable
                  style={[styles.modeButton, mode === 'random' && styles.modeButtonActive]}
                  onPress={() => setMode('random')}
                >
                  <MaterialIcons
                    name="auto-fix-high"
                    size={20}
                    color={mode === 'random' ? colors.primarySurfaceText : colors.text}
                  />
                  <ThemedText style={[styles.modeButtonText, mode === 'random' && styles.modeButtonTextActive]}>
                    {t('credentials.randomAlias')}
                  </ThemedText>
                </RobustPressable>
                <RobustPressable
                  style={[styles.modeButton, mode === 'manual' && styles.modeButtonActive]}
                  onPress={() => setMode('manual')}
                >
                  <MaterialIcons
                    name="person"
                    size={20}
                    color={mode === 'manual' ? colors.primarySurfaceText : colors.text}
                  />
                  <ThemedText style={[styles.modeButtonText, mode === 'manual' && styles.modeButtonTextActive]}>
                    {t('credentials.manual')}
                  </ThemedText>
                </RobustPressable>
              </View>
            )}

            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>{t('credentials.service')}</ThemedText>
              <FormField
                ref={itemNameRef}
                value={item.Name ?? ''}
                onChangeText={(value) => {
                  setItem(prev => prev ? { ...prev, Name: value } : prev);
                  setHasUnsavedChanges(true);
                }}
                label={t('credentials.serviceName')}
                required
              />
              <FormField
                value={(fieldValues[FieldKey.LoginUrl] as string) ?? 'https://'}
                onChangeText={(value) => handleFieldChange(FieldKey.LoginUrl, value)}
                label={t('credentials.serviceUrl')}
              />
            </View>
            {(mode === 'manual' || isEditMode) && (
              <>
                <View style={styles.section}>
                  <ThemedText style={styles.sectionTitle}>{t('credentials.loginCredentials')}</ThemedText>

                  {hasPasskey ? (
                    <>
                      {/* When passkey exists: username, passkey, email, password */}
                      <FormField
                        value={(fieldValues[FieldKey.LoginUsername] as string) ?? ''}
                        onChangeText={(value) => handleFieldChange(FieldKey.LoginUsername, value)}
                        label={t('credentials.username')}
                        buttons={[{
                          icon: "refresh",
                          onPress: generateRandomUsername
                        }]}
                      />
                      {!passkeyIdsMarkedForDeletion.length && (
                        <View style={{
                          backgroundColor: colors.background,
                          borderColor: colors.accentBorder,
                          borderRadius: 8,
                          borderWidth: 1,
                          marginTop: 8,
                          marginBottom: 8,
                          padding: 12,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                            <MaterialIcons
                              name="vpn-key"
                              size={20}
                              color={colors.primary}
                              style={{ marginRight: 8, marginTop: 2 }}
                            />
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <ThemedText style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                                  {t('passkeys.passkey')}
                                </ThemedText>
                                <RobustPressable
                                  onPress={() => setPasskeyIdsMarkedForDeletion(['passkey'])}
                                  style={{
                                    padding: 6,
                                    borderRadius: 4,
                                    backgroundColor: colors.destructive + '15'
                                  }}
                                >
                                  <MaterialIcons
                                    name="delete"
                                    size={18}
                                    color={colors.destructive}
                                  />
                                </RobustPressable>
                              </View>
                              <ThemedText style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                                {t('passkeys.helpText')}
                              </ThemedText>
                            </View>
                          </View>
                        </View>
                      )}
                      {passkeyIdsMarkedForDeletion.length > 0 && (
                        <View style={{
                          backgroundColor: colors.errorBackground,
                          borderColor: colors.errorBorder,
                          borderRadius: 8,
                          borderWidth: 1,
                          marginTop: 8,
                          marginBottom: 8,
                          padding: 12,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                            <MaterialIcons
                              name="vpn-key"
                              size={20}
                              color={colors.errorText}
                              style={{ marginRight: 8, marginTop: 2 }}
                            />
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <ThemedText style={{ color: colors.errorText, fontSize: 14, fontWeight: '600' }}>
                                  {t('passkeys.passkeyMarkedForDeletion')}
                                </ThemedText>
                                <RobustPressable
                                  onPress={() => setPasskeyIdsMarkedForDeletion([])}
                                  style={{ padding: 4 }}
                                >
                                  <MaterialIcons
                                    name="undo"
                                    size={18}
                                    color={colors.textMuted}
                                  />
                                </RobustPressable>
                              </View>
                              <ThemedText style={{ color: colors.errorText, fontSize: 11 }}>
                                {t('passkeys.passkeyWillBeDeleted')}
                              </ThemedText>
                            </View>
                          </View>
                        </View>
                      )}
                      <EmailDomainField
                        value={(fieldValues[FieldKey.LoginEmail] as string) ?? ''}
                        onChange={(newValue) => handleFieldChange(FieldKey.LoginEmail, newValue)}
                        label={t('credentials.email')}
                      />
                      <AdvancedPasswordField
                        value={(fieldValues[FieldKey.LoginPassword] as string) ?? ''}
                        onChangeText={(value) => handleFieldChange(FieldKey.LoginPassword, value)}
                        label={t('credentials.password')}
                        showPassword={isPasswordVisible}
                        onShowPasswordChange={setIsPasswordVisible}
                        isNewCredential={!isEditMode}
                      />
                    </>
                  ) : (
                    <>
                      {/* When no passkey: email, username, password */}
                      <EmailDomainField
                        value={(fieldValues[FieldKey.LoginEmail] as string) ?? ''}
                        onChange={(newValue) => handleFieldChange(FieldKey.LoginEmail, newValue)}
                        label={t('credentials.email')}
                      />
                      <FormField
                        value={(fieldValues[FieldKey.LoginUsername] as string) ?? ''}
                        onChangeText={(value) => handleFieldChange(FieldKey.LoginUsername, value)}
                        label={t('credentials.username')}
                        buttons={[{
                          icon: "refresh",
                          onPress: generateRandomUsername
                        }]}
                      />
                      <AdvancedPasswordField
                        value={(fieldValues[FieldKey.LoginPassword] as string) ?? ''}
                        onChangeText={(value) => handleFieldChange(FieldKey.LoginPassword, value)}
                        label={t('credentials.password')}
                        showPassword={isPasswordVisible}
                        onShowPasswordChange={setIsPasswordVisible}
                        isNewCredential={!isEditMode}
                      />
                    </>
                  )}
                </View>

                <View style={styles.section}>
                  <ThemedText style={styles.sectionTitle}>{t('credentials.alias')}</ThemedText>
                  <RobustPressable
                    style={[
                      styles.generateButton,
                      hasAliasValues ? styles.generateButtonSecondary : styles.generateButtonPrimary
                    ]}
                    onPress={handleGenerateRandomAlias}
                  >
                    <MaterialIcons
                      name={hasAliasValues ? "clear" : "auto-fix-high"}
                      size={20}
                      color="#fff"
                    />
                    <ThemedText style={styles.generateButtonText}>
                      {hasAliasValues ? t('credentials.clearAliasFields') : t('credentials.generateRandomAlias')}
                    </ThemedText>
                  </RobustPressable>
                  <FormField
                    value={(fieldValues[FieldKey.AliasFirstName] as string) ?? ''}
                    onChangeText={(value) => handleFieldChange(FieldKey.AliasFirstName, value)}
                    label={t('credentials.firstName')}
                  />
                  <FormField
                    value={(fieldValues[FieldKey.AliasLastName] as string) ?? ''}
                    onChangeText={(value) => handleFieldChange(FieldKey.AliasLastName, value)}
                    label={t('credentials.lastName')}
                  />
                  <FormField
                    value={(fieldValues[FieldKey.AliasGender] as string) ?? ''}
                    onChangeText={(value) => handleFieldChange(FieldKey.AliasGender, value)}
                    label={t('credentials.gender')}
                  />
                  <FormField
                    value={(fieldValues[FieldKey.AliasBirthdate] as string) ?? ''}
                    onChangeText={(value) => handleFieldChange(FieldKey.AliasBirthdate, value)}
                    label={t('credentials.birthDate')}
                    placeholder={t('credentials.birthDatePlaceholder')}
                  />
                </View>

                <View style={styles.section}>
                  <ThemedText style={styles.sectionTitle}>{t('credentials.metadata')}</ThemedText>

                  <FormField
                    value={(fieldValues[FieldKey.NotesContent] as string) ?? ''}
                    onChangeText={(value) => handleFieldChange(FieldKey.NotesContent, value)}
                    label={t('credentials.notes')}
                    multiline={true}
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.section}>
                  <TotpEditor
                    totpCodes={totpCodes}
                    onTotpCodesChange={setTotpCodes}
                    originalTotpCodeIds={originalTotpCodeIds}
                  />
                </View>

                <View style={styles.section}>
                  <ThemedText style={styles.sectionTitle}>{t('credentials.attachments')}</ThemedText>

                  <AttachmentUploader
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                  />
                </View>

                {isEditMode && (
                  <RobustPressable
                    style={styles.deleteButton}
                    onPress={handleDelete}
                  >
                    <ThemedText style={styles.deleteButtonText}>{t('credentials.deleteCredential')}</ThemedText>
                  </RobustPressable>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedContainer>
      <AliasVaultToast />
    </>
  );
}
