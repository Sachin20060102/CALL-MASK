package com.mococall.android;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.mococall.android.util.InputValidator;
import org.junit.Test;

public class InputValidatorTest {
    @Test
    public void isValidE164_validatesInternationalPhoneNumbers() {
        assertTrue(InputValidator.isValidE164("+14155550101"));
        assertTrue(InputValidator.isValidE164("+442079460958"));
        assertFalse(InputValidator.isValidE164("14155550101"));
        assertFalse(InputValidator.isValidE164("+01234567"));
        assertFalse(InputValidator.isValidE164("invalid"));
    }

    @Test
    public void isValidEmail_validatesBasicEmailSyntax() {
        assertTrue(InputValidator.isValidEmail("operator@mococall.local"));
        assertFalse(InputValidator.isValidEmail("not-an-email"));
        assertFalse(InputValidator.isValidEmail("@missing.com"));
    }
}
