package com.mococall.android.util;

import java.util.regex.Pattern;

public final class InputValidator {
    private static final Pattern E164_PATTERN = Pattern.compile("^\\+[1-9]\\d{6,14}$");

    private InputValidator() {}

    public static boolean isValidE164(String phoneNumber) {
        if (phoneNumber == null) return false;
        return E164_PATTERN.matcher(phoneNumber.trim()).matches();
    }

    public static boolean isValidEmail(String email) {
        if (email == null) return false;
        String trimmed = email.trim();
        return trimmed.contains("@") && trimmed.indexOf('@') > 0 && trimmed.indexOf('.', trimmed.indexOf('@')) > 0;
    }
}
