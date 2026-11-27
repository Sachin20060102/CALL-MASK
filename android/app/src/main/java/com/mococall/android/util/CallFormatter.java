package com.mococall.android.util;

import java.util.Locale;

public final class CallFormatter {
    private CallFormatter() {}

    public static String formatDuration(int totalSeconds) {
        int safe = Math.max(0, totalSeconds);
        int hours = safe / 3600;
        int minutes = (safe % 3600) / 60;
        int seconds = safe % 60;
        if (hours > 0) {
            return String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds);
        }
        return String.format(Locale.US, "%02d:%02d", minutes, seconds);
    }

    public static boolean isTerminalStatus(String status) {
        if (status == null) return false;
        return "COMPLETED".equals(status)
                || "FAILED".equals(status)
                || "CANCELED".equals(status)
                || "BLOCKED".equals(status);
    }
}
