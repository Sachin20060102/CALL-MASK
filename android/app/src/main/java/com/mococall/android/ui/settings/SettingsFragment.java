package com.mococall.android.ui.settings;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import com.mococall.android.R;
import com.mococall.android.data.ApiClient;
import com.mococall.android.data.MocoCallApi;
import com.mococall.android.data.SessionManager;
import com.mococall.android.data.model.ApiModels;
import com.mococall.android.ui.auth.LoginActivity;
import com.mococall.android.util.CallFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class SettingsFragment extends Fragment {
    private TextView tvProfileEmail;
    private TextView tvAccountStatus;
    private TextView tvLimitsSummary;
    private TextView tvSettingsFeedback;
    private EditText etSettingsFullName;
    private Spinner spinnerDefaultCallerId;
    private EditText etCurrentPassword;
    private EditText etNewPassword;
    private SessionManager sessionManager;
    private MocoCallApi api;
    private final List<ApiModels.CallerIdDto> callerIds = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(
            @NonNull LayoutInflater inflater,
            @Nullable ViewGroup container,
            @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_settings, container, false);
        tvProfileEmail = view.findViewById(R.id.tvProfileEmail);
        tvAccountStatus = view.findViewById(R.id.tvAccountStatus);
        tvLimitsSummary = view.findViewById(R.id.tvLimitsSummary);
        tvSettingsFeedback = view.findViewById(R.id.tvSettingsFeedback);
        etSettingsFullName = view.findViewById(R.id.etSettingsFullName);
        spinnerDefaultCallerId = view.findViewById(R.id.spinnerDefaultCallerId);
        etCurrentPassword = view.findViewById(R.id.etCurrentPassword);
        etNewPassword = view.findViewById(R.id.etNewPassword);
        Button btnSaveSettings = view.findViewById(R.id.btnSaveSettings);
        Button btnLogout = view.findViewById(R.id.btnLogout);

        sessionManager = new SessionManager(requireContext());
        api = ApiClient.create(sessionManager);

        btnSaveSettings.setOnClickListener(v -> saveSettings());
        btnLogout.setOnClickListener(v -> performLogout());

        loadProfileAndCallerIds();
        return view;
    }

    private void loadProfileAndCallerIds() {
        api.me().enqueue(new Callback<ApiModels.AccountMeResponse>() {
            @Override
            public void onResponse(
                    Call<ApiModels.AccountMeResponse> call,
                    Response<ApiModels.AccountMeResponse> response) {
                if (!isAdded()) return;
                if (response.isSuccessful() && response.body() != null) {
                    ApiModels.AccountMeResponse body = response.body();
                    tvProfileEmail.setText("Email: " + body.user.email);
                    tvAccountStatus.setText("Status: " + body.user.status);
                    etSettingsFullName.setText(body.user.fullName);
                    if (body.limits != null) {
                        tvLimitsSummary.setText("Max Duration: "
                                + CallFormatter.formatDuration(body.limits.maxCallDurationSeconds)
                                + " • Daily Limit: " + body.limits.dailyCallLimit
                                + " • Monthly Quota: " + body.limits.monthlyCallQuota);
                    }
                }
            }

            @Override
            public void onFailure(Call<ApiModels.AccountMeResponse> call, Throwable t) {}
        });

        api.getCallerIds().enqueue(new Callback<ApiModels.CallerIdsResponse>() {
            @Override
            public void onResponse(
                    Call<ApiModels.CallerIdsResponse> call,
                    Response<ApiModels.CallerIdsResponse> response) {
                if (!isAdded()) return;
                if (response.isSuccessful() && response.body() != null && response.body().callerIds != null) {
                    callerIds.clear();
                    callerIds.addAll(response.body().callerIds);
                    ArrayAdapter<ApiModels.CallerIdDto> adapter = new ArrayAdapter<>(
                            requireContext(),
                            android.R.layout.simple_spinner_item,
                            callerIds);
                    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
                    spinnerDefaultCallerId.setAdapter(adapter);
                }
            }

            @Override
            public void onFailure(Call<ApiModels.CallerIdsResponse> call, Throwable t) {}
        });
    }

    private void saveSettings() {
        String fullName = etSettingsFullName.getText().toString().trim();
        String curPw = etCurrentPassword.getText().toString();
        String newPw = etNewPassword.getText().toString();
        ApiModels.CallerIdDto selectedCid = (ApiModels.CallerIdDto) spinnerDefaultCallerId.getSelectedItem();

        ApiModels.SettingsUpdateRequest req = new ApiModels.SettingsUpdateRequest(
                fullName.isEmpty() ? null : fullName,
                selectedCid != null ? selectedCid.id : null,
                newPw.isEmpty() ? null : curPw,
                newPw.isEmpty() ? null : newPw);

        api.updateSettings(req).enqueue(new Callback<ApiModels.UserResponse>() {
            @Override
            public void onResponse(
                    Call<ApiModels.UserResponse> call,
                    Response<ApiModels.UserResponse> response) {
                if (!isAdded()) return;
                if (response.isSuccessful()) {
                    etCurrentPassword.setText("");
                    etNewPassword.setText("");
                    showFeedback("Settings updated successfully.");
                } else {
                    showFeedback(ApiClient.parseErrorMessage(response, "Unable to update settings."));
                }
            }

            @Override
            public void onFailure(Call<ApiModels.UserResponse> call, Throwable t) {
                if (!isAdded()) return;
                showFeedback("Network error: " + t.getMessage());
            }
        });
    }

    private void performLogout() {
        String refresh = sessionManager.getRefreshToken();
        if (refresh != null && !refresh.isEmpty()) {
            api.logout(new ApiModels.LogoutRequest(refresh)).enqueue(new Callback<Map<String, Object>>() {
                @Override
                public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {}

                @Override
                public void onFailure(Call<Map<String, Object>> call, Throwable t) {}
            });
        }
        sessionManager.clear();
        Intent intent = new Intent(requireContext(), LoginActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
    }

    private void showFeedback(String msg) {
        tvSettingsFeedback.setText(msg);
        tvSettingsFeedback.setVisibility(View.VISIBLE);
    }
}
