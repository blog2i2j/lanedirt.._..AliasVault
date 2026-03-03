import { describe, it, expect } from 'vitest';

import { FormDetector } from '../FormDetector';

import { createTestDom } from './TestUtils';

describe('FormDetector - Emby Connect login form', () => {
  const htmlFile = 'emby-connect-login.html';

  it('should detect login form', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;
    const formDetector = new FormDetector(document);
    expect(formDetector.containsLoginForm()).toBe(true);
  });

  it('should ignore hidden fake username/password fields with height:0', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    // Click on the real email/username field
    const emailInput = document.getElementById('embyinput0');
    const formDetector = new FormDetector(document, emailInput as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();

    /*
     * Should detect the real email field (labeled as "Email" in the form), not the fake username field
     * This field can be used for username/email login
     */
    expect(form?.emailField).toBeTruthy();
    expect(form?.emailField?.className).toContain('txtUser');
    expect(form?.emailField?.id).toBe('embyinput0');

    // Should detect the real password field (txtPassword), not the fake one
    expect(form?.passwordField).toBeTruthy();
    expect(form?.passwordField?.className).toContain('txtPassword');
    expect(form?.passwordField?.name).not.toBe('fakepasswordremembered');
  });

  it('should not autofill hidden fake fields', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    // Click on the fake username field (should not be detected as autofillable)
    const fakeUsernameInput = document.querySelector('input[name="fakeusernameremembered"]');
    const formDetector = new FormDetector(document, fakeUsernameInput as HTMLElement);

    // Should not consider the fake field as an autofill-triggerable field
    expect(formDetector.isAutofillTriggerableField()).toBe(false);
  });

  it('should detect real username field when clicked', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const usernameInput = document.getElementById('embyinput0');
    const formDetector = new FormDetector(document, usernameInput as HTMLElement);

    expect(formDetector.isAutofillTriggerableField()).toBe(true);
  });

  it('should detect real password field when clicked', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const passwordInput = document.getElementById('embyinput1');
    const formDetector = new FormDetector(document, passwordInput as HTMLElement);

    expect(formDetector.isAutofillTriggerableField()).toBe(true);
  });
});
