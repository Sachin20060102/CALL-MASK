package com.mococall.android.ui.history;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.mococall.android.R;
import com.mococall.android.data.model.ApiModels;
import com.mococall.android.util.CallFormatter;
import java.util.ArrayList;
import java.util.List;

public class CallHistoryAdapter extends RecyclerView.Adapter<CallHistoryAdapter.ViewHolder> {
    private final List<ApiModels.CallRecordDto> items = new ArrayList<>();

    public void setItems(List<ApiModels.CallRecordDto> newItems) {
        items.clear();
        if (newItems != null) {
            items.addAll(newItems);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_call_record, parent, false);
        return new ViewHolder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        ApiModels.CallRecordDto item = items.get(position);
        holder.tvDestination.setText(item.destinationNumber);
        holder.tvStatus.setText(item.status);
        holder.tvCallerId.setText("From: " + item.callerIdNumber + " (" + item.mode + ")");
        holder.tvDuration.setText("Duration: " + CallFormatter.formatDuration(item.durationSeconds));
        holder.tvTimestamps.setText("Started: " + (item.startedAt != null ? item.startedAt : "—"));
        holder.tvProviderCallId.setText("Provider ID: " + (item.providerCallId != null ? item.providerCallId : "—"));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        final TextView tvDestination;
        final TextView tvStatus;
        final TextView tvCallerId;
        final TextView tvDuration;
        final TextView tvTimestamps;
        final TextView tvProviderCallId;

        ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvDestination = itemView.findViewById(R.id.tvItemDestination);
            tvStatus = itemView.findViewById(R.id.tvItemStatus);
            tvCallerId = itemView.findViewById(R.id.tvItemCallerId);
            tvDuration = itemView.findViewById(R.id.tvItemDuration);
            tvTimestamps = itemView.findViewById(R.id.tvItemTimestamps);
            tvProviderCallId = itemView.findViewById(R.id.tvItemProviderCallId);
        }
    }
}
