package com.mococall.android.data.model;

import java.util.List;

public final class ApiModels {
    private ApiModels() {}

    public static class LoginRequest {
        public final String email;
        public final String password;

        public LoginRequest(String email, String password) {
            this.email = email;
            this.password = password;
        }
    }

    public static class RegisterRequest {
        public final String email;
        public final String password;
        public final String fullName;

        public RegisterRequest(String email, String password, String fullName) {
            this.email = email;
            this.password = password;
            this.fullName = fullName;
        }
    }

    public static class LogoutRequest {
        public final String refreshToken;

        public LogoutRequest(String refreshToken) {
            this.refreshToken = refreshToken;
        }
    }

    public static class InitiateCallRequest {
        public final String callerIdId;
        public final String destinationNumber;

        public InitiateCallRequest(String callerIdId, String destinationNumber) {
            this.callerIdId = callerIdId;
            this.destinationNumber = destinationNumber;
        }
    }

    public static class MuteCallRequest {
        public final boolean muted;

        public MuteCallRequest(boolean muted) {
            this.muted = muted;
        }
    }

    public static class SettingsUpdateRequest {
        public final String fullName;
        public final String defaultCallerIdId;
        public final String currentPassword;
        public final String newPassword;

        public SettingsUpdateRequest(
                String fullName,
                String defaultCallerIdId,
                String currentPassword,
                String newPassword) {
            this.fullName = fullName;
            this.defaultCallerIdId = defaultCallerIdId;
            this.currentPassword = currentPassword;
            this.newPassword = newPassword;
        }
    }

    public static class UserDto {
        public String id;
        public String email;
        public String fullName;
        public String role;
        public String status;
        public String defaultCallerIdId;
    }

    public static class AccountLimitsDto {
        public int maxCallDurationSeconds;
        public int dailyCallLimit;
        public int monthlyCallQuota;
    }

    public static class AuthResponse {
        public UserDto user;
        public String accessToken;
        public String refreshToken;
    }

    public static class AccountMeResponse {
        public UserDto user;
        public AccountLimitsDto limits;
    }

    public static class UserResponse {
        public UserDto user;
    }

    public static class ProviderSummaryDto {
        public String id;
        public String name;
        public String code;
        public String protocol;
    }

    public static class CallerIdDto {
        public String id;
        public String phoneNumber;
        public String label;
        public boolean isDefault;
        public ProviderSummaryDto provider;

        @Override
        public String toString() {
            return phoneNumber + " — " + label;
        }
    }

    public static class CallerIdsResponse {
        public List<CallerIdDto> callerIds;
    }

    public static class CallRecordDto {
        public String id;
        public String callerIdNumber;
        public String destinationNumber;
        public String providerCallId;
        public String mode;
        public String status;
        public boolean muted;
        public String startedAt;
        public String answeredAt;
        public String endedAt;
        public int durationSeconds;
        public String terminationReason;
    }

    public static class InitiateCallResponse {
        public CallRecordDto call;
        public int maxDurationSeconds;
        public boolean supportsMute;
    }

    public static class CallResponse {
        public CallRecordDto call;
    }

    public static class CallsPageResponse {
        public List<CallRecordDto> items;
    }

    public static class UsageSummaryDto {
        public int totalCalls;
        public int completedCalls;
        public int failedCalls;
        public int activeCalls;
        public int totalDurationSeconds;
        public int averageDurationSeconds;
        public int todayCalls;
        public int dailyCallLimit;
        public int monthCalls;
        public int monthlyCallQuota;
        public int maxCallDurationSeconds;
        public boolean telephonyEnabled;
        public String telephonyMode;
    }

    public static class ApiErrorBody {
        public ErrorDetail error;

        public static class ErrorDetail {
            public String code;
            public String message;
        }
    }
}
