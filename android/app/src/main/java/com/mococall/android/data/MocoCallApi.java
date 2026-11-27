package com.mococall.android.data;

import com.mococall.android.data.model.ApiModels;
import java.util.Map;
import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.PATCH;
import retrofit2.http.POST;
import retrofit2.http.Path;
import retrofit2.http.Query;

public interface MocoCallApi {
    @POST("auth/login")
    Call<ApiModels.AuthResponse> login(@Body ApiModels.LoginRequest body);

    @POST("auth/register")
    Call<ApiModels.AuthResponse> register(@Body ApiModels.RegisterRequest body);

    @POST("auth/logout")
    Call<Map<String, Object>> logout(@Body ApiModels.LogoutRequest body);

    @GET("account/me")
    Call<ApiModels.AccountMeResponse> me();

    @PATCH("account/settings")
    Call<ApiModels.UserResponse> updateSettings(@Body ApiModels.SettingsUpdateRequest body);

    @GET("caller-ids")
    Call<ApiModels.CallerIdsResponse> getCallerIds();

    @GET("usage/summary")
    Call<ApiModels.UsageSummaryDto> getUsageSummary();

    @POST("calls")
    Call<ApiModels.InitiateCallResponse> initiateCall(@Body ApiModels.InitiateCallRequest body);

    @GET("calls")
    Call<ApiModels.CallsPageResponse> getCalls(@Query("page") int page, @Query("limit") int limit);

    @GET("calls/{id}")
    Call<ApiModels.CallResponse> getCall(@Path("id") String id);

    @POST("calls/{id}/mute")
    Call<ApiModels.CallResponse> muteCall(
            @Path("id") String id,
            @Body ApiModels.MuteCallRequest body);

    @POST("calls/{id}/end")
    Call<ApiModels.CallResponse> endCall(
            @Path("id") String id,
            @Body Map<String, Object> empty);
}
