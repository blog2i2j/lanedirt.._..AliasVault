import { describe, it, expect } from 'vitest';

import { FormDetector } from '../FormDetector';

import { createTestDom } from './TestUtils';

describe('FormDetector - Various hidden field techniques', () => {
  const htmlFile = 'hidden-fields-various.html';

  it('should detect login form with real fields', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;
    const formDetector = new FormDetector(document);
    expect(formDetector.containsLoginForm()).toBe(true);
  });

  it('should ignore fields in height:0 container', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const realEmail = document.getElementById('real-email');
    const formDetector = new FormDetector(document, realEmail as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();
    expect(form?.emailField?.id).toBe('real-email');
    expect(form?.passwordField?.id).toBe('real-password');

    // Should not detect fake fields
    expect(form?.emailField?.name).not.toBe('fake1');
    expect(form?.passwordField?.name).not.toBe('fake1pass');
  });

  it('should ignore fields in width:0 container', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const realEmail = document.getElementById('real-email');
    const formDetector = new FormDetector(document, realEmail as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();
    expect(form?.emailField?.name).not.toBe('fake2');
    expect(form?.passwordField?.name).not.toBe('fake2pass');
  });

  it('should ignore fields positioned off-screen', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const realEmail = document.getElementById('real-email');
    const formDetector = new FormDetector(document, realEmail as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();
    expect(form?.emailField?.name).not.toBe('fake3');
    expect(form?.passwordField?.name).not.toBe('fake3pass');
  });

  it('should ignore honeypot fields', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const realEmail = document.getElementById('real-email');
    const formDetector = new FormDetector(document, realEmail as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();
    expect(form?.emailField?.name).not.toBe('honeypot');
    expect(form?.emailField?.name).not.toBe('hp-field');
    expect(form?.emailField?.name).not.toBe('bot_check');
    expect(form?.emailField?.name).not.toBe('antispam-field');
  });

  it('should ignore fields with aria-hidden="true"', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const realEmail = document.getElementById('real-email');
    const formDetector = new FormDetector(document, realEmail as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();
    expect(form?.emailField?.name).not.toBe('hidden-username');
    expect(form?.passwordField?.name).not.toBe('hidden-password');
  });

  it('should ignore fields with role="presentation"', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const realEmail = document.getElementById('real-email');
    const formDetector = new FormDetector(document, realEmail as HTMLElement);
    const form = formDetector.getForm();

    expect(form).toBeTruthy();
    expect(form?.emailField?.name).not.toBe('presentation-field');
  });

  it('should not trigger autofill on fake field with tabindex=-1', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const fakeField = document.querySelector('input[name="fake1"]');
    const formDetector = new FormDetector(document, fakeField as HTMLElement);

    expect(formDetector.isAutofillTriggerableField()).toBe(false);
  });

  it('should not trigger autofill on honeypot field', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const honeypotField = document.querySelector('input[name="honeypot"]');
    const formDetector = new FormDetector(document, honeypotField as HTMLElement);

    expect(formDetector.isAutofillTriggerableField()).toBe(false);
  });

  it('should trigger autofill on real email field', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const realEmail = document.getElementById('real-email');
    const formDetector = new FormDetector(document, realEmail as HTMLElement);

    expect(formDetector.isAutofillTriggerableField()).toBe(true);
  });

  it('should trigger autofill on real password field', () => {
    const dom = createTestDom(htmlFile);
    const document = dom.window.document;

    const realPassword = document.getElementById('real-password');
    const formDetector = new FormDetector(document, realPassword as HTMLElement);

    expect(formDetector.isAutofillTriggerableField()).toBe(true);
  });
});
