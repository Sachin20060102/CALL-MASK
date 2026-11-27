package com.mococall.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.mococall.android.util.CallFormatter;
import org.junit.Test;

public class CallFormatterTest {
    @Test
    public void formatDuration_formatsSecondsMinutesAndHours() {
        assertEquals("00:00", CallFormatter.formatDuration(0));
        assertEquals("00:00", CallFormatter.formatDuration(-5));
        assertEquals("01:05", CallFormatter.formatDuration(65));
        assertEquals("01:01:05", CallFormatter.formatDuration(3665));
    }

    @Test
    public void isTerminalStatus_detectsFinishedStates() {
        assertTrue(CallFormatter.isTerminalStatus("COMPLETED"));
        assertTrue(CallFormatter.isTerminalStatus("FAILED"));
        assertTrue(CallFormatter.isTerminalStatus("CANCELED"));
        assertTrue(CallFormatter.isTerminalStatus("BLOCKED"));
        assertFalse(CallFormatter.isTerminalStatus("RINGING"));
        assertFalse(CallFormatter.isTerminalStatus("IN_PROGRESS"));
        assertFalse(CallFormatter.isTerminalStatus(null));
    }
}
