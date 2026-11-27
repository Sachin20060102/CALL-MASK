package com.mococall.android.ui.history;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.mococall.android.R;
import com.mococall.android.data.ApiClient;
import com.mococall.android.data.MocoCallApi;
import com.mococall.android.data.SessionManager;
import com.mococall.android.data.model.ApiModels;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class CallHistoryFragment extends Fragment {
    private SwipeRefreshLayout swipeHistory;
    private TextView tvHistoryEmpty;
    private CallHistoryAdapter adapter;
    private MocoCallApi api;

    @Nullable
    @Override
    public View onCreateView(
            @NonNull LayoutInflater inflater,
            @Nullable ViewGroup container,
            @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_call_history, container, false);
        swipeHistory = view.findViewById(R.id.swipeHistory);
        tvHistoryEmpty = view.findViewById(R.id.tvHistoryEmpty);
        RecyclerView rvCallHistory = view.findViewById(R.id.rvCallHistory);

        adapter = new CallHistoryAdapter();
        rvCallHistory.setLayoutManager(new LinearLayoutManager(requireContext()));
        rvCallHistory.setAdapter(adapter);

        api = ApiClient.create(new SessionManager(requireContext()));
        swipeHistory.setOnRefreshListener(this::loadHistory);

        loadHistory();
        return view;
    }

    private void loadHistory() {
        swipeHistory.setRefreshing(true);
        api.getCalls(1, 50).enqueue(new Callback<ApiModels.CallsPageResponse>() {
            @Override
            public void onResponse(
                    Call<ApiModels.CallsPageResponse> call,
                    Response<ApiModels.CallsPageResponse> response) {
                if (!isAdded()) return;
                swipeHistory.setRefreshing(false);
                if (response.isSuccessful() && response.body() != null) {
                    adapter.setItems(response.body().items);
                    boolean empty = response.body().items == null || response.body().items.isEmpty();
                    tvHistoryEmpty.setVisibility(empty ? View.VISIBLE : View.GONE);
                }
            }

            @Override
            public void onFailure(Call<ApiModels.CallsPageResponse> call, Throwable t) {
                if (!isAdded()) return;
                swipeHistory.setRefreshing(false);
            }
        });
    }
}
