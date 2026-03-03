import { describe, it, expect } from 'vitest';

import { FormDetector } from '../FormDetector';

import { createTestDom } from './TestUtils';

describe('FormDetector - Emby Connect login form (Swedish)', () => {
  const htmlFile = 'emby-connect-login-sv.html';

  it('should detect login form with Swedish labels', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;
    const formDetector = new FormDetector(document);
    expect(formDetector.containsLoginForm()).toBe(true);
  });

  it('should detect Swedish "E-post" label as email field', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    // Click on the email field with Swedish label
    const emailInput = document.getElementById('embyinput0');
    const formDetector = new FormDetector(document, emailInput as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();

    // Should detect the email field based on Swedish "E-post" label
    expect(form?.emailField).toBeTruthy();
    expect(form?.emailField?.id).toBe('embyinput0');
    expect(form?.emailField?.className).toContain('txtUser');
  });

  it('should detect Swedish "Lösenord" label as password field', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    // Click on the password field with Swedish label
    const passwordInput = document.getElementById('embyinput1');
    const formDetector = new FormDetector(document, passwordInput as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();

    // Should detect the password field based on Swedish "Lösenord" label
    expect(form?.passwordField).toBeTruthy();
    expect(form?.passwordField?.id).toBe('embyinput1');
    expect(form?.passwordField?.className).toContain('txtPassword');
  });

  it('should ignore hidden fake fields in Swedish form', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const emailInput = document.getElementById('embyinput0');
    const formDetector = new FormDetector(document, emailInput as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();

    // Should not detect fake fields
    expect(form?.emailField?.name).not.toBe('fakeusernameremembered');
    expect(form?.passwordField?.name).not.toBe('fakepasswordremembered');
  });

  it('should not trigger autofill on fake Swedish form fields', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const fakeField = document.querySelector('input[name="fakeusernameremembered"]');
    const formDetector = new FormDetector(document, fakeField as HTMLElement);

    expect(formDetector.isAutofillTriggerableField()).toBe(false);
  });

  it('should trigger autofill on real Swedish email field', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const emailInput = document.getElementById('embyinput0');
    const formDetector = new FormDetector(document, emailInput as HTMLElement);

    expect(formDetector.isAutofillTriggerableField()).toBe(true);
  });

  it('should trigger autofill on real Swedish password field', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const passwordInput = document.getElementById('embyinput1');
    const formDetector = new FormDetector(document, passwordInput as HTMLElement);

    expect(formDetector.isAutofillTriggerableField()).toBe(true);
  });
});
