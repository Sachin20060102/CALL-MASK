package com.mococall.android.ui.dashboard;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.mococall.android.R;
import com.mococall.android.data.ApiClient;
import com.mococall.android.data.MocoCallApi;
import com.mococall.android.data.SessionManager;
import com.mococall.android.data.model.ApiModels;
import com.mococall.android.ui.main.MainActivity;
import com.mococall.android.util.CallFormatter;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class DashboardFragment extends Fragment {
    private SwipeRefreshLayout swipeRefresh;
    private TextView tvTelephonyBanner;
    private TextView tvTotalCalls;
    private TextView tvCompletedCalls;
    private TextView tvFailedCalls;
    private TextView tvTotalDuration;
    private TextView tvAvgDuration;
    private TextView tvDailyQuota;
    private ProgressBar progressDailyQuota;
    private TextView tvMonthlyQuota;
    private ProgressBar progressMonthlyQuota;
    private MocoCallApi api;

    @Nullable
    @Override
    public View onCreateView(
            @NonNull LayoutInflater inflater,
            @Nullable ViewGroup container,
            @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_dashboard, container, false);
        swipeRefresh = view.findViewById(R.id.swipeRefresh);
        tvTelephonyBanner = view.findViewById(R.id.tvTelephonyBanner);
        tvTotalCalls = view.findViewById(R.id.tvTotalCalls);
        tvCompletedCalls = view.findViewById(R.id.tvCompletedCalls);
        tvFailedCalls = view.findViewById(R.id.tvFailedCalls);
        tvTotalDuration = view.findViewById(R.id.tvTotalDuration);
        tvAvgDuration = view.findViewById(R.id.tvAvgDuration);
        tvDailyQuota = view.findViewById(R.id.tvDailyQuota);
        progressDailyQuota = view.findViewById(R.id.progressDailyQuota);
        tvMonthlyQuota = view.findViewById(R.id.tvMonthlyQuota);
        progressMonthlyQuota = view.findViewById(R.id.progressMonthlyQuota);
        Button btnOpenDialer = view.findViewById(R.id.btnOpenDialer);

        api = ApiClient.create(new SessionManager(requireContext()));

        swipeRefresh.setOnRefreshListener(this::loadUsage);
        btnOpenDialer.setOnClickListener(v -> {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).navigateToDialer();
            }
        });

        loadUsage();
        return view;
    }

    private void loadUsage() {
        swipeRefresh.setRefreshing(true);
        api.getUsageSummary().enqueue(new Callback<ApiModels.UsageSummaryDto>() {
            @Override
            public void onResponse(
                    Call<ApiModels.UsageSummaryDto> call,
                    Response<ApiModels.UsageSummaryDto> response) {
                if (!isAdded()) return;
                swipeRefresh.setRefreshing(false);
                if (response.isSuccessful() && response.body() != null) {
                    bindUsage(response.body());
                }
            }

            @Override
            public void onFailure(Call<ApiModels.UsageSummaryDto> call, Throwable t) {
                if (!isAdded()) return;
                swipeRefresh.setRefreshing(false);
            }
        });
    }

    private void bindUsage(ApiModels.UsageSummaryDto summary) {
        if (summary.telephonyEnabled) {
            tvTelephonyBanner.setText("Live VoIP/SIP Mode Active (" + summary.telephonyMode + ")");
        } else {
            tvTelephonyBanner.setText(R.string.telephony_mock_banner);
        }
        tvTotalCalls.setText("Total Calls: " + summary.totalCalls);
        tvCompletedCalls.setText("Completed: " + summary.completedCalls);
        tvFailedCalls.setText("Failed: " + summary.failedCalls);
        tvTotalDuration.setText("Total Duration: " + CallFormatter.formatDuration(summary.totalDurationSeconds));
        tvAvgDuration.setText("Average Duration: " + CallFormatter.formatDuration(summary.averageDurationSeconds));

        tvDailyQuota.setText("Daily Calls: " + summary.todayCalls + " / " + summary.dailyCallLimit);
        int dailyPct = Math.min(100, (summary.todayCalls * 100) / Math.max(1, summary.dailyCallLimit));
        progressDailyQuota.setProgress(dailyPct);

        tvMonthlyQuota.setText("Monthly Quota: " + summary.monthCalls + " / " + summary.monthlyCallQuota);
        int monthlyPct = Math.min(100, (summary.monthCalls * 100) / Math.max(1, summary.monthlyCallQuota));
        progressMonthlyQuota.setProgress(monthlyPct);
    }
}
