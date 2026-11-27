package com.mococall.android.ui.dialer;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
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
import com.mococall.android.util.CallFormatter;
import com.mococall.android.util.InputValidator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class DialerFragment extends Fragment {
    private Spinner spinnerCallerId;
    private EditText etDestination;
    private Button btnPlaceCall;
    private LinearLayout cardActiveCall;
    private TextView tvDialerError;
    private TextView tvCallStatus;
    private TextView tvCallDestination;
    private TextView tvCallCallerId;
    private TextView tvCallProviderId;
    private TextView tvCallDuration;
    private Button btnToggleMute;
    private Button btnEndCall;

    private MocoCallApi api;
    private final List<ApiModels.CallerIdDto> callerIdList = new ArrayList<>();
    private ApiModels.CallRecordDto activeCall;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (activeCall != null && !CallFormatter.isTerminalStatus(activeCall.status)) {
                refreshActiveCall();
                handler.postDelayed(this, 1200);
            }
        }
    };

    @Nullable
    @Override
    public View onCreateView(
            @NonNull LayoutInflater inflater,
            @Nullable ViewGroup container,
            @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_dialer, container, false);
        spinnerCallerId = view.findViewById(R.id.spinnerCallerId);
        etDestination = view.findViewById(R.id.etDestination);
        btnPlaceCall = view.findViewById(R.id.btnPlaceCall);
        cardActiveCall = view.findViewById(R.id.cardActiveCall);
        tvDialerError = view.findViewById(R.id.tvDialerError);
        tvCallStatus = view.findViewById(R.id.tvCallStatus);
        tvCallDestination = view.findViewById(R.id.tvCallDestination);
        tvCallCallerId = view.findViewById(R.id.tvCallCallerId);
        tvCallProviderId = view.findViewById(R.id.tvCallProviderId);
        tvCallDuration = view.findViewById(R.id.tvCallDuration);
        btnToggleMute = view.findViewById(R.id.btnToggleMute);
        btnEndCall = view.findViewById(R.id.btnEndCall);

        api = ApiClient.create(new SessionManager(requireContext()));

        btnPlaceCall.setOnClickListener(v -> initiateCall());
        btnToggleMute.setOnClickListener(v -> toggleMute());
        btnEndCall.setOnClickListener(v -> endCall());

        loadCallerIds();
        return view;
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        handler.removeCallbacks(pollRunnable);
    }

    private void loadCallerIds() {
        api.getCallerIds().enqueue(new Callback<ApiModels.CallerIdsResponse>() {
            @Override
            public void onResponse(
                    Call<ApiModels.CallerIdsResponse> call,
                    Response<ApiModels.CallerIdsResponse> response) {
                if (!isAdded()) return;
                if (response.isSuccessful() && response.body() != null && response.body().callerIds != null) {
                    callerIdList.clear();
                    callerIdList.addAll(response.body().callerIds);
                    ArrayAdapter<ApiModels.CallerIdDto> adapter = new ArrayAdapter<>(
                            requireContext(),
                            android.R.layout.simple_spinner_item,
                            callerIdList);
                    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
                    spinnerCallerId.setAdapter(adapter);
                }
            }

            @Override
            public void onFailure(Call<ApiModels.CallerIdsResponse> call, Throwable t) {
                if (!isAdded()) return;
                showError("Failed to load authorized caller IDs.");
            }
        });
    }

    private void initiateCall() {
        if (callerIdList.isEmpty()) {
            showError("No authorized caller IDs available.");
            return;
        }
        String dest = etDestination.getText().toString().trim();
        if (!InputValidator.isValidE164(dest)) {
            showError("Enter a valid E.164 destination number (e.g. +12025550144).");
            return;
        }

        ApiModels.CallerIdDto selected = (ApiModels.CallerIdDto) spinnerCallerId.getSelectedItem();
        if (selected == null) return;

        tvDialerError.setVisibility(View.GONE);
        btnPlaceCall.setEnabled(false);

        api.initiateCall(new ApiModels.InitiateCallRequest(selected.id, dest))
                .enqueue(new Callback<ApiModels.InitiateCallResponse>() {
                    @Override
                    public void onResponse(
                            Call<ApiModels.InitiateCallResponse> call,
                            Response<ApiModels.InitiateCallResponse> response) {
                        if (!isAdded()) return;
                        btnPlaceCall.setEnabled(true);
                        if (response.isSuccessful() && response.body() != null) {
                            activeCall = response.body().call;
                            btnToggleMute.setVisibility(response.body().supportsMute ? View.VISIBLE : View.GONE);
                            renderActiveCall();
                            handler.removeCallbacks(pollRunnable);
                            handler.postDelayed(pollRunnable, 800);
                        } else {
                            showError(ApiClient.parseErrorMessage(response, "Unable to initiate call."));
                        }
                    }

                    @Override
                    public void onFailure(Call<ApiModels.InitiateCallResponse> call, Throwable t) {
                        if (!isAdded()) return;
                        btnPlaceCall.setEnabled(true);
                        showError("Network error: " + t.getMessage());
                    }
                });
    }

    private void refreshActiveCall() {
        if (activeCall == null) return;
        api.getCall(activeCall.id).enqueue(new Callback<ApiModels.CallResponse>() {
            @Override
            public void onResponse(
                    Call<ApiModels.CallResponse> call,
                    Response<ApiModels.CallResponse> response) {
                if (!isAdded()) return;
                if (response.isSuccessful() && response.body() != null) {
                    activeCall = response.body().call;
                    renderActiveCall();
                }
            }

            @Override
            public void onFailure(Call<ApiModels.CallResponse> call, Throwable t) {}
        });
    }

    private void toggleMute() {
        if (activeCall == null) return;
        api.muteCall(activeCall.id, new ApiModels.MuteCallRequest(!activeCall.muted))
                .enqueue(new Callback<ApiModels.CallResponse>() {
                    @Override
                    public void onResponse(
                            Call<ApiModels.CallResponse> call,
                            Response<ApiModels.CallResponse> response) {
                        if (!isAdded()) return;
                        if (response.isSuccessful() && response.body() != null) {
                            activeCall = response.body().call;
                            renderActiveCall();
                        }
                    }

                    @Override
                    public void onFailure(Call<ApiModels.CallResponse> call, Throwable t) {}
                });
    }

    private void endCall() {
        if (activeCall == null) return;
        api.endCall(activeCall.id, Collections.emptyMap())
                .enqueue(new Callback<ApiModels.CallResponse>() {
                    @Override
                    public void onResponse(
                            Call<ApiModels.CallResponse> call,
                            Response<ApiModels.CallResponse> response) {
                        if (!isAdded()) return;
                        if (response.isSuccessful() && response.body() != null) {
                            activeCall = response.body().call;
                            renderActiveCall();
                        }
                    }

                    @Override
                    public void onFailure(Call<ApiModels.CallResponse> call, Throwable t) {}
                });
    }

    private void renderActiveCall() {
        if (activeCall == null) {
            cardActiveCall.setVisibility(View.GONE);
            return;
        }
        cardActiveCall.setVisibility(View.VISIBLE);
        tvCallStatus.setText(activeCall.status + " (" + activeCall.mode + ")");
        tvCallDestination.setText(activeCall.destinationNumber);
        tvCallCallerId.setText("Caller ID: " + activeCall.callerIdNumber);
        tvCallProviderId.setText("Provider Call ID: " + (activeCall.providerCallId != null ? activeCall.providerCallId : "—"));
        tvCallDuration.setText(CallFormatter.formatDuration(activeCall.durationSeconds));

        boolean active = !CallFormatter.isTerminalStatus(activeCall.status);
        btnToggleMute.setEnabled(active);
        btnToggleMute.setText(activeCall.muted ? R.string.unmute_call : R.string.mute_call);
        btnEndCall.setEnabled(active);
    }

    private void showError(String msg) {
        tvDialerError.setText(msg);
        tvDialerError.setVisibility(View.VISIBLE);
    }
}
